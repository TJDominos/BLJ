import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useGameStore } from '@/store/gameStore';
import { RegularTableView } from './RegularTableView';
import { TournamentTableView } from './TournamentTableView';
import { Loader2 } from 'lucide-react';

export function BlackjackTable({ onNavigate, onToggleSidebar, isSidebarOpen }: { onNavigate: (view: 'lobby' | 'create' | 'table' | 'host_table' | 'manage_tables') => boolean | void, onToggleSidebar?: () => void, isSidebarOpen?: boolean }) {
  const { id } = useParams();
  const { tables, activeTableId } = useGameStore();
  
  useEffect(() => {
    if (id && id !== activeTableId && tables[id]) {
      // Just silently set it so url controls it
      useGameStore.setState({ activeTableId: id });
    }
  }, [id, activeTableId, tables]);

  const table = tables[activeTableId || id || ''];

  if (!table) {
    return (
      <div className="w-full flex-1 flex items-center justify-center bg-transparent">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (table.settings.mode === 'tournament') {
    return <TournamentTableView onNavigate={onNavigate} onToggleSidebar={onToggleSidebar} isSidebarOpen={isSidebarOpen} />;
  }

  return <RegularTableView onNavigate={onNavigate} onToggleSidebar={onToggleSidebar} isSidebarOpen={isSidebarOpen} />;
}
