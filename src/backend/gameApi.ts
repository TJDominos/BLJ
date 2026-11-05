import { Table, PlayingCard, HandStatus, SideBets, SeatResult, TournamentRecord } from '../store/gameStore';
import { gameRules } from '../config/gameRules';
import {
  tablesDb,
  reconcileSystemTables,
  delay,
  usersDb,
  getOrCreateUser,
  claimServerRefill,
  DEFAULT_GAME_COINS,
  houseStats
} from './db';
import { botApi } from './botApi';
import { emitBlackjackHandSettlementUnit } from './platformContract';
import { createDeterministicShoe, calculateHandScore } from './royalBlackjackRoomServer';

const calculateScore = (cards: PlayingCard[]): number => calculateHandScore(cards, false);

const checkPair = (c1: PlayingCard, c2: PlayingCard): number => {
  if (c1.value !== c2.value) return 0;
  if (c1.suit === c2.suit) return gameRules.sideBets.perfectPair.perfect;
  const c1Color = (c1.suit === 'hearts' || c1.suit === 'diamonds') ? 'red' : 'black';
  const c2Color = (c2.suit === 'hearts' || c2.suit === 'diamonds') ? 'red' : 'black';
  if (c1Color === c2Color) return gameRules.sideBets.perfectPair.colored;
  return gameRules.sideBets.perfectPair.mixed;
};

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
};

let shoeSeedSeq = 20261031;
const getVRFDeck = async (): Promise<PlayingCard[]> => {
  await delay(400);
  shoeSeedSeq += 131;
  const { deck } = createDeterministicShoe(shoeSeedSeq, gameRules.deckCount);
  return deck;
};

