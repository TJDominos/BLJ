import { create } from 'zustand';
import React from 'react';

// State
export interface UIState {
  betAmountStr: string;
  sideBetsEnabled: boolean;
  autoDeal: boolean;
  pairBetStr: string;
  plus3BetStr: string;
  showHistory: boolean;
  showTournamentHistory: boolean;
  showRules: boolean;
  isMuted: boolean;
  shakeSeats: boolean;
  isShuffling: boolean;
  showDiscardStats: boolean;
  showFloatingComments: boolean;
  isCommentsOpen: boolean;
  isTablePlayersOpen: boolean;
  showSidebar: boolean;
  playMode: 'Gcoin' | 'Bonus';
  confirmAction: {message: string | React.ReactNode, onConfirm: () => void, confirmText?: string, cancelText?: string, onCancel?: () => void, title?: string} | null;
  actionCountdown: number | null;
  dealCountdown: number | null;
  recentWinAmount: { amount: number, won: boolean, seats?: number[] } | null;
}

// Actions
export interface UIActions {
  setBetAmountStr: (betStr: string) => void;
  setSideBetsEnabled: (enabled: boolean) => void;
  setAutoDeal: (autoDeal: boolean) => void;
  setPairBetStr: (betStr: string) => void;
  setPlus3BetStr: (betStr: string) => void;
  setShowHistory: (show: boolean) => void;
  setShowTournamentHistory: (show: boolean) => void;
  setShowRules: (show: boolean) => void;
  setIsMuted: (isMuted: boolean) => void;
  setShakeSeats: (shake: boolean) => void;
  setIsShuffling: (isShuffling: boolean) => void;
  setShowDiscardStats: (show: boolean) => void;
  setShowFloatingComments: (show: boolean) => void;
  setIsCommentsOpen: (is: boolean) => void;
  setIsTablePlayersOpen: (is: boolean) => void;
  setShowSidebar: (show: boolean) => void;
  setPlayMode: (mode: 'Gcoin' | 'Bonus') => void;
  setConfirmAction: (action: UIState['confirmAction']) => void;
  setActionCountdown: (countdown: number | null) => void;
  setDealCountdown: (countdown: number | null) => void;
  setRecentWinAmount: (amount: UIState['recentWinAmount']) => void;
}

// Store = State + Actions
type UIStore = UIState & UIActions;

const initialState: UIState = {
  betAmountStr: '0',
  sideBetsEnabled: false,
  autoDeal: false,
  pairBetStr: '10',
  plus3BetStr: '10',
  showHistory: false,
  showTournamentHistory: false,
  showRules: false,
  isMuted: false,
  shakeSeats: false,
  isShuffling: false,
  showDiscardStats: false,
  showFloatingComments: true,
  isCommentsOpen: false,
  isTablePlayersOpen: false,
  showSidebar: false,
  playMode: 'Gcoin',
  confirmAction: null,
  actionCountdown: null,
  dealCountdown: null,
  recentWinAmount: null,
};

// Mutations
export const useUIStore = create<UIStore>((set) => ({
  ...initialState,
  
  setBetAmountStr: (betAmountStr) => set({ betAmountStr }),
  setSideBetsEnabled: (sideBetsEnabled) => set({ sideBetsEnabled }),
  setAutoDeal: (autoDeal) => set({ autoDeal }),
  setPairBetStr: (pairBetStr) => set({ pairBetStr }),
  setPlus3BetStr: (plus3BetStr) => set({ plus3BetStr }),
  setShowHistory: (showHistory) => set({ showHistory }),
  setShowTournamentHistory: (showTournamentHistory) => set({ showTournamentHistory }),
  setShowRules: (showRules) => set({ showRules }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setShakeSeats: (shakeSeats) => set({ shakeSeats }),
  setIsShuffling: (isShuffling) => set({ isShuffling }),
  setShowDiscardStats: (showDiscardStats) => set({ showDiscardStats }),
  setShowFloatingComments: (showFloatingComments) => set({ showFloatingComments }),
  setIsCommentsOpen: (isCommentsOpen) => set({ isCommentsOpen }),
  setIsTablePlayersOpen: (isTablePlayersOpen) => set({ isTablePlayersOpen }),
  setShowSidebar: (showSidebar) => set({ showSidebar }),
  setPlayMode: (playMode) => set({ playMode }),
  setConfirmAction: (confirmAction) => set({ confirmAction }),
  setActionCountdown: (actionCountdown) => set({ actionCountdown }),
  setDealCountdown: (dealCountdown) => set({ dealCountdown }),
  setRecentWinAmount: (recentWinAmount) => set({ recentWinAmount }),
}));

// Selectors
export const selectUI = (state: UIStore) => state;
export const selectBetAmountStr = (state: UIStore) => state.betAmountStr;
export const selectSideBetsEnabled = (state: UIStore) => state.sideBetsEnabled;
export const selectAutoDeal = (state: UIStore) => state.autoDeal;
export const selectPairBetStr = (state: UIStore) => state.pairBetStr;
export const selectPlus3BetStr = (state: UIStore) => state.plus3BetStr;
export const selectShowHistory = (state: UIStore) => state.showHistory;
export const selectShowTournamentHistory = (state: UIStore) => state.showTournamentHistory;
export const selectShowRules = (state: UIStore) => state.showRules;
export const selectIsMuted = (state: UIStore) => state.isMuted;
export const selectShakeSeats = (state: UIStore) => state.shakeSeats;
export const selectIsShuffling = (state: UIStore) => state.isShuffling;
export const selectShowDiscardStats = (state: UIStore) => state.showDiscardStats;
export const selectShowFloatingComments = (state: UIStore) => state.showFloatingComments;
export const selectIsCommentsOpen = (state: UIStore) => state.isCommentsOpen;
export const selectIsTablePlayersOpen = (state: UIStore) => state.isTablePlayersOpen;
export const selectShowSidebar = (state: UIStore) => state.showSidebar;
export const selectPlayMode = (state: UIStore) => state.playMode;
export const selectConfirmAction = (state: UIStore) => state.confirmAction;
export const selectActionCountdown = (state: UIStore) => state.actionCountdown;
export const selectDealCountdown = (state: UIStore) => state.dealCountdown;
export const selectRecentWinAmount = (state: UIStore) => state.recentWinAmount;
