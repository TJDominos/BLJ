import React from 'react';

interface ConfirmAction {
  title?: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ConfirmModalProps {
  action: ConfirmAction;
  onClose: () => void;
}

export function ConfirmModal({ action, onClose }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-[#1a120b] border border-[#3a2510] rounded-xl p-6 flex flex-col items-center shadow-[0_10px_40px_rgba(0,0,0,0.8)] max-w-xs w-full relative">
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 text-white/50 hover:text-white transition-colors p-1"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <h3 className="text-[#eac574] text-lg font-bold mb-4 text-center mt-2">{action.title || 'Confirm Action'}</h3>
        <div className="text-white/80 text-sm mb-6 text-center">{action.message}</div>
        <div className="flex w-full gap-4">
          <button 
            onClick={() => {
              if (action.onCancel) action.onCancel();
              onClose();
            }}
            className="flex-1 py-3 px-2 rounded-lg bg-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/20 transition-colors"
          >
            {action.cancelText || 'Cancel'}
          </button>
          <button 
            onClick={() => {
              action.onConfirm();
              onClose();
            }}
            className="flex-1 py-3 px-2 rounded-lg bg-gradient-to-b from-[#28a19b] to-[#126b6f] text-white text-xs font-bold uppercase tracking-wider hover:from-[#2ebaba] hover:to-[#178287] transition-colors"
          >
            {action.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