export const gameApi = {
  async joinTable(tableId: string, userId: string, seatIndex: number, _lockAmount: number = 0, currency: 'Gcoin' | 'Bonus' = 'Gcoin'): Promise<Table> {
    await delay(150);
    const table = tablesDb[tableId];
    if (!table) throw new Error("Table not found");
    const user = getOrCreateUser(userId);

    if (table.seats[seatIndex].userId === null) {
      if (table.settings.mode === 'tournament') {
        // In tournament mode, if the player is already seated at another seat on this table, prevent taking multiple seats or moving seats
        const alreadySeated = table.seats.some(s => s.userId === userId);
        if (alreadySeated) {
          return JSON.parse(JSON.stringify(table));
        }
        const existingEntry = table.userBalances[userId];
        const lockedAllowance = Math.max(100, table.settings.tournament?.startingChips ?? DEFAULT_GAME_COINS);
        // Purchase tournament ticket with Game Coins and grant every player an equal locked Tournament Allowance
        if (!existingEntry || existingEntry.initialBuyIn === 0) {
          const ticketPriceCoins = Math.max(0, table.settings.tournament?.ticketPrice ?? 100);
          if (usersDb[userId].balance < ticketPriceCoins) {
            throw new Error(`Insufficient Game Coins for tournament ticket (Ticket Price: ${ticketPriceCoins.toLocaleString()} Game Coins, Balance: ${usersDb[userId].balance.toLocaleString()} Game Coins)`);
          }
          usersDb[userId].balance -= ticketPriceCoins;
          table.liquidity = (table.liquidity || 0) + ticketPriceCoins;

          table.userBalances[userId] = {
            balance: lockedAllowance,
            initialBuyIn: ticketPriceCoins,
            currency: 'Gcoin'
          };
        }
        table.seats[seatIndex].userId = userId;
        table.seats[seatIndex].name = user.name;
        table.seats[seatIndex].avatar = user.avatar;
      } else {
        // Regular mode: use authoritative backend user balance (auto-refill to 5,000 if broke and no active hand)
        const hasActiveHandElsewhere = Object.values(tablesDb).some(
          t => t.status === 'playing' && t.seats.some(s => s.userId === userId && s.hand)
        );
        if (usersDb[userId].balance <= 0 && !hasActiveHandElsewhere) {
          usersDb[userId].balance = DEFAULT_GAME_COINS;
        }
        table.seats[seatIndex].userId = userId;
        table.seats[seatIndex].name = user.name;
        table.seats[seatIndex].avatar = user.avatar;
        table.userBalances[userId] = {
          balance: usersDb[userId].balance,
          initialBuyIn: table.userBalances[userId]?.initialBuyIn || user.balance || DEFAULT_GAME_COINS,
          currency
        };
      }
    }
    
    botApi.arrangeBots(table);
    reconcileSystemTables();
    
    return JSON.parse(JSON.stringify(tablesDb[tableId]));
  },

  async refillGameCoins(tableId: string, userId: string): Promise<Table> {
    await delay(100);
    const { table } = claimServerRefill(userId, tableId);
    if (!table && tableId && tablesDb[tableId]) {
      return JSON.parse(JSON.stringify(tablesDb[tableId]));
    }
    if (!table) throw new Error("Table not found");
    return table;
  },

  async leaveTable(tableId: string, userId: string, seatIndex?: number, isTimeout?: boolean): Promise<{ table: Table, refundedAmount: number }> {
    await delay(150);
    const table = tablesDb[tableId];
    if (!table) throw new Error("Not found");
    getOrCreateUser(userId);

    // Requirement 6: For tournament, player cannot leave seat once seated
    if (table.settings.mode === 'tournament') {
      reconcileSystemTables();
      return { table: JSON.parse(JSON.stringify(table)), refundedAmount: 0 };
    }
    
    let turnAdvancedFrom = -1;

    table.seats = table.seats.map((s, i) => {
      if (s.userId === userId && (seatIndex === undefined || i === seatIndex)) {
        if (isTimeout && s.isReady) {
            return s;
        }
        
        if (s.isReady && s.hand && table.userBalances[userId]) {
           const refund = s.hand.bet + (s.hand.sideBets?.pair || 0) + (s.hand.sideBets?.twentyOnePlusThree || 0) + (s.hand.insuranceBet || 0);
           table.userBalances[userId].balance += refund;
           if (usersDb[userId]) {
             usersDb[userId].balance = table.userBalances[userId].balance;
           }
        }
        
        if (table.currentTurnIndex === i) {
           turnAdvancedFrom = i;
        }

        return { ...s, userId: null, name: undefined, avatar: undefined, hand: null, isReady: false };
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
    
    if (table.status !== 'playing') {
      botApi.arrangeBots(table);
    }
    reconcileSystemTables();
    const tableClone = JSON.parse(JSON.stringify(tablesDb[tableId] || table));
    
    return { table: tableClone, refundedAmount: 0 };
  },

  async unlockTableBalance(tableId: string, userId: string): Promise<{ table: Table, refundedAmount: number, currency: 'Gcoin' | 'Bonus' }> {
    await delay(150);
    const table = tablesDb[tableId];
    if (!table) throw new Error("Not found");
    getOrCreateUser(userId);

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
        // Refund tournament entry in Game Coins only if tournament hasn't started yet
        if (table.status === 'waiting' && (table.roundsPlayed || 0) === 0) {
          refundedAmount = userBal.initialBuyIn || table.settings.tournament?.ticketPrice || 0;
          usersDb[userId].balance += refundedAmount;
          table.liquidity = Math.max(0, (table.liquidity || 0) - refundedAmount);
        } else {
          refundedAmount = 0;
        }
      } else {
        refundedAmount = userBal.balance;
        usersDb[userId].balance = refundedAmount > 0 ? refundedAmount : DEFAULT_GAME_COINS;
      }
      delete table.userBalances[userId];
    }
    const tableClone = JSON.parse(JSON.stringify(table));
    reconcileSystemTables();
    return { table: tableClone, refundedAmount, currency };
  },

  async placeBet(tableId: string, seatIndex: number, userId: string, amount: number, sideBets?: SideBets): Promise<{ table: Table, deducted: number }> {
    await delay(150);
    const table = tablesDb[tableId];
    if (!table || table.status !== 'waiting') throw new Error("Game already started");
    getOrCreateUser(userId);
    
    if (table.seats[seatIndex].userId !== userId) {
      throw new Error("You are not seated at this seat. Your deal was too late.");
    }

    if (table.seats[seatIndex].isReady) {
      return { table: JSON.parse(JSON.stringify(table)), deducted: 0 };
    }

    const isTournament = table.settings.mode === 'tournament';
    if (amount <= 0) {
      throw new Error(isTournament ? "Skipping rounds is not allowed in tournament mode." : "Bet amount must be greater than 0.");
    }

    const deducted = amount + (sideBets?.pair || 0) + (sideBets?.twentyOnePlusThree || 0);
    
    if (!table.userBalances[userId]) {
      const initialAllowance = isTournament
        ? Math.max(100, table.settings.tournament?.startingChips ?? DEFAULT_GAME_COINS)
        : usersDb[userId].balance;
      table.userBalances[userId] = {
        balance: initialAllowance,
        initialBuyIn: isTournament ? (table.settings.tournament?.ticketPrice ?? 100) : usersDb[userId].balance,
        currency: 'Gcoin'
      };
    }
    const userBal = table.userBalances[userId];
    if (!userBal || userBal.balance < deducted) {
       throw new Error(isTournament ? "Insufficient Tournament Allowance" : "Insufficient Game Coins");
    }
    
    userBal.balance -= deducted;
    if (!isTournament && usersDb[userId]) {
      usersDb[userId].balance = userBal.balance;
    }

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

    const isTournament = table.settings.mode === 'tournament';

    // In tournament mode, skipping is not allowed: ensure every seated player places at least the minimum bet (or all-in if allowance < minBet)
    if (isTournament) {
      const minBetReq = Math.max(1, table.settings.tournament?.minBetChips || table.settings.minBet || 50);
      table.seats.forEach(seat => {
        if (seat.userId && (!seat.isReady || !seat.hand || seat.hand.bet <= 0)) {
          const uBal = table.userBalances[seat.userId];
          if (uBal && uBal.balance > 0) {
            const autoBet = Math.min(uBal.balance, minBetReq);
            uBal.balance -= autoBet;
            seat.isReady = true;
            seat.hand = {
              cards: [],
              bet: autoBet,
              sideBets: { pair: 0, twentyOnePlusThree: 0 },
              status: 'playing',
              score: 0
            };
          }
        }
      });
    }

    // Apply Tournament Forced Ante to all active hands using locked Tournament Allowance
    if (
      isTournament &&
      table.settings.tournament?.isForcedAnte &&
      (table.settings.tournament.antePct || 0) > 0
    ) {
      const antePct = Math.min(2, Math.max(0, table.settings.tournament.antePct || 1));
      const baseAllowance = table.settings.tournament.startingChips || DEFAULT_GAME_COINS;
      const forcedAnte = Math.max(1, Math.floor((baseAllowance * antePct) / 100));

      table.seats.forEach(seat => {
        if (seat.userId && seat.isReady && seat.hand && seat.hand.bet > 0) {
          const uBal = table.userBalances[seat.userId];
          if (uBal && uBal.balance > 0) {
            const actualAnte = Math.min(uBal.balance, forcedAnte);
            uBal.balance -= actualAnte;
            seat.hand.bet += actualAnte;
          }
        }
      });
    }

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
    const hasAnyBettingSeat = table.seats.some(s => s.isReady && s.hand && s.hand.bet > 0);

    table.seats = table.seats.map(seat => {
      if (!seat.isReady || !seat.hand || seat.hand.bet <= 0) return { ...seat, hand: null };
      return {
        ...seat,
        hand: {
          ...seat.hand,
          cards: [deck.pop()!, deck.pop()!]
        }
      };
    });

    table.dealerHand = hasAnyBettingSeat
      ? {
          cards: [deck.pop()!, { ...deck.pop()!, isHidden: true }],
          bet: 0,
          status: 'playing',
          score: 0
        }
      : {
          cards: [],
          bet: 0,
          status: 'stood',
          score: 0
        };

    table.seats.forEach(s => {
      if (s.hand && s.hand.cards.length >= 2) {
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
          if (s.hand.sideBets.twentyOnePlusThree > 0 && s.hand.cards.length >= 2 && table.dealerHand && table.dealerHand.cards.length > 0) {
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
    if (userBal) {
      userBal.balance -= seat.hand.bet;
      if (table.settings.mode !== 'tournament' && usersDb[seat.userId]) {
        usersDb[seat.userId].balance = userBal.balance;
      }
    }
    
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
    if (userBal) {
      userBal.balance -= seat.hand.bet;
      if (table.settings.mode !== 'tournament' && usersDb[seat.userId]) {
        usersDb[seat.userId].balance = userBal.balance;
      }
    }

    const card1 = seat.hand.cards[0];
    const card2 = seat.hand.cards[1];
    const isSplittingAces = card1.value === 'A' && card2.value === 'A';

    // Original hand
    seat.hand.cards = [card1];
    const newCard1 = table.deck.pop()!;
    seat.hand.cards.push(newCard1);
    seat.hand.score = calculateScore(seat.hand.cards);
    // Split Aces get 1 card each and auto-stand; 2-card 21 on split hand counts as regular 21 ('stood'), not Natural Blackjack
    if (isSplittingAces || seat.hand.score === 21) seat.hand.status = 'stood';

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
    if (isSplittingAces || splitHand.score === 21) splitHand.status = 'stood';

    const newSeat = {
      userId: seat.userId,
      name: seat.name,
      avatar: seat.avatar,
      isReady: true,
      hand: splitHand,
      isSplitHand: true,
      originalSeatIndex: origSeatIdx
    };

    // Insert new split hand at seatIndex + 1. Original hand stays at seatIndex.
    table.seats.splice(seatIndex + 1, 0, newSeat);
    
    // We update the current turn index to refer to the new split hand (which will play first)
    table.currentTurnIndex = seatIndex + 1;

    // If the split hand is stood (e.g. Split Aces or 21), pass turn to next playing hand
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
    if (
      seat.hand &&
      seat.userId &&
      table.dealerHand?.cards[0]?.value === 'A' &&
      seat.hand.cards.length === 2 &&
      !seat.isSplitHand &&
      !seat.hand.insuranceBet
    ) {
      const insuranceCost = seat.hand.bet / 2;
      const userBal = table.userBalances[seat.userId];
      if (userBal && userBal.balance >= insuranceCost) {
        userBal.balance -= insuranceCost;
        if (table.settings.mode !== 'tournament' && usersDb[seat.userId]) {
          usersDb[seat.userId].balance = userBal.balance;
        }
        seat.hand.insuranceBet = insuranceCost;
      }
    }
    return JSON.parse(JSON.stringify(table));
  },

  async dealerPlayAndResolve(tableId: string): Promise<{ table: Table, winnings: Record<string, number>, seatResults: SeatResult[], returnedLiquidity: number, dealerScore: number }> {
    const table = tablesDb[tableId];
    const winnings: Record<string, number> = {};
    const seatResults: SeatResult[] = [];
    let returnedLiquidity = 0;

    if (!table || !table.dealerHand || (table.status !== 'playing' && table.status !== 'closing') || (table as any)._isResolving) {
      return {
        table: table ? JSON.parse(JSON.stringify(table)) : ({} as Table),
        winnings: (table as any)?.lastRoundSummary?.winnings || winnings,
        seatResults: (table as any)?.lastRoundSummary?.seatResults || seatResults,
        returnedLiquidity,
        dealerScore: (table as any)?.lastRoundSummary?.dealerScore || 0
      };
    }

    (table as any)._isResolving = true;
    try {
    await delay(600);

    if (table.dealerHand.cards.length > 0) {
      table.dealerHand.cards = table.dealerHand.cards.map(c => ({ ...c, isHidden: false }));
      table.dealerHand.score = calculateScore(table.dealerHand.cards);

      // Dealer only draws to 17 if at least one player hand is still alive (not busted)
      const anyPlayerAlive = table.seats.some(
        s => s.isReady && s.hand && (s.hand.status === 'stood' || s.hand.status === 'blackjack')
      );

      while (anyPlayerAlive && table.dealerHand.score < 17) {
        const c = table.deck.pop();
        if (!c) break;
        table.dealerHand.cards.push(c);
        table.dealerHand.score = calculateScore(table.dealerHand.cards);
      }

      if (table.dealerHand.score > 21) {
        table.dealerHand.status = 'busted';
      } else if (table.dealerHand.score === 21 && table.dealerHand.cards.length === 2) {
        table.dealerHand.status = 'blackjack';
      } else {
        table.dealerHand.status = 'stood';
      }
    }

    let liquidityDelta = 0;
    const dealerScore = table.dealerHand.score;
    const dealerBust = table.dealerHand.status === 'busted';

    table.seats.forEach(seat => {
      if (!seat.isReady || !seat.hand || !seat.userId) return;
      const pScore = seat.hand.score;
      const dealerHasBlackjack = dealerScore === 21 && table.dealerHand.cards.length === 2;
      const isSplit = Boolean(seat.isSplitHand || seat.originalSeatIndex !== undefined);
      const playerHasNaturalBlackjack = seat.hand.status === 'blackjack' && seat.hand.cards.length === 2 && !isSplit;

      let pStatus: string = seat.hand.status;

      if (pStatus === 'busted') {
        pStatus = 'busted_lost';
      } else if (playerHasNaturalBlackjack) {
        pStatus = dealerHasBlackjack ? 'push' : 'blackjack';
      } else if (dealerHasBlackjack) {
        // Dealer's Natural 2-card Blackjack beats any non-natural 21 (including 3-card 21 or split 21)
        pStatus = 'lost';
      } else if (dealerBust) {
        pStatus = 'won';
      } else if (pScore > dealerScore) {
        pStatus = 'won';
      } else if (pScore < dealerScore) {
        pStatus = 'lost';
      } else {
        pStatus = table.settings.winningRule === 'dealer_wins_ties' ? 'lost' : 'push';
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
            insuranceWon = seat.hand.insuranceBet * 3;
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
      if (userBal) {
        userBal.balance += wonAmount;
        if (table.settings.mode !== 'tournament' && usersDb[seat.userId]) {
          usersDb[seat.userId].balance = userBal.balance;
        }
      }
      
      if (!winnings[seat.userId]) winnings[seat.userId] = 0;
      winnings[seat.userId] += wonAmount;

      if (wonAmount > 0 && table.houseId === 'system') {
        houseStats.totalTokensPaidOutToPlayers += wonAmount;
      }

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

    if (table.settings.mode !== 'tournament') {
      table.liquidity += liquidityDelta;
    }
    
    table.roundsPlayed = (table.roundsPlayed || 0) + 1;
    table.lastRoundSummary = {
      roundId: `${table.id}_r${table.roundsPlayed}_${Date.now()}`,
      timestamp: Date.now(),
      winnings,
      seatResults,
      dealerScore
    };

    // Emit Universal Platform SettlementUnitEnvelope + LedgerReceipt (Event-driven, no cross-room SQLite)
    const endingBalances: Record<string, number> = {};
    for (const [uId, balObj] of Object.entries(table.userBalances)) {
      endingBalances[uId] = usersDb[uId] ? usersDb[uId].balance : balObj.balance;
    }
    emitBlackjackHandSettlementUnit({
      table,
      seatResults,
      endingBalances
    });

    // Remove split hands from the table for the next round
    table.seats = table.seats
      .filter(s => !s.isSplitHand)
      .map(s => ({ ...s, isReady: false, originalSeatIndex: undefined }));

    // =========================================================================
    // TOURNAMENT WINNING RULES, ESCALATION & PRIZE POOL DISTRIBUTION
    // =========================================================================
    if (table.settings.mode === 'tournament' && table.settings.tournament) {
      const t = table.settings.tournament;

      // 1. Scheduled Escalation (Double Blinds every X rounds)
      if (t.isScheduledEscalation) {
        const escRounds = Math.max(1, t.escalationRounds || 5);
        if (table.roundsPlayed % escRounds === 0) {
          table.settings.minBet *= 2;
          t.minBetChips = (t.minBetChips || 50) * 2;
        }
      }

      // 2. Eliminate players whose tournament chip stack dropped to 0
      table.seats = table.seats.map(s => {
        if (s.userId && (table.userBalances[s.userId]?.balance || 0) <= 0) {
          return { ...s, userId: null, name: undefined, avatar: undefined, hand: null, isReady: false };
        }
        return s;
      });

      // 3. Evaluate Tournament Win Conditions (Survivor Cap / Round Cap)
      const activeSurvivorIds = Array.from(
        new Set(
          table.seats
            .filter(s => s.userId !== null && (table.userBalances[s.userId]?.balance || 0) > 0)
            .map(s => s.userId as string)
        )
      );

      const targetSurvivors = Math.max(1, t.targetSurvivors || 1);
      const hitSurvivorCap = Boolean(t.isSurvivorCap && activeSurvivorIds.length <= targetSurvivors);
      const hitRoundCap = Boolean(t.isHardCapRounds && table.roundsPlayed >= (t.maxRounds || 20));
      const allEliminated = activeSurvivorIds.length === 0;

      if (hitSurvivorCap || hitRoundCap || allEliminated) {
        // Compute Net Prize Pool in Game Coins from collected Ticket fees
        const entrantCount = Object.keys(table.userBalances).length || Math.max(2, t.minSeats || 2);
        const grossPool = table.liquidity > 0 ? table.liquidity : (t.ticketPrice || 100) * entrantCount;
        const hostFee = Math.floor(grossPool * ((t.hostFeePct ?? 3) / 100));
        const platformFee = Math.floor(grossPool * ((t.platformFeePct ?? 2) / 100));
        const netPrizePool = Math.max(0, grossPool - hostFee - platformFee);

        // Credit Host Fee in Game Coins to the table creator
        if (table.houseId && table.houseId !== 'system' && usersDb[table.houseId]) {
          usersDb[table.houseId].balance += hostFee;
        }

        // Rank winners by remaining tournament chips descending
        let rankedIds = [...activeSurvivorIds].sort(
          (a, b) => (table.userBalances[b]?.balance || 0) - (table.userBalances[a]?.balance || 0)
        );

        // Fallback if all players busted in the same final round: rank by net/bet in final round
        if (rankedIds.length === 0) {
          const roundParticipants = Array.from(
            new Set(seatResults.map(sr => sr.userId).filter(Boolean) as string[])
          );
          rankedIds = roundParticipants.sort((a, b) => {
            const aBest = Math.max(...seatResults.filter(sr => sr.userId === a).map(sr => sr.score || 0));
            const bBest = Math.max(...seatResults.filter(sr => sr.userId === b).map(sr => sr.score || 0));
            return bBest - aBest;
          });
        }

        const winnersPayout: { userId: string; name: string; chips: number; prizeCoins: number }[] = [];

        if (rankedIds.length > 0 && netPrizePool > 0) {
          if (t.prizeDistribution === 'splitByChips' || !t.isSurvivorCap) {
            const totalSurvivorChips = rankedIds.reduce(
              (sum, id) => sum + Math.max(1, table.userBalances[id]?.balance || 1),
              0
            );
            rankedIds.forEach(uId => {
              const chips = table.userBalances[uId]?.balance || 0;
              const share = Math.max(1, chips) / totalSurvivorChips;
              const prizeCoins = Math.round(netPrizePool * share);
              if (usersDb[uId]) {
                usersDb[uId].balance += prizeCoins;
              }
              winnersPayout.push({
                userId: uId,
                name: usersDb[uId]?.name || uId,
                chips,
                prizeCoins
              });
            });
          } else {
            // Survivor Paytable Distribution
            const winnerCount = Math.min(rankedIds.length, targetSurvivors);
            const topWinners = rankedIds.slice(0, winnerCount);
            const paytableMap: Record<number, number[]> = {
              1: [1.0],
              2: [0.7, 0.3],
              3: [0.5, 0.3, 0.2],
              4: [0.4, 0.3, 0.2, 0.1],
              5: [0.35, 0.25, 0.2, 0.15, 0.05]
            };
            const weights = paytableMap[winnerCount] || paytableMap[5];
            const weightSum = weights.slice(0, topWinners.length).reduce((a, b) => a + b, 0) || 1;

            topWinners.forEach((uId, idx) => {
              const ratio = (weights[idx] || 0) / weightSum;
              const prizeCoins = Math.round(netPrizePool * ratio);
              const chips = table.userBalances[uId]?.balance || 0;
              if (usersDb[uId]) {
                usersDb[uId].balance += prizeCoins;
              }
              winnersPayout.push({
                userId: uId,
                name: usersDb[uId]?.name || uId,
                chips,
                prizeCoins
              });
            });
          }
        }

        const trnRecord: TournamentRecord = {
          id: `T-${String((table.tournamentHistory?.length || 0) + 1).padStart(4, '0')}`,
          timestamp: Date.now(),
          rounds: table.roundsPlayed,
          seatsFilled: entrantCount,
          maxSeats: table.settings.maxSeats,
          ticketPrice: t.ticketPrice || 0,
          prizePool: netPrizePool,
          reason: hitSurvivorCap ? 'Survivor Cap Reached' : hitRoundCap ? 'Round Cap Reached' : 'Knockout Finish',
          winners: winnersPayout
        };

        if (!table.tournamentHistory) table.tournamentHistory = [];
        table.tournamentHistory.unshift(trnRecord);

        // Reset tournament table for next tournament session
        table.status = 'waiting';
        table.roundsPlayed = 0;
        table.liquidity = 0;
        table.userBalances = {};
        table.seats = table.seats.map(s => ({ ...s, userId: null, hand: null, isReady: false }));

        return { table: JSON.parse(JSON.stringify(table)), winnings, seatResults, returnedLiquidity, dealerScore };
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
      
    botApi.handleRoundEnd(table);
    
    return { table: JSON.parse(JSON.stringify(table)), winnings, seatResults, returnedLiquidity, dealerScore };
    } finally {
      (table as any)._isResolving = false;
    }
  }
};
