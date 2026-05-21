import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';

interface WalletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  depositAmount: string;
  currency: string;
  onSelect: () => void;
}

const DEFAULT_ICONS: Record<string, string> = {
  metamask: "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg",
  okx: "https://cryptologos.cc/logos/okb-okb-logo.svg",
  binance: "https://upload.wikimedia.org/wikipedia/commons/f/fc/Binance-coin-bnb-logo.png",
  phantom: "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTA4IiBoZWlnaHQ9IjEwOCIgcng9IjU0IiBmaWxsPSIjQUI5RkYyIi8+PHBhdGggZD0iTTMwIDgwQzIyIDcwIDI1IDUwIDQyIDM2QzU0IDI2IDcxIDIyIDg4IDM0QzEwNSA0NSAxMDEgNzQgODggODJDNzcgODggNzQgODAgNzEgNzJDNjggNjQgNjIgODcgNTMgODdDNDUgODcgNDYgNzUgNDEgODFDMzggODUgMzUgODUgMzAgODBaIiBmaWxsPSJ3aGl0ZSIvPjxlbGxpcHNlIGN4PSI2NiIgY3k9IjQ4IiByeD0iNiIgcnk9IjciIGZpbGw9IiNBQjlGRjIiLz48ZWxsaXBzZSBjeD0iODQiIGN5PSI0OCIgcng9IjYiIHJ5PSI3IiBmaWxsPSIjQUI5RkYyIi8+PC9zdmc+"
};

type Step = 'SELECT_WALLET' | 'CONNECTING' | 'PENDING' | 'SUCCESS';

