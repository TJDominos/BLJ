import React from 'react';
import { useGameStore } from '@/store/gameStore';
import { RegularTableView } from './RegularTableView';
import { TournamentTableView } from './TournamentTableView';
import { Loader2 } from 'lucide-react';

export function BlackjackTable({ onNavigate, onToggleSidebar }: { onNavigate: (view: 'lobby' | 'create' | 'table' | 'host_table' | 'manage_tables') => boolean | void, onToggleSidebar?: () => void }) {
  const { tables, activeTableId } = useGameStore();
  const table = tables[activeTableId || ''];

  if (!table) {
    return (
      <div className="w-full flex-1 flex items-center justify-center bg-transparent">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (table.settings.mode === 'tournament') {
    return <TournamentTableView onNavigate={onNavigate} onToggleSidebar={onToggleSidebar} />;
  }

  return <RegularTableView onNavigate={onNavigate} onToggleSidebar={onToggleSidebar} />;
}
