import { Table, PlayingCard, HandStatus, SideBets, SeatResult } from '../store/gameStore';
import { gameRules } from '../config/gameRules';
import { tablesDb, delay } from './db';
import { botApi } from './botApi';

const calculateScore = (cards: PlayingCard[]): number => {
  let score = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.isHidden) continue;
    if (c.value === 'A') {
      aces += 1;
      score += 11;
    } else if (['J', 'Q', 'K'].includes(c.value)) {
      score += 10;
    } else {
      score += parseInt(c.value);
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
};

const checkPair = (c1: PlayingCard, c2: PlayingCard): number => {
  if (c1.value !== c2.value) return 0;
  if (c1.suit === c2.suit) return gameRules.sideBets.perfectPair.perfect;
  const c1Color = (c1.suit === 'hearts' || c1.suit === 'diamonds') ? 'red' : 'black';
  const c2Color = (c2.suit === 'hearts' || c2.suit === 'diamonds') ? 'red' : 'black';
  if (c1Color === c2Color) return gameRules.sideBets.perfectPair.colored;
  return gameRules.sideBets.perfectPair.mixed;
}

const check21Plus3 = (c1: PlayingCard, c2: PlayingCard, dealerUp: PlayingCard): number => {
  const cards = [c1, c2, dealerUp];
  const suits = cards.map(c => c.suit);
  const values = cards.map(c => c.value);
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
  
  const valueMap: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  const sortedVals = values.map(v => valueMap[v]).sort((a,b) => a - b);
  const isStraight = (sortedVals[0] + 1 === sortedVals[1] && sortedVals[1] + 1 === sortedVals[2]) ||
                     (sortedVals[0] === 2 && sortedVals[1] === 3 && sortedVals[2] === 14);

  const isThreeOfAKind = values[0] === values[1] && values[1] === values[2];

  if (isThreeOfAKind && isFlush) return gameRules.sideBets.twentyOnePlusThree.suitedThreeOfAKind;
  if (isStraight && isFlush) return gameRules.sideBets.twentyOnePlusThree.straightFlush;
  if (isThreeOfAKind) return gameRules.sideBets.twentyOnePlusThree.threeOfAKind;
  if (isStraight) return gameRules.sideBets.twentyOnePlusThree.straight;
  if (isFlush) return gameRules.sideBets.twentyOnePlusThree.flush;
  return 0;
}