export function WalletSelector({ isOpen, onClose, depositAmount, currency, onSelect }: WalletSelectorProps) {
  const [wallets, setWallets] = useState<{ id: string, name: string, installed: boolean, icon?: string, url?: string }[]>([]);
  const [step, setStep] = useState<Step>('SELECT_WALLET');
  const [selectedWallet, setSelectedWallet] = useState<{name: string, icon?: string} | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close after a delay
      setTimeout(() => setStep('SELECT_WALLET'), 300);
      return;
    }

    // Basic detection
    const detected = [
      {
        id: 'metamask',
        name: 'MetaMask',
        installed: !!(window as any).ethereum?.isMetaMask,
        icon: DEFAULT_ICONS.metamask,
        url: 'https://metamask.io/download/'
      },
      {
        id: 'okx',
        name: 'OKX Wallet',
        installed: !!(window as any).okxwallet,
        icon: DEFAULT_ICONS.okx,
        url: 'https://www.okx.com/web3/build/projects/wallets'
      },
      {
        id: 'binance',
        name: 'Binance Wallet',
        installed: !!(window as any).BinanceChain,
        icon: DEFAULT_ICONS.binance,
        url: 'https://www.bnbchain.org/en/binance-wallet'
      },
      {
        id: 'phantom',
        name: 'Phantom',
        installed: !!(window as any).phantom?.solana,
        icon: DEFAULT_ICONS.phantom,
        url: 'https://phantom.app/'
      }
    ];

    // Listen for EIP-6963 providers
    const handleInjectedProvider = (e: any) => {
      const providerDetail = e.detail;
      if (providerDetail && providerDetail.info) {
        setWallets(prev => {
          if (!prev.find(w => w.name === providerDetail.info.name)) {
            return [...prev, { 
              id: providerDetail.info.uuid, 
              name: providerDetail.info.name, 
              installed: true,
              icon: providerDetail.info.icon // EIP-6963 often includes a data URI icon
            }];
          }
          return prev;
        });
      }
    };
    
    window.addEventListener('eip6963:announceProvider', handleInjectedProvider);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    setWallets(prev => {
      const all = [...prev];
      detected.forEach(d => {
        // deduplicate by name loosely
        if (!all.find(w => 
          w.name.toLowerCase() === d.name.toLowerCase() || 
          (w.name.toLowerCase().includes('metamask') && d.name.toLowerCase().includes('metamask'))
        )) {
          all.push(d);
        }
      });
      return all;
    });

    return () => window.removeEventListener('eip6963:announceProvider', handleInjectedProvider);
  }, [isOpen]);

  const handleWalletSelect = (wallet: {name: string, icon?: string}) => {
    setSelectedWallet(wallet);
    setStep('CONNECTING');
    
    // Simulate flow
    setTimeout(() => {
      setStep('PENDING'); // e.g. user approved transaction in wallet, now waiting on chain
      
      setTimeout(() => {
        setStep('SUCCESS'); // transaction mined
        
        setTimeout(() => {
          onClose();
          onSelect();
        }, 1500); // close after 1.5s
      }, 3000);
    }, 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-auto bg-black/40 backdrop-blur-sm sm:px-4">
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 1 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 100, scale: 1 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-[#ebedf5] w-full sm:max-w-sm rounded-t-[32px] sm:rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 bg-white">
              <h3 className="font-bold text-slate-800 tracking-wide">
                {step === 'SELECT_WALLET' ? 'Connect Wallet' : 'Deposit Status'}
              </h3>
              <button 
                onClick={onClose}
                className="p-2 -mr-2 text-slate-400 hover:text-slate-800 hover:bg-black/5 rounded-full transition-colors"
                disabled={step === 'PENDING' || step === 'CONNECTING'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 overflow-y-auto w-full">
              {step === 'SELECT_WALLET' && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <p className="text-sm text-slate-500 mb-4 px-2">
                    Select an installed wallet to sign your deposit transaction of <span className="font-bold text-slate-700">{depositAmount} {currency}</span>.
                  </p>
                  <div className="space-y-2">
                    {wallets.length === 0 ? (
                      <div className="p-4 text-center rounded-xl bg-white border border-black/5 text-slate-500 text-sm">
                        No compatible wallets detected.
                      </div>
                    ) : (
                      wallets.map(w => (
                        <button
                          key={w.id}
                          onClick={() => w.installed ? handleWalletSelect(w) : (w.url && window.open(w.url, '_blank'))}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${w.installed ? 'bg-white border-black/5 hover:border-[#126b6f] hover:shadow-md cursor-pointer' : 'bg-white/50 border-black/5 hover:bg-white/80 cursor-pointer opacity-70'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 flex items-center justify-center rounded-lg overflow-hidden shrink-0">
                              {w.icon ? (
                                 <img src={w.icon} className="w-full h-full object-contain" alt={`${w.name} logo`} />
                              ) : (
                                 <div className="w-full h-full bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-xs">{w.name.charAt(0)}</div>
                              )}
                            </div>
                            <span className={`font-semibold ${w.installed ? 'text-slate-800' : 'text-slate-500'}`}>{w.name}</span>
                          </div>
                          {w.installed ? (
                            <div className="flex items-center gap-2">
                               <span className="text-[10px] uppercase font-bold text-[#126b6f] bg-[#126b6f]/10 px-2 py-0.5 rounded-full">Installed</span>
                               <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                               <span className="text-[10px] uppercase font-bold text-slate-400">Get</span>
                               <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}

              {step === 'CONNECTING' && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                   <div className="relative">
                     {selectedWallet?.icon && <img src={selectedWallet.icon} className="w-16 h-16 object-contain z-10 relative" alt="Wallet icon" />}
                     <div className="absolute inset-0 bg-[#126b6f] blur-xl opacity-20 rounded-full animate-pulse"></div>
                   </div>
                   <div>
                     <h4 className="font-bold text-lg text-slate-800">Approve transaction</h4>
                     <p className="text-sm text-slate-500 mt-1 max-w-[200px] mx-auto">Please open your {selectedWallet?.name} extension to sign the message.</p>
                   </div>
                </motion.div>
              )}

              {step === 'PENDING' && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                   <Loader2 className="w-16 h-16 text-[#126b6f] animate-spin" />
                   <div>
                     <h4 className="font-bold text-lg text-slate-800">Transaction Pending</h4>
                     <p className="text-sm text-slate-500 mt-1">Waiting for on-chain confirmation. This may take a few seconds.</p>
                   </div>
                </motion.div>
              )}

              {step === 'SUCCESS' && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                   <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                   <div>
                     <h4 className="font-bold text-lg text-emerald-600">Deposit Successful!</h4>
                     <p className="text-sm text-slate-500 mt-1">Your liquidity has been added.</p>
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
