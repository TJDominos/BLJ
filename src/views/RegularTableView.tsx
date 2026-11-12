import React, { useState, useEffect } from 'react';
import { useGameStore, PlayingCard as PlayingCardType } from '@/store/gameStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Coins, Crown, Loader2, LogOut, Volume2, Bell, Heart, RefreshCw, Minus, Plus, ArrowDown, Menu, ChevronLeft, ChevronRight, User, Check, Gift } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sounds';
import { RulesModal } from './RulesModal';
import { PlayingCard } from '@/components/blackjack/PlayingCardUI';
import { DelayedScore, useDealRevealedSeats } from '@/components/blackjack/DelayedScore';
import { DealerArea } from '@/components/blackjack/DealerAreaUI';
import { WinAnimation } from '@/components/blackjack/WinAnimation';
import { GoldenWreath } from '@/components/blackjack/GoldenWreath';
import { LiveTablesSidebar } from '@/components/blackjack/LiveTablesSidebar';
import { ConfirmModal } from '@/components/blackjack/ConfirmModal';
import { DealControlHUD } from '@/components/blackjack/DealControlHUD';
import { ActiveTurnHUD } from '@/components/blackjack/ActiveTurnHUD';
import { RankWidget } from '@/components/blackjack/RankWidget';
import { TablePlayersSidebar } from '@/components/blackjack/TablePlayersSidebar';
import { TableSeatButton } from '@/components/blackjack/TableSeatButton';
import { CurrencyIcon } from '@/components/CurrencyIcon';
import { useBotBehavior } from '@/hooks/useBotBehavior';

// Further down, replace the dealer area:

import { calculateBaseRTP } from '@/backend/gameRules';

import { 
  useUIStore, 
  selectBetAmountStr, 
  selectSideBetsEnabled, 
  selectAutoDeal, 
  selectPairBetStr, 
  selectPlus3BetStr, 
  selectShowHistory, 
  selectShowRules, 
  selectIsMuted, 
  selectShakeSeats, 
  selectIsShuffling, 
  selectShowDiscardStats, 
  selectShowFloatingComments, 
  selectIsCommentsOpen, 
  selectIsTablePlayersOpen, 
  selectConfirmAction,
  selectActionCountdown,
  selectDealCountdown,
  selectRecentWinAmount,
  selectPlayMode
} from '@/store/uiStore';