const getVRFDeck = async (): Promise<PlayingCard[]> => {
  await delay(800);
  const suits: ('hearts' | 'diamonds' | 'clubs' | 'spades')[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values: ('2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A')[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: PlayingCard[] = [];
  for (let i = 0; i < gameRules.deckCount; i++) {
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

export const gameApi = {
  async joinTable(tableId: string, userId: string, seatIndex: number, lockAmount: number = 0, currency: 'Gcoin' | 'Bonus' = 'Gcoin'): Promise<Table> {
    await delay(300);
    const table = tablesDb[tableId];
    if (table.seats[seatIndex].userId === null) {
      table.seats[seatIndex].userId = userId;
      if (!table.userBalances[userId]) {
        table.userBalances[userId] = { balance: 0, initialBuyIn: 0, currency };
      }
      
      let chipsToAdd = lockAmount;
      if (lockAmount > 0 && table.settings.mode === 'tournament') {
        chipsToAdd = table.settings.tournament?.startingChips || 0;
      }

      table.userBalances[userId].balance += chipsToAdd;
      table.userBalances[userId].initialBuyIn += chipsToAdd; // For tournament, this tracks if they bought in.
    }
    
    botApi.arrangeBots(table);
    
    return JSON.parse(JSON.stringify(table));
  },

  async leaveTable(tableId: string, userId: string, seatIndex?: number, isTimeout?: boolean): Promise<{ table: Table, refundedAmount: number }> {
    await delay(300);
    const table = tablesDb[tableId];
    if (!table) throw new Error("Not found");
    
    let turnAdvancedFrom = -1;

    table.seats = table.seats.map((s, i) => {
      if (s.userId === userId && (seatIndex === undefined || i === seatIndex)) {
        // If this is a timeout-based unseat, we only do it if the user isn't actually ready.
        if (isTimeout && s.isReady) {
            return s;
        }
        
        if (s.isReady && s.hand && table.userBalances[userId]) {
           const refund = s.hand.bet + (s.hand.sideBets?.pair || 0) + (s.hand.sideBets?.twentyOnePlusThree || 0) + (s.hand.insuranceBet || 0);
           table.userBalances[userId].balance += refund;
        }
        
        if (table.currentTurnIndex === i) {
           turnAdvancedFrom = i;
        }

        return { ...s, userId: null, hand: null, isReady: false };
      }
      return s;
    });

    if (turnAdvancedFrom !== -1 && table.status === 'playing') {
      table.currentTurnIndex = -1;
      for (let i = turnAdvancedFrom - 1; i >= 0; i--) {
        if (table.seats[i].isReady && ['playing'].includes(table.seats[i].hand?.status || '')) {
          table.currentTurnIndex = i;
          break;
        }
      }
    }
    
    // Check if user is fully disconnected from all seats.
    // However, user handles balance manually now, so returning 0.
    if (table.status !== 'playing') {
      botApi.arrangeBots(table);
    }
    
    return { table: JSON.parse(JSON.stringify(table)), refundedAmount: 0 };
  },

  async unlockTableBalance(tableId: string, userId: string): Promise<{ table: Table, refundedAmount: number, currency: 'Gcoin' | 'Bonus' }> {
    await delay(300);
    const table = tablesDb[tableId];
    if (!table) throw new Error("Not found");

    // Unseat from all seats first? User can still be watching?
    // Wait, if they unlock balance, they probably can't play anymore.
    // Unseat them from any connected seats.
    let turnAdvancedFrom = -1;
    table.seats = table.seats.map((s, i) => {
      if (s.userId === userId) {
        if (table.currentTurnIndex === i) {
           turnAdvancedFrom = i;
        }
        return { ...s, userId: null, hand: null, isReady: false };
      }
      return s;
    });

    if (turnAdvancedFrom !== -1 && table.status === 'playing') {
      table.currentTurnIndex = -1;
      for (let i = turnAdvancedFrom - 1; i >= 0; i--) {
        if (table.seats[i].isReady && ['playing'].includes(table.seats[i].hand?.status || '')) {
          table.currentTurnIndex = i;
          break;
        }
      }
    }

    let refundedAmount = 0;
    let currency: 'Gcoin' | 'Bonus' = 'Gcoin';
    const userBal = table.userBalances[userId];
    if (userBal) {
      currency = userBal.currency || 'Gcoin';
      if (table.settings.mode === 'tournament') {
        if (table.status === 'waiting') {
          refundedAmount = table.settings.tournament?.ticketPrice || 0;
        } else {
          refundedAmount = 0; 
        }
      } else {
        const netWin = userBal.balance - userBal.initialBuyIn;
        let fee = 0;
        if (netWin > 0 && currency === 'Gcoin') fee = netWin * 0.01; // No fee on Bonus play usually
        refundedAmount = userBal.balance - fee;
      }
      delete table.userBalances[userId];
    }
    return { table: JSON.parse(JSON.stringify(table)), refundedAmount, currency };
  },

  async placeBet(tableId: string, seatIndex: number, userId: string, amount: number, sideBets?: SideBets): Promise<{ table: Table, deducted: number }> {
    await delay(300);
    const table = tablesDb[tableId];
    if (!table || table.status !== 'waiting') throw new Error("Game already started");
    
    if (table.seats[seatIndex].userId !== userId) {
      throw new Error("You are not seated at this seat. Your deal was too late.");
    }

    if (table.seats[seatIndex].isReady) {
      // Already bet
      return { table: JSON.parse(JSON.stringify(table)), deducted: 0 };
    }
    
    const deducted = amount + (sideBets?.pair || 0) + (sideBets?.twentyOnePlusThree || 0);
    
    const userBal = table.userBalances[userId];
    if (!userBal || userBal.balance < deducted) {
       throw new Error("Insufficient locked balance");
    }
    
    userBal.balance -= deducted;

    table.seats[seatIndex] = {
      ...table.seats[seatIndex],
      isReady: true,
      hand: {
        cards: table.seats[seatIndex].hand?.cards || [],
        bet: amount,
        sideBets: sideBets || { pair: 0, twentyOnePlusThree: 0 },
        status: 'playing',
        score: table.seats[seatIndex].hand?.score || 0
      }
    };
    return { table: JSON.parse(JSON.stringify(table)), deducted };
  },

  async startGame(tableId: string): Promise<Table> {
    const table = tablesDb[tableId];
    if (!table || table.status !== 'waiting') return JSON.parse(JSON.stringify(table));

    // Remove split hands from the previous round
    table.seats = table.seats.filter(s => !s.isSplitHand);

    let discardedThisRound = 0;
    const cardsToDiscard: PlayingCard[] = [];
    if (table.dealerHand) {
      discardedThisRound += table.dealerHand.cards.length;
      cardsToDiscard.push(...table.dealerHand.cards);
    }
    table.seats.forEach(seat => {
      if (seat.hand && seat.hand.cards.length > 0) {
        discardedThisRound += seat.hand.cards.length;
        cardsToDiscard.push(...seat.hand.cards);
      }
    });

    table.discardCount += discardedThisRound;
    if (!table.discardedCards) table.discardedCards = [];
    table.discardedCards.push(...cardsToDiscard);

    const totalCards = gameRules.deckCount * 52;
    if (!table.deck || table.deck.length <= (totalCards * (1 - gameRules.shufflePenetration))) {
      table.deck = await getVRFDeck();
      table.discardCount = 0;
      table.discardedCards = [];
    }

    const deck = table.deck;

    table.seats = table.seats.map(seat => {
      if (!seat.isReady) return { ...seat, hand: null };
      if (!seat.hand) return seat;
      return {
        ...seat,
        hand: {
          ...seat.hand,
          cards: [deck.pop()!, deck.pop()!]
        }
      };
    });

    table.dealerHand = {
      cards: [deck.pop()!, { ...deck.pop()!, isHidden: true }],
      bet: 0,
      status: 'playing',
      score: 0
    };

    table.seats.forEach(s => {
      if (s.hand) {
        s.hand.score = calculateScore(s.hand.cards);
        s.hand.status = s.hand.score === 21 ? 'blackjack' : 'playing';
        
        // Evaluate side bets immediately, so that splits don't destroy original pair data
        if (s.hand.sideBets) {
          if (s.hand.sideBets.pair > 0 && s.hand.cards.length >= 2) {
             const pairMult = checkPair(s.hand.cards[0], s.hand.cards[1]);
             if (pairMult > 0) {
               s.hand.sideBetPairWon = s.hand.sideBets.pair * (pairMult + 1);
             } else {
               s.hand.sideBetPairWon = 0;
             }
          }
          if (s.hand.sideBets.twentyOnePlusThree > 0 && s.hand.cards.length >= 2 && table.dealerHand?.cards.length > 0) {
             const plus3Mult = check21Plus3(s.hand.cards[0], s.hand.cards[1], table.dealerHand.cards[0]);
             if (plus3Mult > 0) {
               s.hand.sideBetPlus3Won = s.hand.sideBets.twentyOnePlusThree * (plus3Mult + 1);
             } else {
               s.hand.sideBetPlus3Won = 0;
             }
          }
        }
      }
    });
    table.dealerHand.score = calculateScore(table.dealerHand.cards);

    let currentTurnIndex = -1;
    for (let i = table.seats.length - 1; i >= 0; i--) {
        if (table.seats[i].isReady && table.seats[i].hand?.status === 'playing') {
          currentTurnIndex = i;
          break;
        }
    }

    table.status = 'playing';
    table.deck = deck;
    table.currentTurnIndex = currentTurnIndex;

    return JSON.parse(JSON.stringify(table));
  },

  async hit(tableId: string, seatIndex: number, onUpdate?: (table: Table) => void): Promise<Table> {
    await delay(300);
    const table = tablesDb[tableId];
    if (!table || table.currentTurnIndex !== seatIndex) return JSON.parse(JSON.stringify(table));

    const seat = table.seats[seatIndex];
    if (!seat.hand) return JSON.parse(JSON.stringify(table));

    const newCard = table.deck.pop()!;
    seat.hand.cards.push(newCard);
    seat.hand.score = calculateScore(seat.hand.cards);
    
    if (seat.hand.score >= 21) {
      seat.hand.status = seat.hand.score > 21 ? 'busted' : 'stood';
      
      if (onUpdate) onUpdate(JSON.parse(JSON.stringify(table)));
      await delay(table.seats.length * 150 + 800); // Wait for hit animation and busted text

      table.currentTurnIndex = -1;
      for (let i = seatIndex - 1; i >= 0; i--) {
        if (table.seats[i].isReady && ['playing'].includes(table.seats[i].hand?.status || '')) {
          table.currentTurnIndex = i;
          break;
        }
      }
    }

    return JSON.parse(JSON.stringify(table));
  },

  async stand(tableId: string, seatIndex: number, onUpdate?: (table: Table) => void): Promise<Table> {
    await delay(200);
    const table = tablesDb[tableId];
    if (!table || table.currentTurnIndex !== seatIndex) return JSON.parse(JSON.stringify(table));

    const seat = table.seats[seatIndex];
    if (seat.hand) {
      seat.hand.status = 'stood';
    }

    if (onUpdate) onUpdate(JSON.parse(JSON.stringify(table)));
    await delay(300); // Shorter wait for stand

    table.currentTurnIndex = -1;
    for (let i = seatIndex - 1; i >= 0; i--) {
      if (table.seats[i].isReady && ['playing'].includes(table.seats[i].hand?.status || '')) {
        table.currentTurnIndex = i;
        break;
      }
    }

    return JSON.parse(JSON.stringify(table));
  },

  async doubleDown(tableId: string, seatIndex: number, onUpdate?: (table: Table) => void): Promise<Table> {
    await delay(300);
    const table = tablesDb[tableId];
    if (!table || table.currentTurnIndex !== seatIndex) return JSON.parse(JSON.stringify(table));

    const seat = table.seats[seatIndex];
    if (!seat.hand || !seat.userId) return JSON.parse(JSON.stringify(table));
    
    // Deduct original bet amount again
    const userBal = table.userBalances[seat.userId];
    if (userBal) userBal.balance -= seat.hand.bet;
    
    seat.hand.bet *= 2; 
    
    const newCard = table.deck.pop()!;
    seat.hand.cards.push(newCard);
    seat.hand.score = calculateScore(seat.hand.cards);
    
    if (seat.hand.score > 21) {
      seat.hand.status = 'busted';
    } else {
      seat.hand.status = 'stood';
    }

    if (onUpdate) onUpdate(JSON.parse(JSON.stringify(table)));
    await delay(table.seats.length * 150 + 800); // Wait for hit animation

    table.currentTurnIndex = -1;
    for (let i = seatIndex - 1; i >= 0; i--) {
      if (table.seats[i].isReady && ['playing'].includes(table.seats[i].hand?.status || '')) {
        table.currentTurnIndex = i;
        break;
      }
    }

    return JSON.parse(JSON.stringify(table));
  },

  async split(tableId: string, seatIndex: number): Promise<Table> {
    await delay(200);
    const table = tablesDb[tableId];
    if (!table || table.currentTurnIndex !== seatIndex) return JSON.parse(JSON.stringify(table));

    const seat = table.seats[seatIndex];
    if (!seat.hand || !seat.userId || seat.hand.cards.length !== 2 || seat.hand.cards[0].value !== seat.hand.cards[1].value) {
      return JSON.parse(JSON.stringify(table));
    }
    
    const origSeatIdx = seat.originalSeatIndex !== undefined ? seat.originalSeatIndex : seatIndex;
    const currentHandsCount = table.seats.filter(s => s.originalSeatIndex === origSeatIdx).length + (seat.originalSeatIndex === undefined ? 1 : 0);
    
    if (currentHandsCount >= 4) {
      return JSON.parse(JSON.stringify(table));
    }
    
    if (seat.originalSeatIndex === undefined) {
      seat.originalSeatIndex = origSeatIdx;
    }
    
    const userBal = table.userBalances[seat.userId];
    if (userBal) userBal.balance -= seat.hand.bet;

    const card1 = seat.hand.cards[0];
    const card2 = seat.hand.cards[1];

    // Original hand
    seat.hand.cards = [card1];
    const newCard1 = table.deck.pop()!;
    seat.hand.cards.push(newCard1);
    seat.hand.score = calculateScore(seat.hand.cards);
    if (seat.hand.score === 21) seat.hand.status = 'stood';

    // New split hand
    const splitHand: any = {
      cards: [card2],
      bet: seat.hand.bet, // Matches the original bet (side bet does not duplicate)
      status: 'playing',
      score: 0
    };
    const newCard2 = table.deck.pop()!;
    splitHand.cards.push(newCard2);
    splitHand.score = calculateScore(splitHand.cards);
    if (splitHand.score === 21) splitHand.status = 'stood';

    const newSeat = {
      userId: seat.userId,
      isReady: true,
      hand: splitHand,
      isSplitHand: true,
      originalSeatIndex: origSeatIdx
    };

    // Insert new split hand at seatIndex + 1. Original hand stays at seatIndex.
    table.seats.splice(seatIndex + 1, 0, newSeat);
    
    // We update the current turn index to refer to the new split hand (which will play first)
    table.currentTurnIndex = seatIndex + 1;

    // If the split hand is blackjack (or busted/stood), pass it
    if (newSeat.hand.status !== 'playing') {
      let found = false;
      for (let i = seatIndex; i >= 0; i--) { // start checking from the original hand downwards
        if (table.seats[i].isReady && ['playing'].includes(table.seats[i].hand?.status || '')) {
          table.currentTurnIndex = i;
          found = true;
          break;
        }
      }
      if (!found) table.currentTurnIndex = -1;
    }

    return JSON.parse(JSON.stringify(table));
  },

  async buyInsurance(tableId: string, seatIndex: number): Promise<Table> {
    await delay(200);
    const table = tablesDb[tableId];
    const seat = table.seats[seatIndex];
    if (seat.hand && seat.userId) {
      const insuranceCost = seat.hand.bet / 2;
      const userBal = table.userBalances[seat.userId];
      if (userBal) userBal.balance -= insuranceCost;
      seat.hand.insuranceBet = insuranceCost;
    }
    return JSON.parse(JSON.stringify(table));
  },

  async dealerPlayAndResolve(tableId: string): Promise<{ table: Table, winnings: Record<string, number>, seatResults: SeatResult[], returnedLiquidity: number, dealerScore: number }> {
    await delay(600);
    const table = tablesDb[tableId];
    const winnings: Record<string, number> = {};
    const seatResults: SeatResult[] = [];
    let returnedLiquidity = 0;
    
    if (!table || !table.dealerHand) return { table: JSON.parse(JSON.stringify(table)), winnings, seatResults, returnedLiquidity, dealerScore: 0 };

    table.dealerHand.cards = table.dealerHand.cards.map(c => ({ ...c, isHidden: false }));
    table.dealerHand.score = calculateScore(table.dealerHand.cards);

    while (table.dealerHand.score < 17) {
      const c = table.deck.pop();
      if (!c) break;
      table.dealerHand.cards.push(c);
      table.dealerHand.score = calculateScore(table.dealerHand.cards);
    }

    if (table.dealerHand.score > 21) {
      table.dealerHand.status = 'busted';
    } else {
      table.dealerHand.status = 'stood';
    }

    let liquidityDelta = 0;
    const dealerScore = table.dealerHand.score;
    const dealerBust = table.dealerHand.status === 'busted';

    table.seats.forEach(seat => {
      if (!seat.isReady || !seat.hand || !seat.userId) return;
      const pScore = seat.hand.score;
      const dealerHasBlackjack = dealerScore === 21 && table.dealerHand.cards.length === 2;

      let pStatus: string = seat.hand.status;

      if (pStatus === 'busted') {
        pStatus = 'busted_lost';
      } else if (pStatus !== 'blackjack') {
        if (dealerBust) {
          pStatus = 'won';
        } else {
          if (pScore > dealerScore) pStatus = 'won';
          else if (pScore < dealerScore) pStatus = 'lost';
          else {
            if (table.settings.winningRule === 'dealer_wins_ties') {
              pStatus = 'lost';
            } else {
              pStatus = 'push';
            }
          }
        }
      }

      if (pStatus === 'blackjack' && dealerHasBlackjack) {
         pStatus = 'push';
      }

      let wonAmount = 0;
      if (pStatus === 'won') {
         wonAmount = seat.hand.bet * 2;
         liquidityDelta -= seat.hand.bet;
      } else if (pStatus === 'blackjack') {
         wonAmount = seat.hand.bet * (1 + gameRules.blackjackPayout);
         liquidityDelta -= seat.hand.bet * gameRules.blackjackPayout;
      } else if (pStatus === 'push') {
         wonAmount = seat.hand.bet;
      } else if (pStatus === 'lost' || pStatus === 'busted_lost') {
         liquidityDelta += seat.hand.bet;
      }
      
      if (pStatus === 'busted_lost') pStatus = 'lost';
      
      let insuranceWon = 0;
      if (seat.hand.insuranceBet) {
         if (dealerHasBlackjack) {
            insuranceWon = seat.hand.insuranceBet * 3; // pays 2 to 1 (win 2x + return 1x)
            liquidityDelta -= seat.hand.insuranceBet * 2;
         } else {
            liquidityDelta += seat.hand.insuranceBet;
         }
      }
      
      let sideBetWon = 0;
      if (seat.hand.sideBets) {
        if (seat.hand.sideBets.pair > 0) {
           if (seat.hand.sideBetPairWon !== undefined && seat.hand.sideBetPairWon > 0) {
             const win = seat.hand.sideBetPairWon;
             sideBetWon += win;
             liquidityDelta -= win - seat.hand.sideBets.pair;
           } else {
             liquidityDelta += seat.hand.sideBets.pair;
           }
        }
        if (seat.hand.sideBets.twentyOnePlusThree > 0) {
           if (seat.hand.sideBetPlus3Won !== undefined && seat.hand.sideBetPlus3Won > 0) {
             const win = seat.hand.sideBetPlus3Won;
             sideBetWon += win;
             liquidityDelta -= win - seat.hand.sideBets.twentyOnePlusThree;
           } else {
             liquidityDelta += seat.hand.sideBets.twentyOnePlusThree;
           }
        }
      }
      wonAmount += sideBetWon + insuranceWon;

      seat.hand.status = pStatus as HandStatus;
      
      const userBal = table.userBalances[seat.userId];
      if (userBal) userBal.balance += wonAmount;
      
      if (!winnings[seat.userId]) winnings[seat.userId] = 0;
      winnings[seat.userId] += wonAmount;

      const sideBetTotal = (seat.hand.sideBets?.pair || 0) + (seat.hand.sideBets?.twentyOnePlusThree || 0);
      const totalBet = seat.hand.bet + sideBetTotal + (seat.hand.insuranceBet || 0);
      const net = wonAmount - totalBet;

      const seatIndexToRecord = seat.isSplitHand && seat.originalSeatIndex !== undefined ? seat.originalSeatIndex : table.seats.indexOf(seat);
      seatResults.push({
        seatIndex: seatIndexToRecord,
        isSplit: !!seat.isSplitHand,
        userId: seat.userId || undefined,
        bet: seat.hand.bet,
        sideBet: sideBetTotal,
        sideBetWin: sideBetWon,
        insuranceBet: seat.hand.insuranceBet || 0,
        insuranceWin: insuranceWon,
        win: wonAmount,
        net: net,
        action: pStatus,
        score: pScore
      });
    });

    table.liquidity += liquidityDelta;
    
    table.roundsPlayed = (table.roundsPlayed || 0) + 1;
    if (table.settings.mode === 'tournament' && table.settings.tournament?.isScheduledEscalation) {
        const escRounds = table.settings.tournament.escalationRounds || 2;
        if (table.roundsPlayed % escRounds === 0) {
            table.settings.minBet *= 2;
            // Optionally increase maxBet too? The settings just escalate the blinds/minBet usually.
        }
    }

    if (table.status === 'closing') {
      table.status = 'closed';
    } else {
      table.status = 'waiting';
    }

    if (table.settings.mode !== 'tournament' && table.houseId !== 'system') {
       const requiredLiquidity = table.settings.minBet * table.settings.maxSeats;
       if (table.liquidity < requiredLiquidity * 0.3) {
          table.status = 'closed';
       }
    }
    
    // Remove split hands from the table for the next round
    table.seats = table.seats
      .filter(s => !s.isSplitHand)
      .map(s => {
        return { ...s, isReady: false };
      });
      
    botApi.handleRoundEnd(table);
    
    return { table: JSON.parse(JSON.stringify(table)), winnings, seatResults, returnedLiquidity, dealerScore };
  }
};
