import React, { useEffect, useState } from 'react';
import { useParams } from '@/lib/router';
import { useGameStore } from '@/store/gameStore';
import { RegularTableView } from './RegularTableView';
import { TournamentTableView } from './TournamentTableView';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

export function BlackjackTable({
  onNavigate,
  onToggleSidebar,
  isSidebarOpen,
}: {
  onNavigate: (view: 'lobby' | 'create' | 'table' | 'host_table' | 'manage_tables') => boolean | void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}) {
  const { id } = useParams();
  const { tables, activeTableId, roomStatus, roomError, reconnectRoom } = useGameStore();
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (id && id !== activeTableId && tables[id]) {
      useGameStore.setState({ activeTableId: id });
    }
  }, [id, activeTableId, tables]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await reconnectRoom();
    } finally {
      setIsRetrying(false);
    }
  };

  const table = tables[activeTableId || id || ''];

  if (!table) {
    if (roomStatus === 'error' || roomStatus === 'closed') {
      return (
        <div className="w-full flex-1 flex items-center justify-center p-4 bg-[#070b09]">
          <div className="w-full max-w-md rounded-2xl bg-[#111714] border border-rose-500/35 p-6 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-rose-400" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-white">Room Connection Failed</h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {roomError || 'Unable to connect to the online multiplayer room. Please check your connection and try again.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('lobby')}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Lobby</span>
              </button>
              <button
                type="button"
                disabled={isRetrying}
                onClick={handleRetry}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Reconnecting...' : 'Retry Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (roomStatus !== 'connected') {
      const statusLabel =
        roomStatus === 'reconnecting'
          ? 'Reconnecting to Online Room...'
          : roomStatus === 'matching'
          ? 'Matching Online Room...'
          : 'Connecting to Online Room...';
      return (
        <div className="w-full flex-1 flex items-center justify-center p-4 bg-[#070b09]">
          <div className="w-full max-w-md rounded-2xl bg-[#111714] border border-[#c6a364]/30 p-6 text-center shadow-2xl space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
            <h2 className="text-base sm:text-lg font-bold text-white">{statusLabel}</h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Synchronizing authoritative room state via RoomClient...
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex-1 flex items-center justify-center p-4 bg-[#070b09]">
        <div className="w-full max-w-md rounded-2xl bg-[#111714] border border-white/10 p-6 text-center shadow-2xl space-y-4">
          <h2 className="text-lg font-bold text-white">Room Not Found</h2>
          <p className="text-xs sm:text-sm text-slate-300">
            This table is not available or has already closed.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('lobby')}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Lobby</span>
          </button>
        </div>
      </div>
    );
  }

  const connectionBanner =
    roomStatus === 'error' || roomStatus === 'closed' ? (
      <div className="w-full px-4 py-2 bg-[#1a1314] border-b border-rose-500/35 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-xs sm:text-sm text-slate-200 truncate">
            {roomError || 'Connection to the online room was interrupted.'}
          </span>
        </div>
        <button
          type="button"
          disabled={isRetrying}
          onClick={handleRetry}
          className="px-3 py-1 rounded-lg text-xs font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>{isRetrying ? 'Reconnecting...' : 'Retry'}</span>
        </button>
      </div>
    ) : roomStatus !== 'connected' ? (
      <div className="w-full px-4 py-2 bg-[#141b17] border-b border-[#c6a364]/30 flex items-center justify-center gap-2 shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
        <span className="text-xs sm:text-sm text-slate-200">
          {roomStatus === 'reconnecting'
            ? 'Reconnecting to Online Room...'
            : roomStatus === 'matching'
            ? 'Matching Online Room...'
            : 'Connecting to Online Room...'}
        </span>
      </div>
    ) : null;

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      {connectionBanner}
      {table.settings.mode === 'tournament' ? (
        <TournamentTableView onNavigate={onNavigate} onToggleSidebar={onToggleSidebar} isSidebarOpen={isSidebarOpen} />
      ) : (
        <RegularTableView onNavigate={onNavigate} onToggleSidebar={onToggleSidebar} isSidebarOpen={isSidebarOpen} />
      )}
    </div>
  );
}