export function RegularTableView({ onNavigate, onToggleSidebar, isSidebarOpen }: { onNavigate: (view: 'lobby' | 'create' | 'table' | 'host_table' | 'manage_tables') => boolean | void, onToggleSidebar?: () => void, isSidebarOpen?: boolean }) {
  const { tables, activeTableId, currentUser, leaveTable, joinTable, placeBet, startGame, hit, stand, doubleDown, split, buyInsurance, gameRecords: allGameRecords, unlockTableBalance, refillGameCoins } = useGameStore();

  const userHostedTables = Object.values(tables).filter(t => t.houseId === currentUser?.id);
  const hasHostedTables = userHostedTables.length > 0;
  
  const hasLowLiquidityAlert = React.useMemo(() => {
     return userHostedTables.some(t => {
         if (t.status === 'closed') return false;
         if (t.settings.mode === 'tournament') return false;
         const req = t.settings.maxBet * t.settings.maxSeats;
         return t.liquidity < req * 0.5;
     });
  }, [userHostedTables]);

  const uiStore = useUIStore();
  const betAmountStr = useUIStore(selectBetAmountStr);
  const setBetAmountStr = uiStore.setBetAmountStr;
  const sideBetsEnabled = useUIStore(selectSideBetsEnabled);
  const setSideBetsEnabled = uiStore.setSideBetsEnabled;
  const autoDeal = useUIStore(selectAutoDeal);
  const setAutoDeal = uiStore.setAutoDeal;
  const pairBetStr = useUIStore(selectPairBetStr);
  const setPairBetStr = uiStore.setPairBetStr;
  const plus3BetStr = useUIStore(selectPlus3BetStr);
  const setPlus3BetStr = uiStore.setPlus3BetStr;
  const showHistory = useUIStore(selectShowHistory);
  const setShowHistory = uiStore.setShowHistory;
  const showRules = useUIStore(selectShowRules);
  const setShowRules = uiStore.setShowRules;
  const isMuted = useUIStore(selectIsMuted);
  const setIsMuted = uiStore.setIsMuted;
  const shakeSeats = useUIStore(selectShakeSeats);
  const setShakeSeats = uiStore.setShakeSeats;
  const isShuffling = useUIStore(selectIsShuffling);
  const setIsShuffling = uiStore.setIsShuffling;
  const showDiscardStats = useUIStore(selectShowDiscardStats);
  const setShowDiscardStats = uiStore.setShowDiscardStats;
  const showFloatingComments = useUIStore(selectShowFloatingComments);
  const setShowFloatingComments = uiStore.setShowFloatingComments;
  const isCommentsOpen = useUIStore(selectIsCommentsOpen);
  const setIsCommentsOpen = uiStore.setIsCommentsOpen;
  const isTablePlayersOpen = useUIStore(selectIsTablePlayersOpen);
  const setIsTablePlayersOpen = uiStore.setIsTablePlayersOpen;
  const confirmAction = useUIStore(selectConfirmAction);
  const setConfirmAction = uiStore.setConfirmAction;
  const actionCountdown = useUIStore(selectActionCountdown);
  const setActionCountdown = uiStore.setActionCountdown;
  const dealCountdown = useUIStore(selectDealCountdown);
  const setDealCountdown = uiStore.setDealCountdown;
  const recentWinAmount = useUIStore(selectRecentWinAmount);
  const setRecentWinAmount = uiStore.setRecentWinAmount;
  const playMode = useUIStore(selectPlayMode);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  const table = tables[activeTableId || ''];
  const isSeatDealRevealed = useDealRevealedSeats(table?.status, table?.seats?.length || 7);
  const mySeats = React.useMemo(() => table?.seats.map((s, i) => s.userId === currentUser?.id ? i : -1).filter(i => i >= 0) || [], [table?.seats?.map(s => s.userId)?.join(), currentUser?.id]);

  const setPlayMode = useUIStore(state => state.setPlayMode);
  const seatedCurrency = table?.userBalances?.[currentUser?.id || '']?.currency;
  
  useEffect(() => {
    if (seatedCurrency && seatedCurrency !== playMode) {
      setPlayMode(seatedCurrency as 'Gcoin' | 'Bonus');
    }
  }, [seatedCurrency, playMode, setPlayMode]);

  const activeCurrency = table?.houseId !== 'system' ? 'Gcoin' : (seatedCurrency || playMode);

  const gameRecords = React.useMemo(() => {
    if (!table) return [];
    return allGameRecords.filter(r => r.tableId === table.id && (r.currency || 'Gcoin') === activeCurrency);
  }, [allGameRecords, table?.id, activeCurrency]);

  useEffect(() => {
    if (betAmountStr === '0' && table?.settings.minBet) {
       setBetAmountStr(table.settings.minBet.toString());
    }
  }, [table?.settings.minBet, betAmountStr, setBetAmountStr]);

  const previousDeckLength = React.useRef(table?.deck?.length || 0);
  const previousStatus = React.useRef(table?.status);
  const previousRoundsPlayed = React.useRef<number | undefined>(table?.roundsPlayed);
  const seatsContainerRef = React.useRef<HTMLDivElement>(null);
  const isResolvingRef = React.useRef(false);
  const isFirstLoadRef = React.useRef(true);
  const isPlacingBetRef = React.useRef(false);

  const isRoundJustSettled = Boolean(
    table &&
    table.status === 'waiting' &&
    (previousStatus.current === 'playing' ||
      (previousRoundsPlayed.current !== undefined &&
        (table.roundsPlayed || 0) > previousRoundsPlayed.current))
  );

  if (table?.status === 'playing') {
    isResolvingRef.current = false;
  }
  if (isRoundJustSettled && recentWinAmount === null) {
     isResolvingRef.current = true;
  } else if (recentWinAmount !== null) {
     isResolvingRef.current = false;
  }

  useEffect(() => {
    if (table && isFirstLoadRef.current) {
        setBetAmountStr((table.settings.minBet || 50).toString());
        isFirstLoadRef.current = false;
    }
  }, [table]);

  useEffect(() => {
    if (table?.status === 'waiting') {
      const seatedPlayers = table?.seats.filter(s => s.userId !== null) || [];
      const allReady = seatedPlayers.length > 0 && seatedPlayers.every(s => s.isReady);
      
      if (allReady && mySeats.length > 0 && mySeats.every(sIdx => table.seats[sIdx].isReady) && dealCountdown !== 0 && dealCountdown !== -1) {
         setDealCountdown(0);
      } else if (dealCountdown === null && seatedPlayers.length > 0) {
         if (recentWinAmount?.won && recentWinAmount.seats && recentWinAmount.seats.length > 0) {
            setDealCountdown((table.settings.actionTimeLimit || 15) + 3);
         } else {
            setDealCountdown(table.settings.actionTimeLimit || 15);
         }
      } else if (seatedPlayers.length === 0 && dealCountdown !== null) {
         setDealCountdown(null);
      }
    } else {
      setDealCountdown(null);
    }
  }, [table?.status, dealCountdown, table?.settings.actionTimeLimit, recentWinAmount, JSON.stringify(table?.seats)]);

  useEffect(() => {
    if (confirmAction !== null) return;
    
    if (dealCountdown !== null && dealCountdown > 0) {
      const isSeatedNotReady = table?.seats.some(s => s?.userId === currentUser?.id && !s.isReady);
      if (isSeatedNotReady && dealCountdown <= 6) {
        const myFirstSeatIdx = table?.seats.findIndex(s => s?.userId === currentUser?.id);
        const pan = myFirstSeatIdx !== undefined && myFirstSeatIdx >= 0 && table?.seats.length > 1 ? (myFirstSeatIdx / (table.seats.length - 1)) * 2 - 1 : 0;
        soundManager.playTick(pan);
      }
      const timer = setTimeout(() => setDealCountdown(dealCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (dealCountdown === 0 && table?.status === 'waiting') {
      setDealCountdown(-1);
      const seatedPlayers = table.seats.filter(s => s.userId !== null);
      if (seatedPlayers.length === 0) {
          setDealCountdown(null);
          return;
      }

      const myNotReady = mySeats.filter(sIdx => !table.seats[sIdx].isReady);
      if (myNotReady.length > 0 && !isPlacingBetRef.current) {
         myNotReady.forEach(sIdx => leaveTable(table.id, sIdx, true));
      }
      
      // If none of the remaining players are ready, don't restart the countdown here,
      // it will be handled by the other useEffect when seats update.
      const hasReady = table.seats.some(s => s.userId !== null && s.isReady);
      if (hasReady && (table.houseId === 'system' || table.houseId === currentUser?.id)) {
         startGame(table.id);
      } else if (!hasReady) {
         setDealCountdown(null);
      }
    }
  }, [dealCountdown, table?.id, table?.status, JSON.stringify(table?.seats), table?.settings.actionTimeLimit, mySeats, leaveTable, startGame, table?.houseId, currentUser?.id, confirmAction]);

  useEffect(() => {
    if (autoDeal && table?.status === 'waiting' && mySeats.length > 0 && !isResolvingRef.current && recentWinAmount === null && mySeats.some(sIdx => !table.seats[sIdx].isReady) && !isPlacingBetRef.current) {
        const timer = setTimeout(() => {
           handleStartGame();
        }, 1200);
        return () => clearTimeout(timer);
    }
  }, [autoDeal, table?.status, JSON.stringify(mySeats), recentWinAmount, betAmountStr, sideBetsEnabled, pairBetStr, plus3BetStr]);

  const scrollSeats = (dir: 'left' | 'right') => {
    if (seatsContainerRef.current) {
      seatsContainerRef.current.scrollBy({ left: dir === 'left' ? -150 : 150, behavior: 'smooth' });
    }
  };

  const calculateShoeStats = () => {
    const defaultTotal = 312; // 6 decks
    const defaultA = 24;
    const defaultT = 96;
    const defaultS = 192;
    
    if (!table?.discardedCards) return { a: '7.7', t: '30.8', s: '61.5' };
    
    let aRemoved = 0;
    let tRemoved = 0;
    let sRemoved = 0;
    
    const countCards = (cards: any[]) => {
       cards?.forEach(c => {
         if (c.value === 'A') aRemoved++;
         else if (['10', 'J', 'Q', 'K'].includes(c.value)) tRemoved++;
         else sRemoved++;
       });
    };
    
    countCards(table.discardedCards);
    table.seats.forEach(seat => countCards(seat.hand?.cards || []));
    countCards(table.dealerHand?.cards || []);
    
    const remainingTotal = defaultTotal - aRemoved - tRemoved - sRemoved || 1;
    const a = defaultA - aRemoved;
    const t = defaultT - tRemoved;
    const s = defaultS - sRemoved;
    
    return {
      a: ((a / remainingTotal) * 100).toFixed(1),
      t: ((t / remainingTotal) * 100).toFixed(1),
      s: ((s / remainingTotal) * 100).toFixed(1)
    };
  };

  useEffect(() => {
    if (table && table.deck && previousDeckLength.current > 0) {
      if (table.deck.length > previousDeckLength.current) {
        soundManager.playShuffle();
        setIsShuffling(true);
        setTimeout(() => setIsShuffling(false), 5000);
      }
    }
    previousDeckLength.current = table?.deck?.length || 0;
  }, [table?.deck?.length]);

  useEffect(() => {
    soundManager.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    const settledNow =
      table &&
      table.status === 'waiting' &&
      (previousStatus.current === 'playing' ||
        (previousRoundsPlayed.current !== undefined &&
          (table.roundsPlayed || 0) > previousRoundsPlayed.current));
    if (settledNow) {
       // Find the most recent record
       const lastRecord = gameRecords[0];
       if (lastRecord && lastRecord.tableId === table.id) {
           // net win is amount won > bet ? true : false
           const winningSeats: number[] = [];
           let myWon = false;
           table.seats.forEach((s, idx) => {
               const res = lastRecord.seatResults?.find(sr => sr.seatIndex === idx);
               const isHandWin = s.hand && (s.hand.status === 'won' || s.hand.status === 'blackjack');
               const hasSideOrInsWin = Boolean(
                 (res && ((res.sideBetWin || 0) > 0 || (res.insuranceWin || 0) > 0 || (res.win || 0) > 0)) ||
                 (s.hand && ((s.hand.sideBetPairWon || 0) > 0 || (s.hand.sideBetPlus3Won || 0) > 0))
               );
               if (isHandWin || (res && res.net > 0) || hasSideOrInsWin) {
                 winningSeats.push(idx);
                 if (s.userId === currentUser?.id) myWon = true;
               }
           });
           setRecentWinAmount({ amount: lastRecord.amountWon || 0, won: myWon, seats: winningSeats });
           setTimeout(() => {
              setRecentWinAmount(null);
           }, table.seats.length * 150 + 5000); // 

           if (myWon) {
               // Calculate pan based on the first winning seat
               const winPan = table.seats.length > 1 ? (winningSeats[0] / (table.seats.length - 1)) * 2 - 1 : 0;
               soundManager.playWin(winPan);
           } else {
               // If there were any active players that lost, just pan to the first active one, otherwise 0
               const firstActive = lastRecord.seatResults?.[0]?.seatIndex || 0;
               const losePan = table.seats.length > 1 ? (firstActive / (table.seats.length - 1)) * 2 - 1 : 0;
               soundManager.playLose(losePan);
           }
       }
    }
    previousStatus.current = table?.status;
    previousRoundsPlayed.current = table?.roundsPlayed;
  }, [table?.status, table?.id, table?.roundsPlayed, JSON.stringify(table?.seats), gameRecords]);

  useEffect(() => {
    if (table) {
      setBetAmountStr(table.settings.minBet.toString());
    }
  }, [table?.settings.minBet]);

  useEffect(() => {
    if (window.innerWidth >= 768) return;

    let targetSeatIdx = -1;
    if (table?.status === 'playing' && table.currentTurnIndex >= 0) {
      targetSeatIdx = table.currentTurnIndex;
    } else if (table?.status === 'waiting' && mySeats.length > 0) {
      // Find the last selected seat instead, or the first.
      targetSeatIdx = mySeats[0];
    }

    if (targetSeatIdx >= 0) {
      setTimeout(() => {
        const seatEl = document.getElementById(`seat-${targetSeatIdx}`);
        if (seatEl && seatsContainerRef.current) {
          const container = seatsContainerRef.current;
          const scrollLeft = seatEl.offsetLeft - container.offsetWidth / 2 + seatEl.offsetWidth / 2;
          container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [table?.status, table?.currentTurnIndex, mySeats]);

  useEffect(() => {
    if (table?.status === 'playing' && table.currentTurnIndex >= 0) {
      setActionCountdown(table.settings.actionTimeLimit || 15);
    } else {
      setActionCountdown(null);
    }
  }, [table?.status, table?.currentTurnIndex, table?.settings.actionTimeLimit, currentUser?.id, JSON.stringify(table?.seats)]);

  useBotBehavior(table, hit, stand);

  const activeTurnSeatForEffects =
    table?.status === 'playing' && table.currentTurnIndex >= 0
      ? table.seats[table.currentTurnIndex]
      : undefined;
  const isActiveTurnDealRevealed =
    table?.status === 'playing' && table.currentTurnIndex >= 0
      ? isSeatDealRevealed(table.currentTurnIndex, activeTurnSeatForEffects?.originalSeatIndex)
      : true;

  useEffect(() => {
    if (!isActiveTurnDealRevealed) return;
    if (actionCountdown !== null && actionCountdown > 0) {
      const isTurn = table?.status === 'playing' && table?.currentTurnIndex >= 0 && table?.seats[table.currentTurnIndex]?.userId === currentUser?.id;
      if (isTurn && actionCountdown <= 6) {
          const pan = table && table.seats.length > 1 && table.currentTurnIndex >= 0 ? (table.currentTurnIndex / (table.seats.length - 1)) * 2 - 1 : 0;
          soundManager.playTick(pan);
      }
      const timer = setTimeout(() => setActionCountdown(actionCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (actionCountdown === 0 && table?.status === 'playing') {
      setActionCountdown(-1); // Prevent zero value from spilling over to the next turn's render phase
      const activeSeat = table.currentTurnIndex;
      if (activeSeat >= 0 && table.seats[activeSeat] && table.seats[activeSeat].hand?.status === 'playing') {
        stand(table.id, activeSeat);
      }
    }
  }, [actionCountdown, isActiveTurnDealRevealed, table?.status, table?.id, table?.currentTurnIndex, stand, hit, currentUser?.id, JSON.stringify(table?.seats)]);

  const prevActionSnapshot = React.useRef('');
  useEffect(() => {
    if (!table || !currentUser) return;
    const isTurn = table.status === 'playing' && table.currentTurnIndex >= 0 && table.seats[table.currentTurnIndex]?.userId === currentUser.id;
    if (isTurn && isActiveTurnDealRevealed) {
        const snapshot = `${table.currentTurnIndex}`;
        if (prevActionSnapshot.current !== snapshot) {
            const pan = table.seats.length > 1 && table.currentTurnIndex >= 0 ? (table.currentTurnIndex / (table.seats.length - 1)) * 2 - 1 : 0;
            soundManager.playBell(pan);
            prevActionSnapshot.current = snapshot;
        }
    } else if (!isTurn) {
        prevActionSnapshot.current = '';
    }
  }, [table?.status, table?.currentTurnIndex, isActiveTurnDealRevealed, JSON.stringify(table?.seats), currentUser?.id]);

  if (!table || !currentUser) {
    return (
      <div className="w-full flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const activeSeatIndex = table.currentTurnIndex;
  const isMyTurn = table.status === 'playing' && activeSeatIndex >= 0 && table.seats[activeSeatIndex]?.userId === currentUser.id;
  const activeHand = isMyTurn ? table.seats[activeSeatIndex].hand : null;
  const myUserBal = table.userBalances?.[currentUser.id]?.balance || 0;
  const canDouble = isMyTurn && activeHand?.cards.length === 2 && myUserBal >= (activeHand?.bet || 0);
  const isPlayerDealt = table.status === 'playing' && mySeats.some(sIdx => table.seats[sIdx].hand !== null);
  
  const currentHandsCountForSeat = isMyTurn ? (() => {
    const seat = table.seats[activeSeatIndex];
    const origSeatIdx = seat.originalSeatIndex !== undefined ? seat.originalSeatIndex : activeSeatIndex;
    return table.seats.filter(s => s.originalSeatIndex === origSeatIdx).length + (seat.originalSeatIndex === undefined ? 1 : 0);
  })() : 0;
  
  const canSplit = canDouble && activeHand?.cards[0].value === activeHand?.cards[1].value && myUserBal >= (activeHand?.bet || 0) && currentHandsCountForSeat < 4;
  const canBuyInsurance =
    isMyTurn &&
    activeHand?.cards.length === 2 &&
    !table.seats[activeSeatIndex]?.isSplitHand &&
    myUserBal >= (activeHand?.bet || 0) / 2 &&
    table.dealerHand?.cards[0]?.value === 'A' &&
    !activeHand?.insuranceBet;

  const sideBetsTotalStr = sideBetsEnabled ? (parseInt(pairBetStr.replace(/,/g, '') || '0') + parseInt(plus3BetStr.replace(/,/g, '') || '0')) : 0;
  const myTotalBet = table.status === 'playing' 
    ? table.seats.filter(s => s.userId === currentUser.id && s.hand).reduce((sum, s) => {
        const sideBetSum = (s.hand!.sideBets?.pair || 0) + (s.hand!.sideBets?.twentyOnePlusThree || 0);
        return sum + s.hand!.bet + sideBetSum;
      }, 0)
    : ((parseInt(betAmountStr.replace(/,/g, '') || '0') + sideBetsTotalStr) * mySeats.length);

  const toggleSeatSelection = async (seatIndex: number) => {
    if (table.status !== 'waiting') return;
    const clickPan = table.seats.length > 1 ? (seatIndex / (table.seats.length - 1)) * 2 - 1 : 0;
    soundManager.playClick(clickPan);
    
    const seat = table.seats[seatIndex];
    if (seat.userId === null) {
       await joinTable(table.id, seatIndex, 'Gcoin');
    } else if (seat.userId === currentUser.id) {
       await leaveTable(table.id, seatIndex);
    }
  };

  const handleUnlockRequest = () => {
    if (!table || !currentUser) return;
    
    if (mySeats.length > 0) {
      setConfirmAction({
        title: 'Table Action',
        message: 'You must stand up to switch play modes.',
        confirmText: 'OK',
        onConfirm: () => {}
      });
      return;
    }

    setConfirmAction({
      title: 'Unlock Funds',
      message: 'You have locked funds on this table. Would you like to unlock them now to switch modes?',
      confirmText: 'Unlock',
      onConfirm: async () => {
        await unlockTableBalance(table.id);
      }
    });
  };

  const handleStartGame = async () => {
    soundManager.playChip();
    setRecentWinAmount(null);
    if (mySeats.length === 0) {
      setShakeSeats(true);
      setTimeout(() => setShakeSeats(false), 500);
      return;
    }
    const amountStr = betAmountStr.replace(/,/g, '');
    let amount = parseInt(amountStr || '0', 10);
    if (isNaN(amount)) amount = 0;

    let pairAmt = parseInt(pairBetStr.replace(/,/g, '') || '0', 10);
    if (isNaN(pairAmt) || !sideBetsEnabled) pairAmt = 0;
    
    let plus3Amt = parseInt(plus3BetStr.replace(/,/g, '') || '0', 10);
    if (isNaN(plus3Amt) || !sideBetsEnabled) plus3Amt = 0;

    const singleBet = amount + pairAmt + plus3Amt;
    const totalBet = singleBet * mySeats.length;
    const canAfford = myUserBal >= totalBet;

    if (amount >= table.settings.minBet && amount <= table.settings.maxBet && canAfford) {
      if (isPlacingBetRef.current) return;
      try {
        isPlacingBetRef.current = true;
        for (const seatIndex of mySeats) {
          await placeBet(table.id, seatIndex, amount, { pair: pairAmt, twentyOnePlusThree: plus3Amt });
        }
      } catch (err: any) {
        console.warn("Could not place bet:", err);
      } finally {
        setTimeout(() => { isPlacingBetRef.current = false; }, 1000);
      }
    } else if (!canAfford && myUserBal < table.settings.minBet) {
      setConfirmAction({
        title: 'Free 5,000 Game Coins Refill',
        message: 'You are out of Game Coins! Claim a fresh 5,000 Game Coins refill for free to keep playing.',
        confirmText: 'Claim 5,000 Coins',
        onConfirm: async () => {
          await refillGameCoins(table.id);
        }
      });
    } else {
      setConfirmAction({
        title: 'Insufficient Game Coins',
        message: `Total bet (${totalBet.toLocaleString()}) exceeds your current Game Coins (${myUserBal.toLocaleString()}). Lower your bet or claim a 5,000 Game Coins refill when your balance reaches 0.`,
        confirmText: 'OK',
        onConfirm: () => {}
      });
    }
  };

  const getEffectiveSteps = () => {
    const playerBal = table.userBalances?.[currentUser.id]?.balance || 0;
    const maxVal = Math.floor(Math.min(table.settings.maxBet, playerBal || (playMode === 'Bonus' ? (currentUser.bonusBalance || 0) : currentUser.balance)));
    const minBet = table.settings.minBet;
    
    let baseSteps = [minBet, minBet * 2, minBet * 5, minBet * 10, minBet * 20, minBet * 50, minBet * 100];
    
    let steps = baseSteps.filter(v => v < maxVal);
    if (!steps.includes(maxVal) && maxVal > 0) steps.push(maxVal);
    if (steps.length === 0) steps = [minBet];
    return { steps, maxVal, minVal: minBet };
  };

  const handleMinus = () => {
    soundManager.playClick();
    const { steps } = getEffectiveSteps();
    const current = parseFloat(betAmountStr.replace(/,/g, '')) || 0;
    
    let nextVal = [...steps].reverse().find(v => v < current);
    if (nextVal === undefined) nextVal = steps[0];
    setBetAmountStr(nextVal.toLocaleString('en-US'));
  };

  const handlePlus = () => {
    soundManager.playClick();
    const { steps, maxVal } = getEffectiveSteps();
    const current = parseFloat(betAmountStr.replace(/,/g, '')) || 0;
    
    let nextVal = steps.find(v => v > current);
    if (nextVal === undefined) nextVal = maxVal;
    
    setBetAmountStr(nextVal.toLocaleString('en-US'));
  };

  const handleBetBlur = () => {
    if (betAmountStr === '') {
      setBetAmountStr(table.settings.minBet.toString());
      return;
    }
    let current = parseFloat(betAmountStr.replace(/,/g, '')) || 0;
    const { maxVal } = getEffectiveSteps();
    const min = table.settings.minBet;
    if (current < min) current = min;
    if (current > maxVal) current = maxVal;
    setBetAmountStr(current.toLocaleString('en-US'));
  };

  const handlePlus3Minus = () => {
    soundManager.playClick();
    const { steps } = getEffectiveSteps();
    const current = parseFloat(plus3BetStr.replace(/,/g, '')) || 0;
    let nextVal = [...steps].reverse().find((v: number) => v < current);
    if (nextVal === undefined) nextVal = 0;
    setPlus3BetStr(nextVal.toString());
  };

  const handlePlus3Plus = () => {
    soundManager.playClick();
    const { steps, maxVal } = getEffectiveSteps();
    const current = parseFloat(plus3BetStr.replace(/,/g, '')) || 0;
    let nextVal = steps.find((v: number) => v > current);
    if (nextVal === undefined) nextVal = maxVal;
    setPlus3BetStr(nextVal.toString());
  };

  const handlePlus3Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, ''); 
    if (val.startsWith('0') && val.length > 1) val = val.replace(/^0+/, '0');
    setPlus3BetStr(val);
  };

  const handlePlus3Blur = () => {
    if (plus3BetStr === '') {
      setPlus3BetStr('0');
      return;
    }
    const { maxVal } = getEffectiveSteps();
    let current = parseFloat(plus3BetStr.replace(/,/g, '')) || 0;
    if (current < 0) current = 0;
    if (current > maxVal) current = maxVal;
    setPlus3BetStr(current.toString());
  }

  const handlePairMinus = () => {
    soundManager.playClick();
    const { steps } = getEffectiveSteps();
    const current = parseFloat(pairBetStr.replace(/,/g, '')) || 0;
    let nextVal = [...steps].reverse().find((v: number) => v < current);
    if (nextVal === undefined) nextVal = 0;
    setPairBetStr(nextVal.toString());
  };

  const handlePairPlus = () => {
    soundManager.playClick();
    const { steps, maxVal } = getEffectiveSteps();
    const current = parseFloat(pairBetStr.replace(/,/g, '')) || 0;
    let nextVal = steps.find((v: number) => v > current);
    if (nextVal === undefined) nextVal = maxVal;
    setPairBetStr(nextVal.toString());
  };

  const handlePairChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, ''); 
    if (val.startsWith('0') && val.length > 1) val = val.replace(/^0+/, '0');
    setPairBetStr(val);
  };

  const handlePairBlur = () => {
    if (pairBetStr === '') {
      setPairBetStr('0');
      return;
    }
    const { maxVal } = getEffectiveSteps();
    let current = parseFloat(pairBetStr.replace(/,/g, '')) || 0;
    if (current < 0) current = 0;
    if (current > maxVal) current = maxVal;
    setPairBetStr(current.toString());
  }

  const handleBetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.startsWith('0') && val.length > 1) {
      val = val.replace(/^0+/, '');
    }
    setBetAmountStr(val);
  };

  const renderCard = (c: PlayingCardType, index: number, globalDelayIndex: number = 0, pan: number = 0) => (
    <PlayingCard 
      key={`${c.value}-${c.suit}-${index}`} 
      card={c} 
      index={index} 
      globalDelayIndex={globalDelayIndex} 
      size={table?.seats.length > 5 ? 'sm' : 'md'} 
      pan={pan}
    />
  );

  const activeTables = Object.values(tables).filter(t => t.status !== 'closed' && t.settings.isPublic);

  const smallestAvailableSeatNumber = Math.min(...table.seats.map((s, idx) => s.userId === null ? table.seats.length - idx : Infinity));

  return (
    <div className="w-full h-full flex flex-col items-center relative overflow-hidden font-sans">
      
      {/* FULL WIDTH TABLE BACKGROUND */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#134226] via-[#1a5b33] to-[#0f341d] shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] mix-blend-overlay"></div>
        {/* Soft vignette at edges to blend */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,0.5) 100%)'}}></div>
      </div>

      <WinAnimation />

      {showRules && <RulesModal onClose={() => setShowRules(false)} winningRule={table.settings.winningRule} settings={table.settings} />}
      
      {confirmAction && (
        <ConfirmModal action={confirmAction} onClose={() => setConfirmAction(null)} />
      )}

      {/* Cross-table Personal Stats Widget & Floating Trigger (Right Side) */}
      <RankWidget onOpenChange={setIsStatsOpen} />

      {/* Floating Play Board Trigger Button & Sidebar (Left Side - Top) */}
      <div className="fixed left-0 top-[calc(52%-2rem)] md:top-[calc(52%-2.4rem)] -translate-y-1/2 z-[90] flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsTablePlayersOpen(true)}
          title="Play Board (Table Record & My Record)"
          className="bg-zinc-950 border-y-2 border-r-2 border-[#d4af37] rounded-r-2xl p-2 md:p-2.5 pl-2.5 md:pl-3.5 shadow-[0_0_15px_rgba(212,175,55,0.35)] transition-all hover:translate-x-1 cursor-pointer flex flex-col items-center group relative"
        >
          <Crown className="w-4 h-4 md:w-5 md:h-5 text-[#ffd86b] group-hover:scale-110 transition-transform" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#f5e6c8] mt-0.5">
            Board
          </span>
        </button>
      </div>
      <TablePlayersSidebar
        isOpen={isTablePlayersOpen}
        onClose={() => setIsTablePlayersOpen(false)}
        table={table}
        gameRecords={gameRecords}
      />

      {/* Floating Table List (Lobby Sidebar) Trigger Button (Left Side - Bottom) */}
      <div className="fixed left-0 top-[calc(52%+2.2rem)] md:top-[calc(52%+2.6rem)] -translate-y-1/2 z-[90] flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => onToggleSidebar && onToggleSidebar()}
          title="Tables Lobby"
          className="bg-zinc-950 border-y-2 border-r-2 border-[#d4af37] rounded-r-2xl p-2 md:p-2.5 pl-2.5 md:pl-3.5 shadow-[0_0_15px_rgba(212,175,55,0.35)] transition-all hover:translate-x-1 cursor-pointer flex flex-col items-center group relative"
        >
          <div className="relative">
            <Menu className="w-4 h-4 md:w-5 md:h-5 text-[#ffd86b] group-hover:scale-110 transition-transform" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#f5e6c8] mt-0.5">
            Tables
          </span>
        </button>
      </div>

      {/* Top Header Bar: Exit button on left, centered Balance & Host Tables pill in middle, spacer on right */}
      <div className="w-full max-w-[1200px] flex items-center justify-between gap-1.5 sm:gap-3 z-40 px-2 sm:px-4 pt-2 sm:pt-2.5 md:pt-3 [@media(max-height:740px)]:pt-1.5 pb-0.5 relative pointer-events-none shrink-0">
        <button
          onClick={() => onNavigate('lobby')}
          className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center text-white/80 hover:text-white rounded-full bg-black/50 hover:bg-black/70 border border-white/20 backdrop-blur-md transition-all cursor-pointer pointer-events-auto shadow-lg shrink-0"
          title="Return to Lobby"
        >
          <LogOut className="w-4 h-4 sm:w-4.5 sm:h-4.5 scale-x-[-1]" />
        </button>

        <div className="flex flex-row items-center justify-center gap-1.5 sm:gap-3 pointer-events-auto flex-1 max-w-[440px] mx-auto min-w-0">
          <div className="relative flex flex-row items-center border-[2px] border-[#6b4c2a] rounded-full bg-gradient-to-b from-[#eac574] via-[#d0a758] to-[#997027] p-0.5 sm:p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(0,0,0,0.4),0_4px_10px_rgba(0,0,0,0.5)] justify-between flex-1 h-[36px] sm:h-[40px] md:h-[44px] min-w-0">
            <div className="absolute left-1 right-1 inset-y-1 bg-black/20 pointer-events-none rounded-full z-0"></div>

              <div id="balance-container" className="flex-1 flex flex-row items-center justify-between h-full w-full relative z-10 bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full px-2 sm:px-3.5 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6),0_1px_1px_rgba(255,255,255,0.4)] border border-[#3a2510] min-w-0">
               <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-bold tracking-wider truncate">
                  {(() => {
                    const userBal = table.userBalances?.[currentUser.id];
                    const displayBalance = userBal ? userBal.balance : currentUser.balance;
                    const isOutOfCoins = displayBalance < table.settings.minBet && (table.status === 'waiting' || myTotalBet === 0);
                    return (
                      <>
                        <CurrencyIcon currency="Chip" className="w-3.5 h-3.5 shrink-0" />
                        <div className="flex items-center truncate">
                          <span className="text-[13px] sm:text-[15px] md:text-[16px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] font-mono text-[#ffc53d] truncate">
                            {displayBalance.toLocaleString('en-US', {minimumFractionDigits: displayBalance % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})}
                          </span>
                          {isOutOfCoins && (
                            <button 
                              onClick={async () => {
                                soundManager.playChip();
                                await refillGameCoins(table.id);
                              }}
                              className="ml-1 sm:ml-2 text-black text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full border border-white/30 transition-colors pointer-events-auto shadow-[0_2px_6px_rgba(0,0,0,0.5)] hover:brightness-110 bg-gradient-to-r from-[#ffd86b] to-[#eaaa08] font-extrabold tracking-tight cursor-pointer whitespace-nowrap shrink-0"
                              title="Claim free 5,000 Game Coins refill"
                            >
                              +5K
                            </button>
                          )}
                        </div>
                      </>
                    )
                 })()}
               </div>
  
               <div className="w-px h-3.5 sm:h-4 bg-white/10 mx-1 sm:mx-2 shadow-[1px_0_0_rgba(0,0,0,0.3)] shrink-0" />
  
               <div 
                 className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold tracking-wider cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                 onClick={() => setShowHistory(!showHistory)}
               >
                 {recentWinAmount ? (
                   <motion.div 
                     key="win"
                     initial={{ y: -10, opacity: 0 }}
                     animate={{ y: 0, opacity: 1 }}
                     className={cn(
                       "flex items-center gap-1 sm:gap-2 text-[12px] sm:text-[14px]",
                       recentWinAmount.won ? "text-emerald-400" : (recentWinAmount.amount > 0 ? "text-yellow-400" : "text-white/60")
                     )}
                   >
                     <span className="uppercase font-bold tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-[10px] sm:text-[12px]">
                        {recentWinAmount.won ? "WIN" : (recentWinAmount.amount > 0 ? "RET" : "")}
                     </span>
                     {recentWinAmount.amount > 0 && (
                       <>
                         <CurrencyIcon currency="Chip" className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                         <span className="font-mono text-[13px] sm:text-[15px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-[#ffc53d]">{recentWinAmount.amount % 1 !== 0 ? recentWinAmount.amount.toFixed(2) : recentWinAmount.amount}</span>
                       </>
                     )}
                   </motion.div>
                 ) : (
                   <div className="flex items-center gap-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                     <div className="flex items-center gap-0.5 text-white/60 uppercase text-[9px] sm:text-[10px]">
                       <ArrowDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                       <span>Bet</span>
                     </div>
                     <CurrencyIcon currency="Chip" className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                     <span className="font-mono text-[12px] sm:text-[15px] text-[#ffc53d]">{myTotalBet % 1 !== 0 ? myTotalBet.toFixed(2) : myTotalBet}</span>
                   </div>
                 )}
               </div>
            </div>
          </div>
          <button 
            disabled={isPlayerDealt}
            onClick={() => { 
                const processNavigate = () => {
                    const success = onNavigate(hasHostedTables ? 'manage_tables' : 'host_table'); 
                    if (success !== false) {
                       leaveTable(table.id);
                    }
                };
                const userBal = table.userBalances?.[currentUser!.id];
                if (userBal) {
                    setConfirmAction({
                        title: "Leave Table",
                        message: "You have Game Coins on this table. Do you want to unlock your funds?",
                        confirmText: "Unlock & Leave",
                        cancelText: "Just Leave",
                        onConfirm: async () => {
                            await unlockTableBalance(table.id);
                            processNavigate();
                        },
                        onCancel: () => processNavigate()
                    });
                } else {
                    processNavigate();
                }
            }}
            className={cn("flex text-[9px] sm:text-[11px] font-black uppercase tracking-wider text-white px-1.5 sm:px-2.5 py-1.5 sm:py-2 rounded-[10px] sm:rounded-[14px] items-center gap-1 shadow-[inset_0_2px_2px_rgba(255,255,255,0.3),inset_0_-2px_4px_rgba(0,0,0,0.4),0_4px_8px_rgba(0,0,0,0.5)] border transition-transform whitespace-nowrap shrink-0 group relative", isPlayerDealt ? "bg-black/50 border-white/10 opacity-50" : "bg-gradient-to-b from-[#28a19b] to-[#126b6f] hover:from-[#2ebaba] hover:to-[#178287] border-[#0d4f52] hover:scale-105 active:scale-95")}
          >
            {hasLowLiquidityAlert && (
               <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-white/20 shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10" />
            )}
            <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{hasHostedTables ? "Manage" : "Host"}</span>
          </button>
        </div>

        {/* Right Symmetrical Spacer */}
        <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 shrink-0 pointer-events-none" />
      </div>
               {showHistory && (
                 <div className="fixed inset-0 z-50 pointer-events-auto bg-black/40 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
               )}
               <AnimatePresence>
             {showHistory && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95, y: "-40%", x: "-50%" }}
                 animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
                 exit={{ opacity: 0, scale: 0.95, y: "-40%", x: "-50%" }}
                 style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                 className="fixed top-1/2 left-1/2 w-full max-w-[95%] sm:w-[400px] bg-[#1e2025]/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl max-h-[80vh] overflow-y-auto pointer-events-auto hide-scrollbar-custom z-[60] origin-center"
               >
                 <style>{`.hide-scrollbar-custom::-webkit-scrollbar { display: none; }`}</style>
                 <div className="flex justify-between items-center mb-3">
                   <h3 className="text-white text-sm font-bold tracking-wider">My Record</h3>
                   <button onClick={() => setShowHistory(false)} className="text-white/50 hover:text-white transition-colors">✕</button>
                 </div>
                 {gameRecords.length === 0 ? (
                   <div className="text-white/40 text-xs text-center py-4">No records yet.</div>
                 ) : (
                   <div className="flex flex-col gap-3">
                     {gameRecords.filter(r => (r.seatResults || []).some(sr => sr.userId === currentUser.id)).map(record => {
                        const mySeatResults = (record.seatResults || []).filter(sr => sr.userId === currentUser.id);
                        const totalBet = mySeatResults.reduce((sum, sr) => sum + (sr.bet || 0) + (sr.sideBet || 0) + (sr.insuranceBet || 0), 0) || 0;
                        const totalNet = mySeatResults.length > 0
                          ? mySeatResults.reduce((sum, sr) => sum + (sr.net || 0), 0)
                          : (record.amountWon - totalBet);

                        const ts = new Date(record.timestamp);
                        const yy = ts.getFullYear().toString().slice(-2);
                        const mm = (ts.getMonth() + 1).toString().padStart(2, '0');
                        const dd = ts.getDate().toString().padStart(2, '0');
                        const hh = ts.getHours().toString().padStart(2, '0');
                        const mmm = ts.getMinutes().toString().padStart(2, '0');
                        const ss = ts.getSeconds().toString().padStart(2, '0');
                        const dateStr = `${yy}${mm}${dd} ${hh}:${mmm}:${ss}`;
                        
                        return (
                          <div key={record.id} className="flex flex-col bg-[#2a2c33] rounded-xl p-3 border border-white/5">
                            <div className="flex justify-between items-center w-full">
                              <span className="text-white/60 text-xs font-mono">
                                {dateStr}
                                {record.dealerScore ? <span className="ml-2 px-1 text-[10px] bg-white/10 rounded">DLR: {record.dealerScore}</span> : null}
                              </span>
                              <div className="flex items-center gap-6">
                                <div className="flex flex-col items-end">
                                  <span className="text-white/40 text-[10px] font-bold tracking-wider mb-1">BET</span>
                                  <div className="flex items-center gap-1.5">
                                    {record.currency === 'Bonus' ? (
                                        <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-b from-[#818cf8] to-[#4338ca] border-[1px] border-[#312e81] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden">
                                           <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px]"></div>
                                        </div>
                                    ) : (
                                        <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] relative overflow-hidden">
                                          <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                        </div>
                                    )}
                                    <span className={cn("text-sm font-mono", record.currency === 'Bonus' ? "text-indigo-300" : "text-white")}>{totalBet}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-white/40 text-[10px] font-bold tracking-wider mb-1">NET</span>
                                  <div className="flex items-center gap-1.5">
                                    {record.currency === 'Bonus' ? (
                                        <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-b from-[#818cf8] to-[#4338ca] border-[1px] border-[#312e81] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden">
                                           <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px]"></div>
                                        </div>
                                    ) : (
                                        <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] relative overflow-hidden">
                                          <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                        </div>
                                    )}
                                    <span className={cn("text-sm font-mono font-bold", totalNet >= 0 ? "text-emerald-400" : "text-[#ff6b6b]")}>
                                      {totalNet > 0 ? "+" : ""}{totalNet % 1 !== 0 ? totalNet.toFixed(2) : totalNet}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {mySeatResults.length > 0 && (
                               <div className="w-full mt-3 pt-3 border-t border-white/5 flex flex-col gap-2">
                                 {mySeatResults.map((sr, idx) => (
                                    <div key={idx} className="flex flex-col gap-1.5 border-b border-white/5 last:border-0 pb-2 last:pb-0">
                                      <div className="flex justify-between items-center">
                                        <span className="text-white/60 text-[11px] uppercase tracking-wider font-bold">Seat {sr.seatIndex + 1} {sr.isSplit && <span className="text-blue-400/80 ml-1">(Split Hand)</span>}</span>
                                        <span className={cn("text-[10px] uppercase font-bold py-0.5 px-2 rounded-full",
                                            sr.action.includes('won') || sr.action.includes('blackjack') ? "bg-emerald-500/20 text-emerald-400" : 
                                            sr.action.includes('lost') ? "bg-red-500/20 text-red-400" : 
                                            "bg-slate-500/20 text-slate-400"
                                        )}>{sr.action}</span>
                                      </div>
                                      <div className="flex justify-between items-center bg-black/20 rounded-lg p-1.5 px-2 border border-white/5 shadow-inner">
                                        <div className="flex gap-4">
                                          <div className="flex flex-col">
                                            <span className="text-white/30 text-[9px] font-bold">SCORE</span>
                                            <span className="text-white/80 text-[11px] font-mono">
                                              {sr.action === 'blackjack' ? 'BJ' : (sr.score || '-')}
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-white/30 text-[9px] font-bold">BET</span>
                                            <span className="text-white/80 text-[11px] font-mono">{sr.bet}</span>
                                          </div>
                                          {!!sr.sideBet && sr.sideBet > 0 && (
                                            <div className="flex flex-col">
                                              <span className="text-white/30 text-[9px] font-bold">SIDE</span>
                                              <span className="text-white/80 text-[11px] font-mono">
                                                {sr.sideBet}{' '}
                                                {!!sr.sideBetWin && sr.sideBetWin > 0 ? (
                                                  <span className="text-emerald-400 ml-1">
                                                    (+{sr.sideBetWin}
                                                    {(() => {
                                                      const tags: string[] = [];
                                                      if ((sr.pairWin || 0) > 0 && (sr.pairBet || 0) > 0) {
                                                        const m = Math.round((sr.pairWin || 0) / (sr.pairBet || 1)) - 1;
                                                        tags.push(m >= 25 ? 'Perfect Pair 25:1' : m >= 12 ? 'Colored Pair 12:1' : `Mixed Pair ${m}:1`);
                                                      }
                                                      if ((sr.plus3Win || 0) > 0 && (sr.plus3Bet || 0) > 0) {
                                                        const m = Math.round((sr.plus3Win || 0) / (sr.plus3Bet || 1)) - 1;
                                                        tags.push(m >= 100 ? 'Suited Trips 100:1' : m >= 40 ? 'Str. Flush 40:1' : m >= 30 ? 'Trips 30:1' : m >= 10 ? 'Straight 10:1' : `Flush ${m}:1`);
                                                      }
                                                      return tags.length > 0 ? ` · ${tags.join(', ')}` : '';
                                                    })()})
                                                  </span>
                                                ) : (
                                                  <span className="text-[#ff6b6b] ml-1">(-{sr.sideBet})</span>
                                                )}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex flex-col">
                                            <span className="text-white/30 text-[9px] font-bold">WIN</span>
                                            <span className="text-white/80 text-[11px] font-mono">{sr.win || 0}</span>
                                          </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                          <span className="text-white/30 text-[9px] font-bold">NET</span>
                                          <span className={cn("text-[12px] font-mono font-bold drop-shadow-md", sr.net >= 0 ? "text-emerald-400" : "text-[#ff6b6b]")}>{sr.net > 0 ? '+' : ''}{sr.net % 1 !== 0 ? sr.net.toFixed(2) : sr.net}</span>
                                        </div>
                                      </div>
                                    </div>
                                 ))}
                               </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                 )}
               </motion.div>
             )}
           </AnimatePresence>

      <div className="flex-1 w-full max-w-[1200px] flex flex-col items-center justify-between pb-0 pt-0 mt-0 ml-0 relative min-h-0 overflow-hidden origin-center">

<AnimatePresence>
             {isShuffling && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#2a2d36]/80 backdrop-blur-sm"
               >
                 <div className="relative w-32 h-40 flex items-center justify-center">
                   {/* Create a card shuffle animation using motion */}
                   {Array.from({ length: 5 }).map((_, i) => (
                     <motion.div
                       key={i}
                       className="absolute w-16 h-24 bg-cover bg-center border-[2px] border-black/50 rounded-md shadow-2xl"
                       style={{ backgroundImage: "url('/card-back.png')", backgroundColor: "#18452B" }}
                       animate={{
                         x: [0, -40, 40, 0],
                         y: [0, -10, 10, 0],
                         rotate: [0, -15, 15, 0],
                         zIndex: [i, 5 - i, i, 5 - i]
                       }}
                       transition={{
                         duration: 0.8,
                         repeat: Infinity,
                         repeatType: "loop",
                         delay: i * 0.15,
                         ease: "easeInOut"
                       }}
                     />
                   ))}
                 </div>
                 <motion.h2 
                   className="mt-6 text-xl font-bold tracking-widest text-[#32d5a4] uppercase drop-shadow-md"
                   animate={{ opacity: [0.5, 1, 0.5] }}
                   transition={{ duration: 1.5, repeat: Infinity }}
                 >
                   Shuffling...
                 </motion.h2>
               </motion.div>
             )}
           </AnimatePresence>


          {/* Table Closing Notification */}
          <AnimatePresence>
            {(table?.status === 'closing' || table?.status === 'closed') && (
               <motion.div
                 initial={{ opacity: 0, y: -20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
               >
                 <div className="bg-red-500/90 backdrop-blur-sm border border-red-400 text-white font-bold uppercase tracking-widest px-6 py-2 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                   {table?.status === 'closed' ? 'Table Closed' : 'Closing After This Round'}
                 </div>
               </motion.div>
            )}
          </AnimatePresence>

       {/* Dealer Area */}
           <DealerArea 
             houseId={table.houseId}
             name={table.name}
             houseName={table.houseName || (table.houseId === currentUser.id ? currentUser.name : undefined)}
             houseAvatar={table.houseAvatar || (table.houseId === currentUser.id ? currentUser.avatar : undefined)}
             dealerHand={table.status === 'playing' || recentWinAmount !== null || isResolvingRef.current ? table.dealerHand : null}
             totalSeats={table.seats.length}
             recentWinAmount={recentWinAmount}
             mode={table.settings.mode}
             liquidity={table.liquidity}
           />

           {/* Base curved lines decoration */}
           <div className="absolute top-[27%] sm:top-[29%] [@media(max-height:740px)]:top-[25%] [@media(max-height:520px)_and_(orientation:landscape)]:top-[24%] left-0 right-0 bottom-0 w-full overflow-hidden pointer-events-none flex justify-center items-start z-0 mt-[10px] sm:mt-[14px] md:mt-[18px] [@media(max-height:740px)]:mt-[8px] [@media(max-height:520px)_and_(orientation:landscape)]:mt-[4px]">
             {/* Outer golden line */}
             <div className="w-[240%] sm:w-[140%] md:w-[110%] aspect-[2/1] border-t-[8px] sm:border-t-[10px] border-[#c6a364] opacity-70 rounded-[100%] absolute top-0 shadow-[0_-2px_4px_rgba(0,0,0,0.8),inset_0_2px_2px_rgba(255,255,255,0.3)]"></div>
             {/* Inner thin golden line */}
             <div className="w-[230%] sm:w-[130%] md:w-[105%] aspect-[2/1] border-t-[2px] border-[#eac574] opacity-50 rounded-[100%] absolute top-[12px] sm:top-[16px] shadow-[0_-1px_2px_rgba(0,0,0,0.8)]"></div>
             {/* Faint inset betting area base line */}
             <div className="w-[220%] sm:w-[120%] md:w-[100%] aspect-[2/1] border-t-[1px] border-[#ffc53d] opacity-20 rounded-[100%] absolute top-[30px] sm:top-[40px]"></div>
           </div>

           {/* Game Rules Center Area */}
           <div className="absolute top-[35%] sm:top-[37%] [@media(max-height:740px)]:top-[33%] [@media(max-height:520px)_and_(orientation:landscape)]:top-[31%] mt-2 [@media(max-height:520px)_and_(orientation:landscape)]:mt-0.5 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 px-2 sm:px-4 whitespace-nowrap scale-[0.6] sm:scale-[0.8] md:scale-95 [@media(max-height:740px)]:scale-[0.82] [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.55] flex flex-col items-center gap-1 sm:gap-1.5 pointer-events-none">
              <span className="text-[#c6a364] text-[11px] md:text-[16px] font-black tracking-[0.3em] uppercase opacity-90" style={{ textShadow: '0px 1px 1px rgba(0,0,0,1), 0px -1px 1px rgba(0,0,0,0.8), 0px 0px 3px rgba(176,142,85,0.4)' }}>
                Blackjack Pays 3 to 2
              </span>
              <span className="text-[#c6a364] text-[8px] md:text-[10px] font-bold tracking-[0.2em] uppercase opacity-70" style={{ textShadow: '0px 1px 1px rgba(0,0,0,1)' }}>
                Dealer must draw to 16 and stand on all 17s
              </span>
              <span className="text-[#c6a364] text-[8px] md:text-[10px] font-bold tracking-[0.2em] uppercase opacity-70 flex items-center gap-2 sm:gap-3 mt-1 sm:mt-1.5" style={{ textShadow: '0px 1px 1px rgba(0,0,0,1)' }}>
                <span className="w-8 sm:w-16 h-[1.5px] bg-gradient-to-r from-transparent to-[#c6a364] shadow-[0_1px_1px_rgba(0,0,0,0.8)]"></span>
                Insurance pays 2 to 1
                <span className="w-8 sm:w-16 h-[1.5px] bg-gradient-to-l from-transparent to-[#c6a364] shadow-[0_1px_1px_rgba(0,0,0,0.8)]"></span>
              </span>
              
              <AnimatePresence>
                {dealCountdown !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute top-[100%] mt-2 sm:mt-3 z-[200] flex items-center justify-center pointer-events-none"
                  >
                    <div className="p-[2px] rounded-[10px] bg-gradient-to-br from-[#f8fafc] via-[#cbd5e1] to-[#64748b] shadow-[0_8px_16px_rgba(0,0,0,0.8)] overflow-hidden">
                      <div className="px-5 py-1.5 rounded-[8px] flex items-center justify-center border border-[#f8fafc]/30 relative shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] bg-gradient-to-r from-[#1a1c20] via-[#2d3139] to-[#1a1c20]">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 rounded-[8px]"></div>
                        <span className="text-[#f8fafc] text-xl sm:text-2xl font-mono font-black tracking-[0.2em] drop-shadow-[0_2px_2px_rgba(0,0,0,1)] z-10" style={{ textShadow: "0 2px 4px #000, 0 0 10px rgba(248,250,252,0.4)" }}>
                          {dealCountdown > 0 ? `DEAL IN ${dealCountdown}s` : 'DEALING...'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {table.settings.mode === 'tournament' && (
                 <div className="pointer-events-auto flex items-center justify-center gap-2 mt-2 border border-yellow-500/40 bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                    <div className="flex flex-col items-end border-r border-white/10 pr-2">
                        <span className="text-[8px] uppercase tracking-widest font-bold text-white/50">Ticket</span>
                        <span className="text-yellow-400 font-mono font-bold text-xs flex items-center gap-1 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08]"></div>
                            {table.settings.tournament?.ticketPrice}
                        </span>
                    </div>
                    <div className="flex flex-col items-center border-r border-white/10 px-2">
                        <span className="text-[8px] uppercase tracking-widest font-bold text-white/50">Start Chips</span>
                        <span className="text-blue-400 font-mono font-bold text-xs flex items-center gap-1 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-blue-400 border-[1px] border-blue-500"></div>
                            {table.settings.tournament?.startingChips}
                        </span>
                    </div>
                    <div className="flex flex-col items-start pl-2">
                        <span className="text-[8px] uppercase tracking-widest font-bold text-white/50">Min Blind</span>
                        <span className="text-red-400 font-mono font-bold text-xs flex items-center gap-1 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-red-400 border-[1px] border-red-500"></div>
                            {table.settings.tournament?.minBetChips || 50}
                        </span>
                    </div>
                 </div>
              )}
           </div>

           {/* Discard Pile (Left Top) */}
           <div className="absolute top-[42px] left-2 sm:top-[44px] sm:left-12 lg:top-8 lg:left-16 [@media(max-height:740px)]:top-4 [@media(max-height:740px)]:scale-[0.78] [@media(max-height:740px)]:origin-top [@media(max-height:520px)_and_(orientation:landscape)]:top-[28px] [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.65] [@media(max-height:520px)_and_(orientation:landscape)]:origin-top flex flex-col items-center pointer-events-auto cursor-pointer group" onClick={() => setShowDiscardStats(!showDiscardStats)}>
             <div className="relative w-[40px] h-[60px] sm:w-[52px] sm:h-[76px] md:w-[64px] md:h-[92px] lg:w-[76px] lg:h-[110px] group-hover:scale-105 transition-transform duration-200 z-30">
               {table.discardCount > 0 ? (
                 <div className="absolute inset-0 rounded-[6px] md:rounded-[8px] flex items-center justify-center overflow-hidden shadow-lg bg-[url('/discard.png')] bg-contain bg-center bg-no-repeat bg-[#2c2b2a]/80">
                   <span className="text-white/80 text-xl font-mono leading-none z-10">{table.discardCount}</span>
                   <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-end pb-[20%] transition-opacity rounded-lg z-20">
                     <span className="text-white w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-white/40 flex items-center justify-center text-[10px] sm:text-[12px] font-bold shadow-xl bg-black/40">i</span>
                   </div>
                 </div>
               ) : (
                 <div className="absolute inset-0 rounded-[6px] md:rounded-[8px] flex items-center justify-center overflow-hidden shadow-lg bg-[url('/discard.png')] bg-contain bg-center bg-no-repeat bg-[#2c2b2a]/80">
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-end pb-[20%] transition-opacity rounded-lg z-20">
                        <span className="text-[#c6a364] w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-[#c6a364]/40 flex items-center justify-center text-[10px] sm:text-[12px] font-bold shadow-xl bg-black/80">i</span>
                    </div>
                 </div>
               )}
             </div>

             <AnimatePresence>
                {showDiscardStats && (
                  <motion.div
                     initial={{ opacity: 0, y: -10, scale: 0.95 }}
                     animate={{ opacity: 1, y: 0, scale: 1 }}
                     exit={{ opacity: 0, y: -10, scale: 0.95 }}
                     className="absolute top-full mt-2 left-0 bg-[#1e2025]/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl z-[100] w-[240px] flex flex-col gap-2 origin-top-left"
                  >
                     <div className="flex flex-col gap-1 mb-1">
                        <div className="flex justify-between items-center">
                          <span className="text-white/80 text-[10px] uppercase font-black tracking-widest text-[#c6a364]">Shoe Composition</span>
                          <span className="text-white/30 text-[8px] uppercase font-bold tracking-wider text-right">Normal</span>
                        </div>
                        <span className="text-white/40 text-[9px] leading-tight">Green % is favorable for you. Red % is favorable for the dealer.</span>
                     </div>

                     <div className="flex justify-between items-center text-xs border-t border-white/5 pt-1.5">
                        <span className="text-white/80">A <span className="text-[9px] text-white/30 ml-1">(Good)</span></span>
                        <div className="flex items-center gap-2">
                           <span className={cn("font-mono w-10 text-right", Number(calculateShoeStats().a) < 7.7 ? "text-red-400" : Number(calculateShoeStats().a) > 7.7 ? "text-emerald-400" : "text-white/80")}>
                              {calculateShoeStats().a}%
                           </span>
                           <span className="text-white/30 text-[9px] w-9 text-right">7.7%</span>
                        </div>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-white/80">10, J, Q, K <span className="text-[9px] text-white/30 ml-1">(Good)</span></span>
                        <div className="flex items-center gap-2">
                           <span className={cn("font-mono w-10 text-right", Number(calculateShoeStats().t) < 30.8 ? "text-red-400" : Number(calculateShoeStats().t) > 30.8 ? "text-emerald-400" : "text-white/80")}>
                              {calculateShoeStats().t}%
                           </span>
                           <span className="text-white/30 text-[9px] w-9 text-right">30.8%</span>
                        </div>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-white/80">2 - 9 <span className="text-[9px] text-white/30 ml-1">(Bad)</span></span>
                        <div className="flex items-center gap-2">
                           <span className={cn("font-mono w-10 text-right", Number(calculateShoeStats().s) < 61.5 ? "text-emerald-400" : Number(calculateShoeStats().s) > 61.5 ? "text-red-400" : "text-white/80")}>
                              {calculateShoeStats().s}%
                           </span>
                           <span className="text-white/30 text-[9px] w-9 text-right">61.5%</span>
                        </div>
                     </div>
                  </motion.div>
                )}
             </AnimatePresence>
           </div>

           {/* Shoe / Deck (Right Top) */}
           <div className="absolute top-[42px] right-2 sm:top-[44px] sm:right-12 lg:top-8 lg:right-16 [@media(max-height:740px)]:top-4 [@media(max-height:740px)]:scale-[0.78] [@media(max-height:740px)]:origin-top [@media(max-height:520px)_and_(orientation:landscape)]:top-[28px] [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.65] [@media(max-height:520px)_and_(orientation:landscape)]:origin-top z-10 flex flex-col items-center gap-1.5 pointer-events-none">
             <div className="relative w-[40px] h-[60px] sm:w-[52px] sm:h-[76px] md:w-[64px] md:h-[92px] lg:w-[76px] lg:h-[110px]">
               {Array.from({ length: 12 }).map((_, i) => (
                 <div key={i} className={cn("absolute inset-0 rounded-lg shadow-sm border", i === 3 ? "bg-red-600 border-red-700" : "bg-white border-gray-300")} style={{ transform: `translate(${-i * 1.5}px, ${-i * 1.5}px)` }}>
                     {i === 11 && (
                         <div className="w-full h-full rounded-lg bg-cover bg-center border-2 border-white/20 opacity-90 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] flex items-center justify-center" style={{ backgroundImage: "url('/card-back.png')", backgroundColor: "#18452B" }}>
                         </div>
                     )}
                     {i === 3 && (
                         <div className="absolute top-[20%] left-[100%] bg-[#a58641] text-black text-[8px] sm:text-[10px] md:text-[11px] font-black pl-1 sm:pl-1.5 pr-0.5 py-0.5 rounded-r flex items-center justify-center shadow-lg border border-[#c6a364] border-l-0 whitespace-nowrap tracking-tighter">
                            75%
                         </div>
                     )}
                 </div>
               ))}
             </div>
             <span className="bg-black/40 text-[#ffc53d] text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded shadow-sm border border-[#ffc53d]/20 mt-1">6 Decks</span>
           </div>

           {/* Player Area */}
           <div className="w-full flex-[7] min-h-0 flex flex-col items-center justify-end relative z-20 mt-0 mb-0">
             
             <div className="relative w-full z-10 flex items-end justify-center group/seats h-full max-h-full min-h-0">
               <div
                 ref={seatsContainerRef}
                 className={cn(
                   "flex w-full md:w-[94%] max-w-[1040px] mx-auto h-full max-h-[420px] min-h-0 pt-[8px] sm:pt-[14px] md:pt-[20px] mt-auto mb-0",
                   sideBetsEnabled
                     ? "pb-[118px] sm:pb-[130px] md:pb-[136px] [@media(max-height:740px)]:pb-[112px]"
                     : "pb-[66px] sm:pb-[74px] md:pb-[78px] [@media(max-height:740px)]:pb-[62px]",
                   "[@media(max-height:520px)_and_(orientation:landscape)]:!h-auto [@media(max-height:520px)_and_(orientation:landscape)]:!pt-[4px] [@media(max-height:520px)_and_(orientation:landscape)]:!pb-[54px] [@media(max-height:520px)_and_(orientation:landscape)]:!mb-0 justify-start gap-[2%] sm:gap-[1%] items-end px-[4%] md:px-0 z-10 transition-all duration-300 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none hide-scrollbar-custom"
                 )}
               >
                 <style>{`.hide-scrollbar-custom::-webkit-scrollbar { display: none; }`}</style>
                 {table.seats.map((seat, seatIdx) => {
                     const isThisSeatTurn = table.status === 'playing' && table.currentTurnIndex === seatIdx;
                   const isSelected = mySeats.includes(seatIdx);
                   let isPairWon: boolean | null = null;
                   let isPlus3Won: boolean | null = null;
                   const seatDealRevealed = isSeatDealRevealed(seatIdx, seat.originalSeatIndex);
                   
                   if (seatDealRevealed && seat.hand && seat.hand.cards && seat.hand.cards.length >= 2) {
                     if (seat.hand.sideBetPairWon !== undefined) {
                       isPairWon = seat.hand.sideBetPairWon > 0;
                     } else {
                       isPairWon = seat.hand.cards[0].value === seat.hand.cards[1].value;
                     }
                     if (seat.hand.sideBetPlus3Won !== undefined) {
                       isPlus3Won = seat.hand.sideBetPlus3Won > 0;
                     } else if (table.dealerHand && table.dealerHand.cards && table.dealerHand.cards.length >= 1) {
                       const c1 = seat.hand.cards[0];
                       const c2 = seat.hand.cards[1];
                       const d1 = table.dealerHand.cards[0];
                       const suits = [c1.suit, c2.suit, d1.suit];
                       const values = [c1.value, c2.value, d1.value];
                       const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
                       const valueMap: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
                       const sortedVals = values.map(v => valueMap[v]).sort((a,b) => a - b);
                       const isStraight = (sortedVals[0] + 1 === sortedVals[1] && sortedVals[1] + 1 === sortedVals[2]) ||
                                          (sortedVals[0] === 2 && sortedVals[1] === 3 && sortedVals[2] === 14); // A, 2, 3
                       const isThreeOfAKind = values[0] === values[1] && values[1] === values[2];
                       isPlus3Won = isFlush || isStraight || isThreeOfAKind;
                     }
                   }
                   // const isEmptyInPlaying = !seat.hand && table.status === 'playing';
                   // if (isEmptyInPlaying) return null;
  
                   return (
                     <div key={seatIdx} id={`seat-${seatIdx}`} className={cn("relative flex flex-col items-center pt-[6px] sm:pt-[10px] md:pt-[14px] pb-[64px] sm:pb-[74px] md:pb-[82px] [@media(max-height:740px)]:!pb-[64px] px-0 justify-end sm:px-2 md:px-[6px] transition-all h-[200px] sm:h-[230px] md:h-[255px] [@media(max-height:740px)]:!h-[195px] [@media(max-height:520px)_and_(orientation:landscape)]:!h-[150px] [@media(max-height:520px)_and_(orientation:landscape)]:!pt-[4px] [@media(max-height:520px)_and_(orientation:landscape)]:!pb-[50px] rounded-[16px] sm:rounded-[24px] min-w-[31%] max-w-[31%] md:min-w-[13.5%] md:max-w-[13.5%] shrink-0 snap-center mx-auto", isThisSeatTurn ? "scale-105 z-30 shadow-[0_0_50px_rgba(16,185,129,0.15)] border border-emerald-500/30 bg-white/5" : (!seat.userId && table.status !== "waiting" ? "opacity-0 pointer-events-none scale-95" : "border border-transparent"))}>
                     
                     {/* YOU indicator label for played cards */}


                     {/* If hand exists, render cards and score */}
                     {seat.hand && (
                       <div className={cn("flex flex-col items-center justify-end transition-opacity relative z-20 w-full mb-0 [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.72] [@media(max-height:520px)_and_(orientation:landscape)]:origin-bottom", (table.status === "waiting" && !recentWinAmount && !isResolvingRef.current) && "opacity-20")}>
                          <div className="flex flex-row items-center gap-1.5 z-30 w-full justify-center mb-1.5 sm:mb-2 pointer-events-none relative">
                            <motion.span 
                              key="score"
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: seat.hand.cards.length <= 2 ? ((table.seats.length + 1) + (table.seats.length - 1 - seatIdx)) * 0.15 + 0.2 : 0 }}
                              className="bg-[#1e2129] border border-emerald-500/40 text-emerald-400 font-mono text-sm font-bold px-3 py-0.5 rounded shadow-lg relative inline-flex items-center justify-center">
                              <DelayedScore 
                                score={seat.hand.score} 
                                cardsLength={seat.hand.cards.length} 
                                seatIdx={seatIdx} 
                                totalSeats={table.seats.length} 
                                tableStatus={table.status}
                              />
                            </motion.span>
                            {seat.hand.status !== 'playing' && seat.hand.status !== 'stood' && (
                              <motion.span 
                                initial={{ scale: 0, opacity: 0, x: -10 }}
                                animate={{ scale: 1, opacity: 1, x: 0 }}
                                transition={{ delay: seat.hand.cards.length <= 2 ? ((table.seats.length + 1) + (table.seats.length - 1 - seatIdx)) * 0.15 + 0.4 : 0 }}
                                className={cn(
                                "text-[10px] font-bold uppercase py-1 px-2 rounded-full tracking-wider shadow-lg",
                                ['won', 'blackjack'].includes(seat.hand.status) ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]" : (seat.hand.status === 'push' ? "bg-slate-500 text-white" : "bg-red-500 text-white")
                              )}>
                                {seat.hand.status as string === 'busted_lost' ? 'busted' : seat.hand.status}
                              </motion.span>
                            )}
                          </div>
                          
                          <div className={cn("flex shrink-0 relative items-center justify-center", table.seats.length > 5 ? "pl-[10px] sm:pl-[14px] md:pl-[20px]" : "pl-[14px] sm:pl-[20px] md:pl-[26px]")}>
                            {(seat.hand.status === 'blackjack') && <GoldenWreath delay={seat.hand.cards.length <= 2 ? ((table.seats.length + 1) + (table.seats.length - 1 - seatIdx)) * 0.15 + 0.5 : 0.5} />}
                            <AnimatePresence>
                              {seat.hand.cards.map((c, idx) => {
                                const pan = table.seats.length > 1 ? (seatIdx / (table.seats.length - 1)) * 2 - 1 : 0;
                                return renderCard(c, idx, idx < 2 ? idx * (table.seats.length + 1) + (table.seats.length - 1 - seatIdx) : 0, pan);
                              })}
                            </AnimatePresence>
                          </div>

                          {Boolean((seat.hand.sideBets && (seat.hand.sideBets.pair > 0 || seat.hand.sideBets.twentyOnePlusThree > 0)) || (seat.hand.insuranceBet && seat.hand.insuranceBet > 0)) && (
                            <div className="relative mt-1.5 sm:mt-2 flex gap-1 sm:gap-1.5 z-20 justify-center items-center shrink-0">
                              {seat.hand.sideBets && seat.hand.sideBets.pair > 0 && (
                                <div className={cn("w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] md:w-[42px] md:h-[42px] rounded-full flex flex-col items-center justify-center border text-[7px] sm:text-[9px] font-bold tracking-tighter uppercase transition-all duration-500 relative shrink-0", 
                                    isPairWon === true ? "bg-green-500/90 border-green-300 text-white shadow-[0_0_15px_rgba(34,197,94,0.75)] scale-110" : 
                                    isPairWon === false ? "bg-red-500/30 border-red-500/30 text-white/50" : 
                                    "bg-blue-500/80 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                  )}>
                                  <span>Pair</span>
                                  <span className="font-mono text-[7px] sm:text-[8px] md:text-[9px] leading-none">
                                    {isPairWon === true && (seat.hand.sideBetPairWon || 0) > 0
                                      ? `+$${seat.hand.sideBetPairWon}`
                                      : `$${seat.hand.sideBets.pair}`}
                                  </span>
                                  {isPairWon === true && <div className="absolute -top-1 -right-1 text-[9px] sm:text-[10px]">✅</div>}
                                  {isPairWon === false && <div className="absolute -top-1 -right-1 text-[9px] sm:text-[10px] opacity-50">❌</div>}
                                </div>
                              )}
                              {seat.hand.sideBets && seat.hand.sideBets.twentyOnePlusThree > 0 && (
                                <div className={cn("w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] md:w-[42px] md:h-[42px] rounded-full flex flex-col items-center justify-center border text-[7px] sm:text-[9px] font-bold tracking-tighter uppercase transition-all duration-500 relative shrink-0", 
                                    isPlus3Won === true ? "bg-green-500/90 border-green-300 text-white shadow-[0_0_15px_rgba(34,197,94,0.75)] scale-110" : 
                                    isPlus3Won === false ? "bg-red-500/30 border-red-500/30 text-white/50" : 
                                    "bg-[#ffc53d] border-[#eaaa08] text-black shadow-[0_0_10px_rgba(255,197,61,0.5)]"
                                  )}>
                                  <span>21+3</span>
                                  <span className="font-mono text-[7px] sm:text-[8px] md:text-[9px] leading-none">
                                    {isPlus3Won === true && (seat.hand.sideBetPlus3Won || 0) > 0
                                      ? `+$${seat.hand.sideBetPlus3Won}`
                                      : `$${seat.hand.sideBets.twentyOnePlusThree}`}
                                  </span>
                                  {isPlus3Won === true && <div className="absolute -top-1 -right-1 text-[9px] sm:text-[10px]">✅</div>}
                                  {isPlus3Won === false && <div className="absolute -top-1 -right-1 text-[9px] sm:text-[10px] opacity-50">❌</div>}
                                </div>
                              )}
                              {seat.hand.insuranceBet && seat.hand.insuranceBet > 0 && (
                                <div className={cn("w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] md:w-[42px] md:h-[42px] rounded-full flex flex-col items-center justify-center border text-[6px] sm:text-[8px] font-bold tracking-tighter uppercase transition-all duration-500 relative shrink-0", 
                                    "bg-purple-600/80 border-purple-400 text-white shadow-[0_0_10px_rgba(147,51,234,0.5)]"
                                  )}>
                                  <span>Insure</span>
                                  <span className="font-mono text-[7px] sm:text-[8px] md:text-[10px]">${seat.hand.insuranceBet}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Display Bet & Win/Loss info */}
                      {(seat.userId !== null) && (seat.hand || (table.status === 'waiting' && gameRecords[0]?.tableId === table.id && gameRecords[0].seatResults?.find(sr => sr.seatIndex === seatIdx))) && (
                        <div className="absolute bottom-[46px] sm:bottom-[54px] md:bottom-[60px] [@media(max-height:520px)_and_(orientation:landscape)]:!bottom-[34px] [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.82] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-[100] w-full justify-center">
                          {(()=>{
                            const isWait = table.status === 'waiting';
                            const sr = (isWait && gameRecords[0]?.tableId === table.id) ? gameRecords[0].seatResults?.find(s => s.seatIndex === seatIdx) : null;
                            const betAmount = sr
                              ? ((sr.bet || 0) + (sr.sideBet || 0) + (sr.insuranceBet || 0))
                              : (seat.hand ? (seat.hand.bet + (seat.hand.sideBets?.pair || 0) + (seat.hand.sideBets?.twentyOnePlusThree || 0) + (seat.hand.insuranceBet || 0)) : 0);
                            const winPayout = sr ? (sr.win || 0) : 0;
                            
                            if (!betAmount) return null;

                            return (
                              <>
                                <div className={cn("flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md shadow-xl", 
                                  (sr && (sr.net > 0 || winPayout > 0)) ? "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : (sr && sr.net < 0 ? "border-[#ff6b6b]/40" : "")
                                )}>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[9px] uppercase tracking-wider text-white/50 font-bold leading-none mt-[1px]">BET</span>
                                  </div>
                                  {(()=>{
                                     const useBonus = sr ? gameRecords[0]?.currency === 'Bonus' : (seat.userId ? table.userBalances?.[seat.userId]?.currency === 'Bonus' : false);
                                     if (useBonus) {
                                       return (
                                         <div className="w-[14px] h-[14px] rounded-full bg-gradient-to-b from-[#818cf8] to-[#4338ca] border-[1px] border-[#312e81] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden shrink-0">
                                            <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px]"></div>
                                         </div>
                                       );
                                     }
                                     return (
                                       <div className="w-[14px] h-[14px] rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] relative overflow-hidden shrink-0">
                                          <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                       </div>
                                     );
                                  })()}
                                  <span className="text-[12px] font-mono text-white leading-none mt-0.5">{betAmount % 1 !== 0 ? betAmount.toFixed(2) : betAmount}</span>
                                  {sr && winPayout > 0 && (
                                    <span className="text-[11px] font-mono font-bold text-emerald-400 leading-none mt-0.5 ml-0.5">
                                      +{winPayout % 1 !== 0 ? winPayout.toFixed(2) : winPayout}
                                    </span>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                       </div>
                     )}

                     {/* Seat selection & player profile button */}
                      <TableSeatButton
                        seat={seat}
                        seatIdx={seatIdx}
                        totalSeats={table.seats.length}
                        currentUser={currentUser}
                        isSelected={isSelected}
                        dealCountdown={dealCountdown}
                        actionCountdown={isThisSeatTurn && seatDealRevealed ? actionCountdown : null}
                        shakeSeats={shakeSeats}
                        onClick={() => toggleSeatSelection(seatIdx)}
                      />
                   </div>
                 );
               })}
             </div>
             {/* Left/Right seat scroll indicators (mobile only where seats overflow horizontally) */}
             <div className="md:hidden absolute left-1.5 right-1.5 sm:left-3 sm:right-3 bottom-[84px] sm:bottom-[94px] [@media(max-height:520px)_and_(orientation:landscape)]:!bottom-[42px] [@media(max-height:520px)_and_(orientation:landscape)]:scale-75 flex justify-between pointer-events-none z-30">
                <button
                  type="button"
                  onClick={() => scrollSeats('left')}
                  className="pointer-events-auto flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a180f]/90 hover:bg-[#122e1d] active:scale-95 border-2 border-[#d4af37]/80 text-[#ffd86b] shadow-[0_4px_16px_rgba(0,0,0,0.85)] backdrop-blur-md transition-all cursor-pointer group"
                  title="Scroll Seats Left"
                >
                  <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 group-hover:-translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollSeats('right')}
                  className="pointer-events-auto flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0a180f]/90 hover:bg-[#122e1d] active:scale-95 border-2 border-[#d4af37]/80 text-[#ffd86b] shadow-[0_4px_16px_rgba(0,0,0,0.85)] backdrop-blur-md transition-all cursor-pointer group"
                  title="Scroll Seats Right"
                >
                  <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-0.5 transition-transform" />
                </button>
             </div>
           </div>
       </div>

                {/* Bottom Control Overlay (HUD) */}
         {table.status === 'waiting' && !showRules && !showHistory && !isCommentsOpen && !confirmAction && !isSidebarOpen && !isTablePlayersOpen && !isStatsOpen && table.seats.some(s => s.userId === currentUser.id || s.userId === null) && (
            <DealControlHUD 
              table={table}
              mySeats={mySeats}
              betAmountStr={betAmountStr}
              onBetChange={handleBetChange}
              onBetBlur={handleBetBlur}
              onMinus={handleMinus}
              onPlus={handlePlus}
              sideBetsEnabled={sideBetsEnabled}
              pairBetStr={pairBetStr}
              onPairChange={handlePairChange}
              onPairBlur={handlePairBlur}
              onPairMinus={handlePairMinus}
              onPairPlus={handlePairPlus}
              plus3BetStr={plus3BetStr}
              onPlus3Change={handlePlus3Change}
              onPlus3Blur={handlePlus3Blur}
              onPlus3Minus={handlePlus3Minus}
              onPlus3Plus={handlePlus3Plus}
              onDeal={handleStartGame}
              dealCountdown={dealCountdown}
              isTournament={false}
              onSideBetsToggle={() => setSideBetsEnabled(!sideBetsEnabled)}
              autoDeal={autoDeal}
              onAutoDealToggle={() => setAutoDeal(!autoDeal)}
              className="absolute bottom-2 [@media(max-height:740px)]:bottom-1.5 [@media(max-height:520px)_and_(orientation:landscape)]:!bottom-0.5 [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.78] [@media(max-height:520px)_and_(orientation:landscape)]:origin-bottom w-full flex flex-col items-center z-[80] px-4 pointer-events-none"
            />
         )}

         {table.status === 'playing' && isMyTurn && isActiveTurnDealRevealed && !isSidebarOpen && !isTablePlayersOpen && !isStatsOpen && (
           <div className="absolute bottom-2 [@media(max-height:740px)]:bottom-1.5 [@media(max-height:520px)_and_(orientation:landscape)]:!bottom-0.5 [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.78] [@media(max-height:520px)_and_(orientation:landscape)]:origin-bottom w-full flex flex-col items-center z-[80] px-4 pointer-events-none">
             <ActiveTurnHUD 
               tableId={table.id}
               activeSeatIndex={activeSeatIndex}
               canBuyInsurance={canBuyInsurance}
               canSplit={canSplit}
               canDouble={canDouble}
             />
           </div>
         )}

         {/* Bottom-Right Payout Rate / Rules Trigger */}
         <button
           type="button"
           onClick={() => setShowRules(true)}
           title="View Payout Rate & Table Rules"
           className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-4 z-[85] pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/55 hover:bg-black/80 border border-[#ffc53d]/35 hover:border-[#ffc53d] text-[#ffc53d] hover:text-white text-[10px] sm:text-[11px] font-bold tracking-wider uppercase backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition-all cursor-pointer"
         >
           <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">RTP {calculateBaseRTP(table.settings.winningRule)}</span>
         </button>
       </div>

    </div>
  );
}

