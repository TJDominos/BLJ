import React, { useState, useEffect } from 'react';
import { useGameStore, PlayingCard as PlayingCardType } from '@/store/gameStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Coins, Crown, Loader2, LogOut, Volume2, Bell, Heart, RefreshCw, Minus, Plus, ArrowDown, Menu, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sounds';
import { RulesModal } from './RulesModal';
import { PlayingCard } from '@/components/blackjack/PlayingCardUI';
import { DelayedScore } from '@/components/blackjack/DelayedScore';
import { DealerArea } from '@/components/blackjack/DealerAreaUI';
import { GoldCoinTray } from '@/components/blackjack/GoldCoinTray';
import { GoldenWreath } from '@/components/blackjack/GoldenWreath';
import { HeaderUI } from '@/components/blackjack/HeaderUI';
import { LiveTablesSidebar } from '@/components/blackjack/LiveTablesSidebar';
import { CommentsWidget } from '@/components/blackjack/CommentsWidget';

// Further down, replace the dealer area:

import { calculateBaseRTP } from '@/backend/gameRules';

export function RegularTableView({ onNavigate, onToggleSidebar }: { onNavigate: (view: 'lobby' | 'create' | 'table' | 'host_table' | 'manage_tables') => boolean | void, onToggleSidebar?: () => void }) {
  const { tables, activeTableId, currentUser, leaveTable, joinTable, placeBet, startGame, hit, stand, doubleDown, split, buyInsurance, gameRecords, unlockTableBalance } = useGameStore();

  const userHostedTables = Object.values(tables).filter(t => t.houseId === currentUser?.id);
  const hasHostedTables = userHostedTables.length > 0;

  const [betAmountStr, setBetAmountStr] = useState<string>('0');
  const [sideBetsEnabled, setSideBetsEnabled] = useState(false);
  const [pairBetStr, setPairBetStr] = useState('10');
  const [plus3BetStr, setPlus3BetStr] = useState('10');
  const [showHistory, setShowHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [shakeSeats, setShakeSeats] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [showDiscardStats, setShowDiscardStats] = useState(false);
  const [showFloatingComments, setShowFloatingComments] = useState(true);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  const table = tables[activeTableId || ''];
  const mySeats = React.useMemo(() => table?.seats.map((s, i) => s.userId === currentUser?.id ? i : -1).filter(i => i >= 0) || [], [table?.seats?.map(s => s.userId)?.join(), currentUser?.id]);

  const [confirmAction, setConfirmAction] = useState<{message: string, onConfirm: () => void, confirmText?: string, cancelText?: string, onCancel?: () => void, title?: string} | null>(null);
  const [actionCountdown, setActionCountdown] = useState<number | null>(null);
  const [dealCountdown, setDealCountdown] = useState<number | null>(null);
  const [recentWinAmount, setRecentWinAmount] = useState<{ amount: number, won: boolean, seats?: number[] } | null>(null);
  const previousDeckLength = React.useRef(table?.deck?.length || 0);
  const previousStatus = React.useRef(table?.status);
  const seatsContainerRef = React.useRef<HTMLDivElement>(null);
  const isResolvingRef = React.useRef(false);

  if (table?.status === 'playing') {
    isResolvingRef.current = false;
  }
  if (table && previousStatus.current === 'playing' && table.status === 'waiting' && recentWinAmount === null) {
     isResolvingRef.current = true;
  } else if (recentWinAmount !== null) {
     isResolvingRef.current = false;
  }

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
      if (myNotReady.length > 0) {
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
    if (table && previousStatus.current === 'playing' && table.status === 'waiting') {
       // Find the most recent record
       const lastRecord = gameRecords[0];
       if (lastRecord && lastRecord.tableId === table.id) {
           // net win is amount won > bet ? true : false
           const totalBet = lastRecord.seatResults?.reduce((sum, sr) => sum + sr.bet, 0) || 0;
           const winningSeats: number[] = [];
           table.seats.forEach((s, idx) => {
               const res = lastRecord.seatResults?.find(sr => sr.seatIndex === idx);
               const isHandWin = s.hand && (s.hand.status === 'won' || s.hand.status === 'blackjack');
               if (isHandWin || (res && res.net > 0)) {
                 winningSeats.push(idx);
               }
           });
           const won = winningSeats.length > 0;
           setRecentWinAmount({ amount: lastRecord.amountWon || 0, won, seats: winningSeats });
           setTimeout(() => {
              setRecentWinAmount(null);
           }, table.seats.length * 150 + 5000); // Wait for cards to deal and extra time for viewing

           if (won) {
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
  }, [table?.status, table?.id, JSON.stringify(table?.seats), gameRecords]);

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

  useEffect(() => {
    if (table?.status === 'playing' && table.currentTurnIndex >= 0) {
      const activeSeat = table.currentTurnIndex;
      const seat = table.seats[activeSeat];
      if (seat?.userId?.startsWith('bot_') && seat.hand?.status === 'playing') {
        const isInitialDeal = seat.hand?.cards?.length === 2;
        const delayMs = isInitialDeal ? Math.max(1500, table.seats.length * 300 + 1000) : 1500;
        
        const timer = setTimeout(() => {
          if (seat.hand!.score < 17) {
            hit(table.id, activeSeat);
          } else {
            stand(table.id, activeSeat);
          }
        }, delayMs);
        return () => clearTimeout(timer);
      }
    }
  }, [table?.status, table?.currentTurnIndex, JSON.stringify(table?.seats), table?.id, hit, stand]);

  useEffect(() => {
    if (actionCountdown !== null && actionCountdown > 0) {
      const timer = setTimeout(() => setActionCountdown(actionCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (actionCountdown === 0 && table?.status === 'playing') {
      setActionCountdown(-1); // Prevent zero value from spilling over to the next turn's render phase
      const activeSeat = table.currentTurnIndex;
      if (activeSeat >= 0 && table.seats[activeSeat] && table.seats[activeSeat].hand?.status === 'playing') {
        stand(table.id, activeSeat);
      }
    }
  }, [actionCountdown, table?.status, table?.id, table?.currentTurnIndex, stand, hit]);

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
  const canSplit = canDouble && activeHand?.cards[0].value === activeHand?.cards[1].value && myUserBal >= (activeHand?.bet || 0);
  const canBuyInsurance = canDouble && table.dealerHand?.cards[0].value === 'A' && !activeHand?.insuranceBet;

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
       const userBal = table.userBalances?.[currentUser.id]?.balance || 0;
       const mySeatsCount = mySeats.length;
       if (table.settings.mode === 'tournament') {
           if (userBal > 0) { // they already have tournament chips
               joinTable(table.id, seatIndex);
           } else {
               setConfirmAction({
                 message: `Do you want to pay ${table.settings.tournament?.ticketPrice} Gcoin ticket to enter this tournament and get ${table.settings.tournament?.startingChips} starting chips?`,
                 onConfirm: () => joinTable(table.id, seatIndex)
               });
           }
       } else {
           const requiredMinBal = table.settings.minBet * (mySeatsCount + 1);
           if (userBal >= requiredMinBal) {
             joinTable(table.id, seatIndex);
           } else {
             setConfirmAction({
               message: `Do you want to lock ${table.settings.minBuyIn} Gcoin to sit at this seat?`,
               onConfirm: () => joinTable(table.id, seatIndex)
             });
           }
       }
    } else if (seat.userId === currentUser.id) {
       await leaveTable(table.id, seatIndex);
    }
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
      try {
        await Promise.all(
          mySeats.map(seatIndex => 
            placeBet(table.id, seatIndex, amount, { pair: pairAmt, twentyOnePlusThree: plus3Amt })
          )
        );
      } catch (err: any) {
        // If placeBet fails (e.g., game already started), ignore silently or alert
        console.warn("Could not place bet:", err);
      }
    } else {
      alert(`Invalid bet or insufficient locked balance (Min: ${table.settings.minBet}, Max: ${table.settings.maxBet}, Total Cost: ${totalBet}, Locked: ${myUserBal})`);
    }
  };

  const getEffectiveSteps = () => {
    const maxVal = Math.floor(Math.min(table.settings.maxBet, table.userBalances?.[currentUser.id]?.balance || currentUser.balance));
    let baseSteps = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
    
    let steps = baseSteps.filter(v => v < maxVal);
    if (!steps.includes(maxVal)) steps.push(maxVal);
    return { steps, maxVal, minVal: 1 };
  };

  const handleMinus = () => {
    soundManager.playClick();
    const { steps } = getEffectiveSteps();
    const current = parseFloat(betAmountStr.replace(/,/g, '')) || 0;
    
    let nextVal = [...steps].reverse().find(v => v < current);
    if (nextVal === undefined) nextVal = steps[0];
    setBetAmountStr(nextVal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
  };

  const handlePlus = () => {
    soundManager.playClick();
    const { steps, maxVal } = getEffectiveSteps();
    const current = parseFloat(betAmountStr.replace(/,/g, '')) || 0;
    
    let nextVal = steps.find(v => v > current);
    if (nextVal === undefined) nextVal = maxVal;
    
    setBetAmountStr(nextVal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
  };

  const handleBetBlur = () => {
    if (betAmountStr === '') {
      setBetAmountStr('1');
      return;
    }
    let current = parseFloat(betAmountStr.replace(/,/g, '')) || 0;
    const { maxVal } = getEffectiveSteps();
    const min = 1;
    if (current < min) current = min;
    if (current > maxVal) current = maxVal;
    setBetAmountStr(current.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
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
    let val = e.target.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (val.startsWith('0') && val.length > 1 && !val.startsWith('0.')) {
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
    <div className="w-full h-full flex flex-col items-center relative overflow-hidden bg-transparent font-sans">
      {showRules && <RulesModal onClose={() => setShowRules(false)} winningRule={table.settings.winningRule} />}
      
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-[#1a120b] border border-[#3a2510] rounded-xl p-6 flex flex-col items-center shadow-[0_10px_40px_rgba(0,0,0,0.8)] max-w-xs w-full">
            <h3 className="text-[#eac574] text-lg font-bold mb-4 text-center">{confirmAction.title || 'Confirm Action'}</h3>
            <p className="text-white/80 text-sm mb-6 text-center">{confirmAction.message}</p>
            <div className="flex w-full gap-4">
              <button 
                onClick={() => {
                  if (confirmAction.onCancel) confirmAction.onCancel();
                  setConfirmAction(null);
                }}
                className="flex-1 py-3 px-2 rounded-lg bg-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/20 transition-colors"
              >
                {confirmAction.cancelText || 'Cancel'}
              </button>
              <button 
                onClick={() => {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }}
                className="flex-1 py-3 px-2 rounded-lg bg-gradient-to-b from-[#28a19b] to-[#126b6f] text-white text-xs font-bold uppercase tracking-wider hover:from-[#2ebaba] hover:to-[#178287] transition-colors"
              >
                {confirmAction.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invisible global header placeholder or minimal top nav if needed */}
      <HeaderUI 
        onLeave={() => {
          const userBal = table.userBalances?.[currentUser!.id];
          if (userBal) {
            setConfirmAction({
              title: "Leave Table",
              message: "You have locked chips on this table. Do you want to unlock your funds?",
              confirmText: "Unlock & Leave",
              cancelText: "Just Leave",
              onConfirm: async () => {
                await unlockTableBalance(table.id);
                setConfirmAction(null);
                const success = onNavigate('lobby'); 
                if (success !== false) {
                   leaveTable(table.id); 
                }
              },
              onCancel: () => {
                const success = onNavigate('lobby'); 
                if (success !== false) {
                   leaveTable(table.id); 
                }
              }
            });
          } else {
             const success = onNavigate('lobby'); 
             if (success !== false) {
                leaveTable(table.id); 
             }
          }
        }}
        isMuted={isMuted}
        setIsMuted={setIsMuted}
        onToggleSidebar={() => onToggleSidebar && onToggleSidebar()}
      />

      <CommentsWidget 
        unreadCount={15} 
        showFloatingComments={showFloatingComments}
        setShowFloatingComments={setShowFloatingComments}
        isOpen={isCommentsOpen}
        setIsOpen={setIsCommentsOpen}
      />

      <div className="w-full max-w-[1024px] flex flex-col items-center gap-1 z-40 px-2 sm:px-4 pt-1 sm:pt-2 pb-1 relative pointer-events-none shrink-0">
        <div className="flex flex-row items-center justify-center gap-2 sm:gap-4 pointer-events-auto w-full max-w-[420px] mx-auto mt-[-2px]">
          <div className="relative flex flex-row items-center border-[2px] border-[#6b4c2a] rounded-full bg-gradient-to-b from-[#eac574] via-[#d0a758] to-[#997027] p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(0,0,0,0.4),0_4px_10px_rgba(0,0,0,0.5)] justify-between flex-1 h-[40px] sm:h-[44px] min-w-[240px]">
            <div className="absolute left-1 right-1 inset-y-1 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-20 pointer-events-none rounded-full z-0"></div>

              <div id="balance-container" className="flex-1 flex flex-row items-center justify-between h-full w-full relative z-10 bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full px-3 sm:px-4 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6),0_1px_1px_rgba(255,255,255,0.4)] border border-[#3a2510]">
               <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold tracking-wider">
                 <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-b from-[#ffeed2] to-[#ffc53d] border-[1px] border-[#8e6022] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px]"></div>
                 </div>
                  {(() => {
                    const userBal = table.userBalances?.[currentUser.id];
                    const displayBalance = userBal ? userBal.balance : currentUser.balance;
                    return (
                      <div className="flex items-center">
                        <span className="text-[#32d5a4] text-[14px] sm:text-[16px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] font-mono">
                          {displayBalance.toLocaleString('en-US', {minimumFractionDigits: displayBalance % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})}
                        </span>
                        {userBal && (
                          <button 
                            onClick={async () => {
                              const notReady = mySeats.some(sIdx => table.seats[sIdx].isReady === false && table.seats[sIdx].hand);
                              if (notReady || table.status === 'playing') {
                                setConfirmAction({
                                  message: "Cannot unlock while playing or with active bets.",
                                  onConfirm: () => {}
                                });
                                return;
                              }
                              setConfirmAction({
                                message: userBal.balance === 0 ? "Leave your seat to add more funds from your wallet?" : "Unlock table balance? (1% fee on net winnings)",
                                onConfirm: async () => {
                                  await unlockTableBalance(table.id);
                                }
                              });
                            }}
                            className={cn(
                              "ml-2 text-white/90 text-[10px] px-2 py-0.5 rounded border border-white/20 transition-colors pointer-events-auto shadow-[0_2px_4px_rgba(0,0,0,0.4)] hover:opacity-80",
                              userBal.balance === 0 ? "bg-[#eaaa08]/90 font-bold text-black" : "bg-red-900/60"
                            )}
                          >
                            {userBal.balance === 0 ? "ADD FUND" : "UNLOCK"}
                          </button>
                        )}
                      </div>
                    )
                 })()}
               </div>
  
               <div className="w-px h-4 bg-white/10 mx-2 shadow-[1px_0_0_rgba(0,0,0,0.3)]" />
  
               <div 
                 className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold tracking-wider cursor-pointer hover:opacity-80 transition-opacity"
                 onClick={() => setShowHistory(!showHistory)}
               >
                 {recentWinAmount ? (
                   <motion.div 
                     key="win"
                     initial={{ y: -10, opacity: 0 }}
                     animate={{ y: 0, opacity: 1 }}
                     className={cn(
                       "flex items-center gap-2 text-[13px] sm:text-[14px]",
                       recentWinAmount.won ? "text-emerald-400" : (recentWinAmount.amount > 0 ? "text-yellow-400" : "text-white/60")
                     )}
                   >
                     <span className="uppercase font-bold tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                        {recentWinAmount.won ? "WIN" : (recentWinAmount.amount > 0 ? "RETURN" : "")}
                     </span>
                     {recentWinAmount.amount > 0 && (
                       <>
                         <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-b from-[#ffeed2] to-[#ffc53d] border-[1px] border-[#8e6022] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px]"></div>
                         </div>
                         <span className="font-mono text-[14px] sm:text-[16px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{recentWinAmount.amount % 1 !== 0 ? recentWinAmount.amount.toFixed(2) : recentWinAmount.amount}</span>
                       </>
                     )}
                   </motion.div>
                 ) : (
                   <div className="flex items-center gap-1.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                     <div className="flex items-center gap-1 text-white/60 uppercase">
                       <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                       <span>Bet</span>
                     </div>
                     <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-b from-[#ffeed2] to-[#ffc53d] border-[1px] border-[#8e6022] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px]"></div>
                     </div>
                     <span className="text-white font-mono text-[14px] sm:text-[16px]">{myTotalBet % 1 !== 0 ? myTotalBet.toFixed(2) : myTotalBet}</span>
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
                        message: "You have locked chips on this table. Do you want to unlock your funds?",
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
            className={cn("flex text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-white px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-[12px] sm:rounded-[14px] items-center gap-1 shadow-[inset_0_2px_2px_rgba(255,255,255,0.3),inset_0_-2px_4px_rgba(0,0,0,0.4),0_4px_8px_rgba(0,0,0,0.5)] border transition-transform whitespace-nowrap shrink-0 group", isPlayerDealt ? "bg-black/50 border-white/10 opacity-50 cursor-not-allowed" : "bg-gradient-to-b from-[#28a19b] to-[#126b6f] hover:from-[#2ebaba] hover:to-[#178287] border-[#0d4f52] hover:scale-105 active:scale-95")}
          >
            <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{hasHostedTables ? "Manage Tables" : "Host Tables"}</span>
          </button>
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
                     {gameRecords.map(record => {
                        const totalBet = record.seatResults?.reduce((sum, sr) => sum + sr.bet, 0) || 0;
                        const totalNet = record.seatResults?.reduce((sum, sr) => sum + sr.net, 0) || (record.amountWon - totalBet);

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
                              <span className="text-white/60 text-xs font-mono">{dateStr}</span>
                              <div className="flex items-center gap-6">
                                <div className="flex flex-col items-end">
                                  <span className="text-white/40 text-[10px] font-bold tracking-wider mb-1">BET</span>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                    </div>
                                    <span className="text-white text-sm font-mono">{totalBet}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-white/40 text-[10px] font-bold tracking-wider mb-1">NET</span>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                    </div>
                                    <span className={cn("text-sm font-mono font-bold", totalNet >= 0 ? "text-emerald-400" : "text-[#ff6b6b]")}>
                                      {totalNet > 0 ? "+" : ""}{totalNet % 1 !== 0 ? totalNet.toFixed(2) : totalNet}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {record.seatResults && record.seatResults.length > 0 && (
                               <div className="w-full mt-3 pt-3 border-t border-white/5 flex flex-col gap-2">
                                 {record.seatResults.map((sr, idx) => (
                                    <div key={idx} className="flex justify-between items-center">
                                      <span className="text-white/40 text-[11px] uppercase">Seat {sr.seatIndex + 1}</span>
                                      <span className={cn("text-[10px] uppercase font-bold py-0.5 px-2 rounded-full",
                                          sr.action === 'won' ? "bg-emerald-500/20 text-emerald-400" : 
                                          sr.action === 'lost' ? "bg-red-500/20 text-red-400" : 
                                          sr.action === 'blackjack' ? "bg-yellow-500/20 text-yellow-400" :
                                          "bg-slate-500/20 text-slate-400"
                                      )}>{sr.action}</span>
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-[#ffc53d] border border-[#eaaa08] relative overflow-hidden opacity-80">
                                           <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                        </div>
                                        <span className={cn("text-[12px] font-mono", sr.net >= 0 ? "text-emerald-400" : "text-[#ff6b6b]")}>{sr.net > 0 ? '+' : ''}{sr.net % 1 !== 0 ? sr.net.toFixed(2) : sr.net}</span>
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

        </div>

      <div className="flex-1 w-full max-w-[1024px] flex flex-col items-center justify-between pb-0 pt-0 mt-0 ml-0 relative bg-gradient-to-b from-[#134226] via-[#1a5b33] to-[#0f341d] flex-1 min-h-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] overflow-hidden z-10 md:border-t lg:border-x border-white/5">
        <div className="absolute inset-0 pointer-events-none opacity-40 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-overlay z-0"></div>

        {/* Target anchor for floating comments, positioned relative to the overall game board wrapper */}
        <div id="floating-comments-root" className="absolute top-[50px] md:top-[65px] left-0 right-0 pointer-events-none z-40 flex flex-col gap-1.5 justify-start items-start overflow-visible" />

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


       {/* Dealer Area */}
           <DealerArea 
             houseId={table.houseId}
             name={table.name}
             dealerHand={table.status === 'playing' || recentWinAmount !== null || isResolvingRef.current ? table.dealerHand : null}
             totalSeats={table.seats.length}
             recentWinAmount={recentWinAmount}
             mode={table.settings.mode}
           />

           {/* Base curved lines decoration */}
           <div className="absolute top-[35%] sm:top-[40%] left-0 right-0 bottom-0 w-full overflow-hidden pointer-events-none flex justify-center items-start z-0 mt-[30px] sm:mt-[40px] md:mt-[50px]">
             {/* Outer golden line */}
             <div className="w-[240%] sm:w-[140%] md:w-[110%] aspect-[2/1] border-t-[8px] sm:border-t-[10px] border-[#c6a364] opacity-70 rounded-[100%] absolute top-0 shadow-[0_-2px_4px_rgba(0,0,0,0.8),inset_0_2px_2px_rgba(255,255,255,0.3)]"></div>
             {/* Inner thin golden line */}
             <div className="w-[230%] sm:w-[130%] md:w-[105%] aspect-[2/1] border-t-[2px] border-[#eac574] opacity-50 rounded-[100%] absolute top-[12px] sm:top-[16px] shadow-[0_-1px_2px_rgba(0,0,0,0.8)]"></div>
             {/* Faint inset betting area base line */}
             <div className="w-[220%] sm:w-[120%] md:w-[100%] aspect-[2/1] border-t-[1px] border-[#ffc53d] opacity-20 rounded-[100%] absolute top-[30px] sm:top-[40px]"></div>
           </div>

           {/* Game Rules Center Area */}
           <div className="absolute top-[35%] sm:top-[40%] left-1/2 -translate-x-1/2 -translate-y-[90%] sm:-translate-y-[100%] md:-translate-y-[105%] mt-[30px] md:mt-[35px] z-10 px-2 sm:px-4 whitespace-nowrap scale-[0.6] sm:scale-[0.8] md:scale-100 flex flex-col items-center gap-1.5 sm:gap-2 pointer-events-none">
              <span className="text-[#c6a364] text-[11px] md:text-[16px] font-black tracking-[0.3em] uppercase opacity-90" style={{ textShadow: '0px 1px 1px rgba(0,0,0,1), 0px -1px 1px rgba(0,0,0,0.8), 0px 0px 3px rgba(176,142,85,0.4)' }}>
                Blackjack Pays 3 to 2
              </span>
              <span className="text-[#c6a364] text-[8px] md:text-[10px] font-bold tracking-[0.2em] uppercase opacity-70" style={{ textShadow: '0px 1px 1px rgba(0,0,0,1)' }}>
                Dealer must draw to 16 and stand on all 17s
              </span>
              <span className="text-[#c6a364] text-[8px] md:text-[10px] font-bold tracking-[0.2em] uppercase opacity-70 flex items-center gap-2 sm:gap-3 mt-1 sm:mt-2" style={{ textShadow: '0px 1px 1px rgba(0,0,0,1)' }}>
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
                    className="absolute top-[100%] mt-3 sm:mt-5 z-50 flex items-center justify-center pointer-events-none"
                  >
                    <div className="p-[2px] rounded-[10px] bg-gradient-to-br from-[#f8fafc] via-[#cbd5e1] to-[#64748b] shadow-[0_8px_16px_rgba(0,0,0,0.8)] overflow-hidden">
                      <div className="px-6 py-2 rounded-[8px] flex items-center justify-center border border-[#f8fafc]/30 relative shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] bg-[#1a1c20]" style={{
                        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg id='hexagons' fill='%23cbd5e1' fill-opacity='0.15' fill-rule='nonzero'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"
                      }}>
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 rounded-[8px]"></div>
                        <span className="text-[#f8fafc] text-2xl font-mono font-black tracking-[0.2em] drop-shadow-[0_2px_2px_rgba(0,0,0,1)] z-10" style={{ textShadow: "0 2px 4px #000, 0 0 10px rgba(248,250,252,0.4)" }}>
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

           <button
             onClick={() => onToggleSidebar && onToggleSidebar()}
             className="absolute right-0 top-[35%] sm:top-[40%] -translate-y-1/2 z-40 bg-[#1e2025]/80 backdrop-blur-sm border border-r-0 border-[#ffc53d]/30 p-2 sm:p-3 rounded-l-xl shadow-[0_0_15px_rgba(255,197,61,0.15)] hover:bg-[#ffc53d]/10 hover:border-[#ffc53d]/50 hover:shadow-[0_0_20px_rgba(255,197,61,0.25)] transition-all group pointer-events-auto"
             title="Live Tables"
           >
             <Menu className="w-5 h-5 text-[#ffc53d] group-hover:scale-110 transition-transform" />
           </button>

           {/* Discard Pile (Left Top) */}
           <div className="absolute top-[72px] left-2 sm:top-[90px] sm:left-8 lg:top-16 lg:left-16 z-30 flex flex-col items-center pointer-events-auto cursor-pointer group" onClick={() => setShowDiscardStats(!showDiscardStats)}>
             <div className="relative w-[40px] h-[60px] sm:w-[56px] sm:h-[80px] md:w-[72px] md:h-[104px] lg:w-[92px] lg:h-[130px] group-hover:scale-105 transition-transform duration-200">
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
                     className="absolute top-full mt-2 left-0 bg-[#1e2025]/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl z-40 w-[240px] flex flex-col gap-2 origin-top-left"
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
           <div className="absolute top-[72px] right-2 sm:top-[90px] sm:right-8 lg:top-16 lg:right-16 z-10 flex flex-col items-center gap-2 pointer-events-none">
             <div className="relative w-[40px] h-[60px] sm:w-[56px] sm:h-[80px] md:w-[72px] md:h-[104px] lg:w-[92px] lg:h-[130px]">
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
             <span className="bg-black/40 text-[#ffc53d] text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded shadow-sm border border-[#ffc53d]/20 mt-2">6 Decks</span>
           </div>

           {/* Player Area */}
           <div className="w-full flex-[6] flex flex-col items-center justify-center relative z-20 mt-2 sm:mt-4 md:mt-0 lg:mb-4">
             
             <div className="relative w-full z-10 flex items-center justify-center group/seats h-full max-h-full">
               <div ref={seatsContainerRef} className={cn("flex w-full md:w-auto h-full pt-12 mt-auto pb-[130px] sm:pb-[120px] lg:pb-[110px] justify-start gap-[4px] sm:gap-2 md:gap-4 lg:gap-8 items-end px-4 md:px-8 z-10 transition-transform duration-300 overflow-x-auto snap-x snap-mandatory md:snap-none hide-scrollbar-custom")}>
                 <style>{`.hide-scrollbar-custom::-webkit-scrollbar { display: none; }`}</style>
                 {table.seats.map((seat, seatIdx) => {
                     const isThisSeatTurn = table.status === 'playing' && table.currentTurnIndex === seatIdx;
                   const isSelected = mySeats.includes(seatIdx);
                   let isPairWon: boolean | null = null;
                   let isPlus3Won: boolean | null = null;
                   
                   if (seat.hand && seat.hand.cards && seat.hand.cards.length >= 2) {
                     isPairWon = seat.hand.cards[0].value === seat.hand.cards[1].value;
                     if (table.dealerHand && table.dealerHand.cards && table.dealerHand.cards.length >= 1) {
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
                     <div key={seatIdx} id={`seat-${seatIdx}`} className={cn("relative flex flex-col items-center pt-0 pb-[100px] sm:pb-[100px] md:pb-[110px] px-0 justify-end sm:px-2 md:px-[6px] transition-all h-[180px] sm:h-[220px] md:h-[260px]  rounded-[16px] sm:rounded-[24px] flex-1 min-w-[95px] max-w-[170px] shrink snap-center", isThisSeatTurn ? "scale-110 z-30 shadow-[0_0_50px_rgba(16,185,129,0.15)] border border-emerald-500/30 bg-white/5" : (!seat.userId && table.status !== "waiting" ? "opacity-0 pointer-events-none scale-95" : "border border-transparent"))}>
                     
                     {/* YOU indicator label for played cards */}


                     {/* If hand exists, render cards and score */}
                     {seat.hand && (
                       <div className={cn("flex flex-col items-center justify-end transition-opacity relative z-20 w-full mb-0", (table.status === "waiting" && !recentWinAmount && !isResolvingRef.current) && "opacity-20")}>
                          <div className="flex flex-row items-center gap-2 z-30 w-full justify-center mb-1 sm:mb-2 pointer-events-none relative">
                            <motion.span 
                              key="score"
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: seat.hand.cards.length <= 2 ? ((table.seats.length + 1) + (table.seats.length - 1 - seatIdx)) * 0.15 + 0.2 : 0 }}
                              className="bg-[#1e2129] border border-emerald-500/30 text-emerald-400 font-mono text-sm px-3 py-1 rounded shadow-lg relative">
                              {table.status === 'playing' && table.currentTurnIndex === seatIdx && actionCountdown !== null && (
                                <div className={cn(
                                  "absolute -top-5 -right-5 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm font-mono tracking-tighter z-50 shadow-[0_0_15px_rgba(0,0,0,0.8)] border-[1.5px]",
                                  actionCountdown <= 5 ? "bg-yellow-500 text-black border-yellow-300 animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.8)]" : "bg-yellow-400 text-black border-yellow-600 shadow-[0_0_10px_rgba(250,204,21,0.6)]"
                                )}>
                                  {actionCountdown}
                                </div>
                              )}
                              <DelayedScore 
                                score={seat.hand.score} 
                                cardsLength={seat.hand.cards.length} 
                                seatIdx={seatIdx} 
                                totalSeats={table.seats.length} 
                                tableStatus={table.status}
                              />
                            </motion.span>
                            {seat.hand.status !== 'playing' && (
                              <motion.span 
                                initial={{ scale: 0, opacity: 0, x: -10 }}
                                animate={{ scale: 1, opacity: 1, x: 0 }}
                                transition={{ delay: seat.hand.cards.length <= 2 ? ((table.seats.length + 1) + (table.seats.length - 1 - seatIdx)) * 0.15 + 0.4 : 0 }}
                                className={cn(
                                "text-[10px] font-bold uppercase py-1 px-2 rounded-full tracking-wider shadow-lg",
                                ['won', 'blackjack'].includes(seat.hand.status) ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]" : (seat.hand.status === 'push' ? "bg-slate-500 text-white" : "bg-red-500 text-white")
                              )}>
                                {seat.hand.status}
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

                          {((seat.hand.sideBets && (seat.hand.sideBets.pair > 0 || seat.hand.sideBets.twentyOnePlusThree > 0)) || seat.hand.insuranceBet) && (
                            <div className="absolute top-[85%] left-1/2 -translate-x-1/2 flex gap-1 sm:gap-2 z-20 justify-center items-center scale-[0.85] origin-top sm:origin-center sm:scale-100 pb-2">
                              {seat.hand.sideBets && seat.hand.sideBets.pair > 0 && (
                                <div className={cn("w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex flex-col items-center justify-center border text-[8px] sm:text-[10px] font-bold tracking-tighter uppercase transition-all duration-500 relative shrink-0", 
                                    isPairWon === true ? "bg-green-500/80 border-green-400 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-110" : 
                                    isPairWon === false ? "bg-red-500/30 border-red-500/30 text-white/50" : 
                                    "bg-blue-500/80 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                  )}>
                                  <span>Pair</span>
                                  <span className="font-mono text-[8px] sm:text-[9px] md:text-[11px]">${seat.hand.sideBets.pair}</span>
                                  {isPairWon === true && <div className="absolute -top-1 -right-1 text-[10px] sm:text-xs">✅</div>}
                                  {isPairWon === false && <div className="absolute -top-1 -right-1 text-[10px] sm:text-xs opacity-50">❌</div>}
                                </div>
                              )}
                              {seat.hand.sideBets && seat.hand.sideBets.twentyOnePlusThree > 0 && (
                                <div className={cn("w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex flex-col items-center justify-center border text-[8px] sm:text-[10px] font-bold tracking-tighter uppercase transition-all duration-500 relative shrink-0", 
                                    isPlus3Won === true ? "bg-green-500/80 border-green-400 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-110" : 
                                    isPlus3Won === false ? "bg-red-500/30 border-red-500/30 text-white/50" : 
                                    "bg-[#ffc53d] border-[#eaaa08] text-black shadow-[0_0_10px_rgba(255,197,61,0.5)]"
                                  )}>
                                  <span>21+3</span>
                                  <span className="font-mono text-[8px] sm:text-[9px] md:text-[11px]">${seat.hand.sideBets.twentyOnePlusThree}</span>
                                  {isPlus3Won === true && <div className="absolute -top-1 -right-1 text-[10px] sm:text-xs">✅</div>}
                                  {isPlus3Won === false && <div className="absolute -top-1 -right-1 text-[10px] sm:text-xs opacity-50">❌</div>}
                                </div>
                              )}
                              {seat.hand.insuranceBet && seat.hand.insuranceBet > 0 && (
                                <div className={cn("w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex flex-col items-center justify-center border text-[7px] sm:text-[9px] font-bold tracking-tighter uppercase transition-all duration-500 relative shrink-0", 
                                    "bg-purple-600/80 border-purple-400 text-white shadow-[0_0_10px_rgba(147,51,234,0.5)]"
                                  )}>
                                  <span>Insure</span>
                                  <span className="font-mono text-[8px] sm:text-[9px] md:text-[11px]">${seat.hand.insuranceBet}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Display Bet & Win/Loss info */}
                      {(seat.userId !== null) && (seat.hand || (table.status === 'waiting' && gameRecords[0]?.tableId === table.id && gameRecords[0].seatResults?.find(sr => sr.seatIndex === seatIdx))) && (
                        <div className="absolute bottom-[40px] sm:bottom-[50px] md:bottom-[55px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-[100] w-full justify-center">
                          {(()=>{
                            const isWait = table.status === 'waiting';
                            const sr = (isWait && gameRecords[0]?.tableId === table.id) ? gameRecords[0].seatResults?.find(s => s.seatIndex === seatIdx) : null;
                            const betAmount = sr ? sr.bet : (seat.hand ? (seat.hand.bet + (seat.hand.sideBets?.pair || 0) + (seat.hand.sideBets?.twentyOnePlusThree || 0) + (seat.hand.insuranceBet || 0)) : 0);
                            
                            if (!betAmount) return null;

                            return (
                              <>
                                <div className={cn("flex items-center gap-1.5 bg-black/60 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md shadow-xl", 
                                  sr && sr.net > 0 ? "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : (sr && sr.net < 0 ? "border-[#ff6b6b]/40" : "")
                                )}>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[9px] uppercase tracking-wider text-white/50 font-bold leading-none mt-[1px]">BET</span>
                                  </div>
                                   <div className="w-[14px] h-[14px] rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] relative overflow-hidden">
                                      <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                                   </div>
                                  <span className="text-[12px] font-mono text-white leading-none mt-0.5">{betAmount % 1 !== 0 ? betAmount.toFixed(2) : betAmount}</span>
                                </div>
                              </>
                            );
                          })()}
                       </div>
                     )}

                     {/* If waiting, render the select overlay */}
                     {(!recentWinAmount) && (
                       <motion.div 
                         onClick={() => toggleSeatSelection(seatIdx)}
                         animate={shakeSeats && !isSelected && seat.userId === null ? { x: [-10, 10, -10, 10, 0] } : {}}
                         transition={{ duration: 0.4 }}
                         className={cn(
                           "absolute bottom-[5px] sm:bottom-[10px] left-1/2 -translate-x-1/2 w-[45px] h-[45px] sm:w-[50px] sm:h-[50px] md:w-[60px] md:h-[60px] text-[10px] sm:text-[12px] z-50 shadow-xl bg-black/60 rounded-full",
                           "flex flex-col items-center justify-center border transition-all cursor-pointer font-bold uppercase tracking-widest leading-none",
                           seat.isReady
                             ? "border-[#32d5a4] text-[#32d5a4] bg-[#32d5a4]/30 shadow-[0_0_15px_rgba(50,213,164,0.3)] backdrop-blur-[2px]" 
                             : (isSelected ? "border-amber-400/80 text-amber-400 bg-black/40 shadow-[0_0_15px_rgba(251,191,36,0.3)] backdrop-blur-[2px]" : 
                                (seat.userId !== null ? "border-white/20 text-white/50 bg-black/40 cursor-not-allowed" : "border-white/10 text-white bg-black/60 shadow-lg hover:border-white/50 backdrop-blur-[2px]")
                               ),
                           shakeSeats && !isSelected && seat.userId === null && "border-red-500/80 text-white bg-red-500/60"
                         )}
                       >
                         {seat.isReady ? (
                             <div className="flex flex-col items-center justify-center w-full h-full relative">
                               <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seat.userId}`} alt="Avatar" className={cn("w-[80%] h-[80%] rounded-full opacity-100", isSelected ? "ring-2 ring-offset-1 ring-offset-black ring-[#32d5a4] shadow-[0_0_15px_rgba(50,213,164,0.8)]" : "shadow-[0_0_10px_rgba(50,213,164,0.5)]")} />
                               {isSelected && <div className="absolute -bottom-2 sm:-bottom-2.5 bg-amber-500 text-black text-[6px] sm:text-[7px] font-black uppercase px-2 py-0.5 rounded shadow-lg z-20 whitespace-nowrap">You</div>}
                             </div>
                          ) : (
                           isSelected ? (
                             <div className="flex flex-col items-center justify-center w-full h-full relative">
                               <div className="absolute inset-[3px] rounded-full ring-2 ring-amber-400 ring-offset-0 animate-pulse shadow-[0_0_20px_rgba(251,191,36,0.8)] z-0"></div>
                               <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`} alt="Avatar" className="w-[80%] h-[80%] rounded-full opacity-100 relative z-10" />
                               <div className="absolute -bottom-2 sm:-bottom-2.5 bg-amber-500 text-black text-[6px] sm:text-[7px] font-black uppercase px-2 py-0.5 rounded shadow-lg z-20 whitespace-nowrap">You</div>
                             </div>
                           ) : (
                             seat.userId !== null ? (
                               <div className="flex flex-col items-center justify-center w-full h-full relative">
                                 <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seat.userId}`} alt="Avatar" className="w-[80%] h-[80%] rounded-full opacity-60 grayscale" />
                               </div>
                             ) : (
                                <div className="flex flex-col items-center gap-[1px]">
                                  <span className="text-[8px] sm:text-[10px] md:text-[12px] text-white/50 tracking-widest font-mono uppercase">SEAT {table.seats.length - seatIdx}</span>
                                  <span>Sit</span>
                                </div>
                              )
                           )
                         )}
                       </motion.div>
                     )}
                   </div>
                 );
               })}
             </div>
             {/* Left/Right scroll indicators for mobile */}
             <div className="absolute left-0 right-0 top-1/2 -translate-y-[20%] flex justify-between pointer-events-none px-1 md:hidden z-20">
                <button onClick={() => scrollSeats('left')} className="pointer-events-auto opacity-50 bg-black/40 rounded-full p-2 hover:bg-black/60 active:opacity-100 transition-opacity">
                  <ChevronLeft className="w-6 h-6 text-white drop-shadow-md" />
                </button>
                <button onClick={() => scrollSeats('right')} className="pointer-events-auto opacity-50 bg-black/40 rounded-full p-2 hover:bg-black/60 active:opacity-100 transition-opacity">
                  <ChevronRight className="w-6 h-6 text-white drop-shadow-md" />
                </button>
             </div>
           </div>
         </div>

         {/* Bottom Control Overlay (HUD) */}
           <div className="absolute bottom-1 sm:bottom-4 w-full flex flex-col items-center z-30 px-4 pointer-events-none">
           {table.status === 'waiting' && table.seats.some(s => s.userId === currentUser.id || s.userId === null) && (
              <div className="relative flex flex-col pointer-events-auto z-10 w-[96%] sm:w-auto drop-[0_10px_20px_rgba(0,0,0,0.6)]">
                <div 
                  className="relative flex flex-row items-center border-[2px] border-[#6b4c2a] rounded-full bg-gradient-to-b from-[#eac574] via-[#d0a758] to-[#997027] p-1 md:p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(0,0,0,0.4)] max-w-full w-full sm:w-[420px] h-[44px] sm:h-[60px]"
                >
                  <div className="absolute left-1 right-1 inset-y-1 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-20 pointer-events-none rounded-full"></div>

                  {/* Left Filigree */}
                  <div className="hidden sm:flex w-6 sm:w-10 items-center justify-center text-[#5c3e1b] opacity-80 z-10 mr-1">
                    <svg viewBox="0 0 60 120" className="h-8 w-auto">
                        <path d="M60 0 C30 0 20 20 10 40 C0 55 0 65 10 80 C20 100 30 120 60 120 Z" fill="#d0a758" stroke="currentColor" strokeWidth="2" />
                        <path d="M50 15 C30 15 25 30 30 40 C35 50 45 45 45 35" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M55 45 C40 45 35 55 40 65 C45 75 55 70 55 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M50 105 C30 105 25 90 30 80 C35 70 45 75 45 85" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  </div>

                  <div className="flex-1 flex flex-row gap-2 sm:gap-4 items-center z-10 mx-auto justify-center w-full max-w-full">
                      {/* Bet Input Body */}
                      <div className="flex items-center bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full w-[110px] sm:w-[150px] shrink-0 h-[32px] sm:h-[44px] p-1 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6),0_1px_1px_rgba(255,255,255,0.4)] border border-[#3a2510]">
                          <button 
                            onClick={handleMinus}
                            className="w-[24px] h-[24px] sm:w-[36px] sm:h-[36px] rounded-[8px] sm:rounded-xl bg-gradient-to-b from-[#bd945d] to-[#987241] flex justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold text-xl">
                            <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                          <input 
                              type="text"
                              className="flex-1 bg-transparent border-none outline-none text-white font-black text-[12px] sm:text-[18px] min-w-[20px] text-center px-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                              value={betAmountStr}
                              onChange={handleBetChange}
                              onBlur={handleBetBlur}
                          />
                          <button 
                            onClick={handlePlus}
                            className="w-[24px] h-[24px] sm:w-[36px] sm:h-[36px] rounded-[8px] sm:rounded-xl bg-gradient-to-b from-[#bd945d] to-[#987241] flex justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold text-xl">
                            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                      </div>

                      {/* SIDE Toggles */}
                      <div className="flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] sm:text-xs text-white/90 font-black uppercase tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] mb-[1px]" style={{WebkitTextStroke: '0.5px rgba(0,0,0,0.5)'}}>Side</span>
                        <button 
                          onClick={() => setSideBetsEnabled(!sideBetsEnabled)}
                          className={cn("w-8 h-4 sm:w-12 sm:h-6 rounded-full p-0.5 sm:p-1 transition-colors relative shadow-[inset_0_2px_4px_rgba(0,0,0,0.7)] border border-black/30", sideBetsEnabled ? "bg-[#32d5a4]" : "bg-[#454746]")}>
                            <div className={cn("w-3 h-3 sm:w-4 sm:h-4 rounded-full transition-transform shadow-md", sideBetsEnabled ? "bg-white translate-x-4 sm:translate-x-6" : "bg-[#c0c0c0] translate-x-0")} />
                        </button>
                      </div>

                      {/* DEAL Button */}
                      {(() => {
                        const isAnySeatNotReady = mySeats.some(sIdx => !table.seats[sIdx].isReady);
                        if (!isAnySeatNotReady && mySeats.length > 0) {
                          return (
                            <div className="relative w-[70px] sm:w-[120px] h-[32px] sm:h-[44px] flex items-center justify-center">
                               <span className="text-white/60 font-bold text-xs sm:text-sm tracking-widest uppercase">Ready</span>
                            </div>
                          );
                        }
                        
                        return (
                          <button 
                            onClick={() => handleStartGame()}
                            className={cn(
                              "relative overflow-hidden min-w-[70px] sm:min-w-[120px] h-[32px] sm:h-[44px] bg-gradient-to-b from-[#28a19b] to-[#126b6f] text-white rounded-[12px] sm:rounded-[20px] px-2 font-black tracking-widest text-[12px] sm:text-[16px] uppercase transition-all shadow-[inset_0_2px_2px_rgba(255,255,255,0.3),inset_0_-2px_4px_rgba(0,0,0,0.4),0_4px_8px_rgba(0,0,0,0.5)] border border-[#0d4f52] flex items-center justify-center shrink-0 group hover:from-[#2ebaba] hover:to-[#178287]",
                              dealCountdown !== null ? "animate-pulse shadow-[0_0_15px_rgba(40,161,155,0.8)]" : "active:scale-95"
                            )}>
                            <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] z-10 mr-1 sm:mr-3">
                              {dealCountdown !== null && dealCountdown > 0 ? (
                                <>Deal <span className="text-yellow-400">{dealCountdown}</span></>
                              ) : 'Deal'}
                            </span>
                          </button>
                        );
                      })()}
                  </div>
                  
                  {/* Right Filigree */}
                  <div className="hidden sm:flex w-6 sm:w-10 items-center justify-center text-[#5c3e1b] opacity-80 z-10 ml-1">
                    <svg viewBox="0 0 60 120" className="h-8 w-auto scale-x-[-1]">
                        <path d="M60 0 C30 0 20 20 10 40 C0 55 0 65 10 80 C20 100 30 120 60 120 Z" fill="#d0a758" stroke="currentColor" strokeWidth="2" />
                        <path d="M50 15 C30 15 25 30 30 40 C35 50 45 45 45 35" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M55 45 C40 45 35 55 40 65 C45 75 55 70 55 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M50 105 C30 105 25 90 30 80 C35 70 45 75 45 85" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>

                {/* Sidebets */}
                {sideBetsEnabled && (
                  <div 
                    className="bg-gradient-to-b from-[#2b1c0e] to-[#1a1005] border border-t-0 border-[#513518] rounded-b-2xl pb-1.5 sm:pb-3 shadow-[0_10px_20px_rgba(0,0,0,0.6)] flex flex-row gap-2 sm:gap-4 justify-center items-center z-0 relative w-[90%] max-w-[360px] mx-auto -mt-6 sm:-mt-6"
                    style={{ paddingTop: '26px' }}
                  >
                      <div className="flex flex-col gap-0.5 items-center">
                        <span className="text-[10px] sm:text-[12px] text-[#eac574] font-bold tracking-wide text-center drop-shadow-md leading-none whitespace-nowrap">
                          Pair <span className="text-white/60 text-[9px] sm:text-[10px] font-mono">(25:1)</span>
                        </span>
                        <div className="flex items-center bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full w-[95px] sm:w-[130px] h-[30px] sm:h-[40px] p-0.5 sm:p-1 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6)] border border-[#3a2510]">
                            <button 
                              onClick={handlePairMinus}
                              className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                            >
                              <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <input 
                              type="text"
                              className="flex-1 bg-transparent border-none outline-none text-white font-black text-[11px] sm:text-[14px] min-w-0 text-center px-0.5 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                              value={pairBetStr}
                              onChange={handlePairChange}
                              onBlur={handlePairBlur}
                              placeholder="10"
                            />
                            <button 
                              onClick={handlePairPlus}
                              className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                            >
                              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-0.5 items-center">
                        <span className="text-[10px] sm:text-[12px] text-[#eac574] font-bold tracking-wide text-center drop-shadow-md leading-none whitespace-nowrap">
                          21+3 <span className="text-white/60 text-[9px] sm:text-[10px] font-mono">(100:1)</span>
                        </span>
                        <div className="flex items-center bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full w-[95px] sm:w-[130px] h-[30px] sm:h-[40px] p-0.5 sm:p-1 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6)] border border-[#3a2510]">
                            <button 
                              onClick={handlePlus3Minus}
                              className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                            >
                              <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <input 
                              type="text"
                              className="flex-1 bg-transparent border-none outline-none text-white font-black text-[11px] sm:text-[14px] min-w-0 text-center px-0.5 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                              value={plus3BetStr}
                              onChange={handlePlus3Change}
                              onBlur={handlePlus3Blur}
                              placeholder="10"
                            />
                            <button 
                              onClick={handlePlus3Plus}
                              className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                            >
                              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                        </div>
                      </div>
                  </div>
                )}
              </div>
           )}

             {table.status === 'playing' && isMyTurn && (
               <div className="flex gap-1.5 sm:gap-4 pointer-events-auto flex-wrap justify-center mb-[6px] shrink-0">
                  {canBuyInsurance && (
                    <button
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl shadow-xl transition-transform active:scale-95 shadow-purple-500/20"
                      onClick={() => { soundManager.playClick(); buyInsurance(table.id, activeSeatIndex); }}
                    >
                      Insurance
                    </button>
                  )}
                  {canSplit && (
                    <button
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl shadow-xl transition-transform active:scale-95 shadow-blue-500/20"
                      onClick={() => { soundManager.playClick(); split(table.id, activeSeatIndex); }}
                    >
                      Split
                    </button>
                  )}
                  {canDouble && (
                    <button
                      className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl shadow-xl transition-transform active:scale-95 shadow-yellow-500/20"
                      onClick={() => { soundManager.playClick(); doubleDown(table.id, activeSeatIndex); }}
                    >
                      Double
                    </button>
                  )}
                  <button
                    className="bg-[#33a852] hover:bg-[#2c9646] text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-5 sm:px-8 py-2 rounded-lg sm:rounded-xl shadow-xl transition-transform active:scale-95 shadow-green-500/20"
                    onClick={() => { soundManager.playClick(); hit(table.id, activeSeatIndex); }}
                  >
                    Hit
                  </button>
                  <button
                    className="bg-[#ea4335] hover:bg-[#d63a2d] text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-5 sm:px-8 py-2 rounded-lg sm:rounded-xl shadow-xl transition-transform active:scale-95 shadow-red-500/20"
                    onClick={() => { soundManager.playClick(); stand(table.id, activeSeatIndex); }}
                  >
                    Stand
                  </button>
               </div>
             )}
           </div>

         </div>

           {/* Bottom Bar: RTP */}
           <div className="w-full max-w-[1024px] flex justify-center text-[12px] sm:text-[13px] font-bold tracking-wide py-1.5 sm:py-2.5 z-20 relative bg-black shrink-0 border-t border-white/10 md:border-x">
             <div className="flex items-center gap-4 sm:gap-6 px-4">
               <button onClick={() => setShowRules(true)} className="hover:text-white text-[#ffc53d] transition-colors uppercase cursor-pointer border-b border-[#ffc53d]/50 hover:border-[#ffc53d] pb-0.5 flex items-center gap-1.5 px-2 bg-[#ffc53d]/10 rounded-sm">
                  <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">RTP {calculateBaseRTP(table.settings.winningRule)}</span>
               </button>
               <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
               <div className="flex items-center gap-2 text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] pointer-events-none">
                 <span className="relative flex h-2 w-2">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_5px_rgba(52,211,153,0.8)]"></span>
                 </span>
                 <span className="text-white drop-shadow-sm font-semibold">On-Chain Randomness</span>
               </div>
             </div>
           </div>

    </div>
  );
}

