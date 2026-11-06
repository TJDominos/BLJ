import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, Loader2, CheckCircle2, Wallet, ShieldCheck, Coins } from 'lucide-react';

interface WalletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  depositAmount: string;
  currency: string;
  onSelect: () => void;
}

type Step = 'SELECT_WALLET' | 'CONNECTING' | 'PENDING' | 'SUCCESS';

interface WalletOption {
  id: string;
  name: string;
  description: string;
  badge?: string;
}

const WALLET_OPTIONS: WalletOption[] = [
  { id: 'randseed', name: 'RandSeed Account', description: 'Platform connected session', badge: 'Fastest' },
  { id: 'solana', name: 'Solana Network', description: 'SOL / SPL Token liquidity' },
  { id: 'evm', name: 'EVM Network', description: 'Ethereum / Arbitrum / BSC' },
  { id: 'instant', name: 'Direct Deposit', description: 'Instant table liquidity' },
];

export function WalletSelector({ isOpen, onClose, depositAmount, currency, onSelect }: WalletSelectorProps) {
  const [step, setStep] = useState<Step>('SELECT_WALLET');
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);

  const handleWalletSelect = (wallet: WalletOption) => {
    setSelectedWallet(wallet);
    setStep('CONNECTING');

    setTimeout(() => {
      setStep('PENDING');

      setTimeout(() => {
        setStep('SUCCESS');

        setTimeout(() => {
          onClose();
          onSelect();
          setStep('SELECT_WALLET');
        }, 1200);
      }, 1500);
    }, 1000);
  };

  const handleClose = () => {
    if (step === 'CONNECTING' || step === 'PENDING') return;
    setStep('SELECT_WALLET');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm sm:px-4">
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.95 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-[#181a20] border border-white/10 w-full sm:max-w-md rounded-t-[32px] sm:rounded-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh] text-white"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#1e2029]">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-[#2ebaba]" />
                <h3 className="font-bold text-white tracking-wide">
                  {step === 'SELECT_WALLET' ? 'Deposit Liquidity' : 'Processing Deposit'}
                </h3>
              </div>
              <button 
                onClick={handleClose}
                className="p-2 -mr-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                disabled={step === 'PENDING' || step === 'CONNECTING'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 overflow-y-auto w-full">
              {step === 'SELECT_WALLET' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="bg-[#126b6f]/15 border border-[#126b6f]/30 rounded-xl p-3 mb-4 text-xs text-[#6ee7b7] flex items-center justify-between">
                    <span>Deposit Amount</span>
                    <span className="font-bold text-sm text-white">{depositAmount} {currency}</span>
                  </div>

                  <p className="text-xs text-white/60 mb-3 px-1">
                    Select source to fund this table's host liquidity pool:
                  </p>

                  <div className="space-y-2">
                    {WALLET_OPTIONS.map((w) => (
                      <button
                        key={w.id}
                        onClick={() => handleWalletSelect(w)}
                        className="w-full flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#126b6f] transition-all text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-[#2ebaba]/10 border border-[#2ebaba]/20 flex items-center justify-center text-[#2ebaba] shrink-0 group-hover:scale-105 transition-transform">
                            <Wallet className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-white flex items-center gap-2">
                              {w.name}
                              {w.badge && (
                                <span className="text-[10px] font-bold text-[#2ebaba] bg-[#2ebaba]/15 px-1.5 py-0.5 rounded">
                                  {w.badge}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-white/50">{w.description}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 'CONNECTING' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-[#126b6f]/20 border border-[#126b6f]/40 flex items-center justify-center text-[#2ebaba]">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-white">Connecting Source</h4>
                    <p className="text-xs text-white/60 mt-1 max-w-[240px] mx-auto">
                      Preparing authorization for {selectedWallet?.name}...
                    </p>
                  </div>
                </motion.div>
              )}

              {step === 'PENDING' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                  <Loader2 className="w-12 h-12 text-[#2ebaba] animate-spin" />
                  <div>
                    <h4 className="font-bold text-base text-white">Confirming Liquidity Deposit</h4>
                    <p className="text-xs text-white/60 mt-1">
                      Crediting {depositAmount} {currency} to table liquidity bankroll...
                    </p>
                  </div>
                </motion.div>
              )}

              {step === 'SUCCESS' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  <div>
                    <h4 className="font-bold text-base text-emerald-400">Liquidity Deposited!</h4>
                    <p className="text-xs text-white/60 mt-1">Your table has been successfully funded.</p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
