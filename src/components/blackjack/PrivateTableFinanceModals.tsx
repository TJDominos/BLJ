import React, { useEffect, useState } from 'react';
import { X, Coins, Landmark, ArrowDownLeft, ArrowUpRight, Loader2, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Table, PrivateSessionSettlement } from '@/store/gameStore';

interface PrivateBuyInModalProps {
  table: Table;
  walletBalance: number;
  currentTableChips: number;
  mode: 'sit' | 'topup';
  onConfirm: (amount: number) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export function PrivateBuyInModal({
  table,
  walletBalance,
  currentTableChips,
  mode,
  onConfirm,
  onClose,
}: PrivateBuyInModalProps) {
  const minAmount = Math.max(1, table.settings.minBet);
  const maxAmount = Math.max(0, Math.floor(walletBalance));
  const defaultBuyIn = Math.min(
    maxAmount,
    Math.max(minAmount, Math.min(table.settings.minBet * 20, table.settings.maxBet * 2))
  );

  const [amountStr, setAmountStr] = useState(String(defaultBuyIn > 0 ? defaultBuyIn : minAmount));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAmountStr(String(defaultBuyIn > 0 ? defaultBuyIn : minAmount));
    setError(null);
  }, [table.id, mode, defaultBuyIn, minAmount]);

  const parsedAmount = Math.max(0, Math.floor(Number(amountStr) || 0));
  const canAffordMin = maxAmount >= minAmount;
  const isValid = canAffordMin && parsedAmount >= minAmount && parsedAmount <= maxAmount;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!canAffordMin) {
      setError(`You need at least ${minAmount.toLocaleString()} Coins in your wallet to buy in.`);
      return;
    }
    if (parsedAmount < minAmount) {
      setError(`Minimum buy-in is ${minAmount.toLocaleString()} Coins.`);
      return;
    }
    if (parsedAmount > maxAmount) {
      setError(`Amount exceeds your wallet balance (${maxAmount.toLocaleString()} Coins).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await onConfirm(parsedAmount);
      if (res.ok) {
        onClose();
      } else {
        setError(res.error || 'Failed to buy in. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to buy in.');
    } finally {
      setSubmitting(false);
    }
  };

  const presets = [
    { label: 'Min', value: Math.min(maxAmount, minAmount) },
    { label: '25%', value: Math.max(minAmount, Math.floor(maxAmount * 0.25)) },
    { label: '50%', value: Math.max(minAmount, Math.floor(maxAmount * 0.5)) },
    { label: 'Max', value: maxAmount },
  ].filter((p) => p.value >= minAmount && p.value <= maxAmount);

  return (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#111915] border border-[#c6a364]/40 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/35">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">
                {mode === 'sit' ? 'Table Buy-In' : 'Top Up Table Chips'}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {table.name} · Independent Session Stack
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/35 border border-white/10 p-3">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Wallet Available</div>
              <div className="font-mono font-bold text-amber-300 text-base mt-0.5">
                {maxAmount.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-black/35 border border-white/10 p-3">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">
                {mode === 'topup' ? 'Current Table Chips' : 'House Bankroll'}
              </div>
              <div className="font-mono font-bold text-emerald-300 text-base mt-0.5">
                {mode === 'topup'
                  ? currentTableChips.toLocaleString()
                  : Math.floor(table.liquidity).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold">Buy-In Amount (Game Coins)</span>
              <span className="text-slate-400">
                Min {minAmount.toLocaleString()} · Max {maxAmount.toLocaleString()}
              </span>
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={minAmount}
              max={maxAmount}
              disabled={submitting || !canAffordMin}
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid && !submitting) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              className="w-full px-4 py-3 rounded-xl bg-black/50 border border-amber-400/40 text-amber-300 font-mono text-xl font-bold focus:outline-none focus:border-[#d4af37]"
            />
            {presets.length > 0 && (
              <div className="grid grid-cols-4 gap-2 pt-0.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setAmountStr(String(p.value));
                      setError(null);
                    }}
                    className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-xs text-emerald-200 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Table chips are settled independently during play and automatically returned to your wallet when you leave the table.
            </span>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || !isValid}
              onClick={() => void handleSubmit()}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{mode === 'sit' ? 'Buy In & Sit' : 'Add Table Chips'}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PrivateHostBankrollModalProps {
  table: Table;
  walletBalance: number;
  isMidHand: boolean;
  onDeposit: (amount: number) => Promise<{ ok: boolean; error?: string }>;
  onWithdraw: (amount: number) => Promise<{ ok: boolean; error?: string }>;
  onCloseTable: () => Promise<void>;
  onClose: () => void;
}

export function PrivateHostBankrollModal({
  table,
  walletBalance,
  isMidHand,
  onDeposit,
  onWithdraw,
  onCloseTable,
  onClose,
}: PrivateHostBankrollModalProps) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amountStr, setAmountStr] = useState('500');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const staked = Math.round(table.stakedFromWallet ?? table.initialLiquidity ?? 0);
  const currentBankroll = Math.round(table.liquidity || 0);
  const houseNet = currentBankroll - staked;
  const maxForTab = tab === 'deposit' ? Math.floor(walletBalance) : Math.floor(currentBankroll);
  const parsedAmount = Math.max(0, Math.floor(Number(amountStr) || 0));

  const handleAction = async () => {
    if (busy) return;
    if (parsedAmount <= 0 || parsedAmount > maxForTab) {
      setError(`Enter an amount between 1 and ${maxForTab.toLocaleString()} Coins.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res =
        tab === 'deposit'
          ? await onDeposit(parsedAmount)
          : await onWithdraw(parsedAmount);
      if (res.ok) {
        setAmountStr('');
        onClose();
      } else {
        setError(res.error || 'Action failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#111915] border border-[#c6a364]/40 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/35">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">Host Bankroll</h3>
              <p className="text-xs text-slate-400 truncate">{table.name}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-black/35 border border-white/10 p-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Bankroll</div>
              <div className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                {currentBankroll.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-black/35 border border-white/10 p-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Staked</div>
              <div className="font-mono font-bold text-white text-sm mt-0.5">
                {staked.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-black/35 border border-white/10 p-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">House P/L</div>
              <div
                className={`font-mono font-bold text-sm mt-0.5 ${
                  houseNet > 0 ? 'text-emerald-400' : houseNet < 0 ? 'text-rose-400' : 'text-slate-300'
                }`}
              >
                {houseNet >= 0 ? '+' : ''}
                {houseNet.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/40 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => {
                setTab('deposit');
                setError(null);
              }}
              className={`py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'deposit' ? 'bg-[#e5c158] text-[#090d0b]' : 'text-slate-300 hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('withdraw');
                setError(null);
              }}
              className={`py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'withdraw' ? 'bg-[#e5c158] text-[#090d0b]' : 'text-slate-300 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Withdraw</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>{tab === 'deposit' ? 'Transfer from Wallet' : 'Return to Wallet'}</span>
              <span className="text-slate-400">
                Available: {maxForTab.toLocaleString()}
              </span>
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxForTab}
              disabled={busy || (tab === 'withdraw' && isMidHand)}
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setError(null);
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-black/50 border border-white/15 text-amber-300 font-mono text-lg font-bold focus:outline-none focus:border-[#d4af37]"
            />
            {tab === 'withdraw' && isMidHand && (
              <p className="text-xs text-amber-300/90">
                Withdrawal is locked while a hand is in progress.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onCloseTable();
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 cursor-pointer"
            >
              Close &amp; Settle Table
            </button>
            <button
              type="button"
              disabled={busy || parsedAmount <= 0 || parsedAmount > maxForTab || (tab === 'withdraw' && isMidHand)}
              onClick={() => void handleAction()}
              className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{tab === 'deposit' ? 'Deposit Coins' : 'Withdraw Coins'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PrivateSettlementReceiptBannerProps {
  settlement: PrivateSessionSettlement;
  onDismiss: () => void;
}

export function PrivateSettlementReceiptBanner({
  settlement,
  onDismiss,
}: PrivateSettlementReceiptBannerProps) {
  const isPositive = settlement.net > 0;
  const isNegative = settlement.net < 0;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-2rem)] max-w-md pointer-events-auto">
      <div className="rounded-2xl bg-[#111a16]/95 backdrop-blur-md border border-[#d4af37]/50 shadow-[0_12px_40px_rgba(0,0,0,0.75)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">
                {settlement.role === 'host'
                  ? 'House Bankroll Settled'
                  : 'Private Table Settled'}
              </div>
              <div className="text-xs text-slate-400 truncate">
                {settlement.tableName} · Credited to Wallet
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              {settlement.role === 'host' ? 'Deposited' : 'Buy-In'}
            </div>
            <div className="font-mono font-bold text-sm text-slate-200 mt-0.5">
              {settlement.buyIn.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              {settlement.role === 'host' ? 'Returned' : 'Cash-Out'}
            </div>
            <div className="font-mono font-bold text-sm text-amber-300 mt-0.5">
              {settlement.cashOut.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Net P/L</div>
            <div
              className={`font-mono font-bold text-sm mt-0.5 ${
                isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {settlement.net > 0 ? '+' : ''}
              {settlement.net.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
