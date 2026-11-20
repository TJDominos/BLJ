import React, { useEffect, useRef, useState } from 'react';
import { Lock, X, ArrowLeft, Loader2, ShieldAlert, KeyRound } from 'lucide-react';
import type { Table } from '@/store/gameStore';

interface PrivateTablePinGateProps {
  table: Table;
  variant: 'modal' | 'page';
  onVerify: (pin: string) => Promise<boolean>;
  onUnlocked: () => void;
  onCancel: () => void;
}

export function PrivateTablePinGate({
  table,
  variant,
  onVerify,
  onUnlocked,
  onCancel,
}: PrivateTablePinGateProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  useEffect(() => {
    setDigits(['', '', '', '']);
    setError(null);
    setIsVerifying(false);
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [table.id]);

  const pin = digits.join('');
  const isComplete = /^\d{4}$/.test(pin);

  const submitPin = async (overridePin?: string) => {
    const code = (overridePin ?? digits.join('')).trim();
    if (isVerifying) return;
    if (!/^\d{4}$/.test(code)) {
      setError('Please enter a 4-digit PIN (0-9).');
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      const ok = await onVerify(code);
      if (ok) {
        onUnlocked();
      } else {
        setError('Incorrect 4-digit PIN. Please try again.');
        setDigits(['', '', '', '']);
        setTimeout(() => inputRefs.current[0]?.focus(), 30);
      }
    } catch {
      setError('Unable to verify PIN right now. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDigitChange = (index: number, raw: string) => {
    if (isVerifying) return;
    const onlyNums = raw.replace(/\D/g, '');
    if (!onlyNums) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      setError(null);
      return;
    }

    // Handle multi-digit paste or autofill
    if (onlyNums.length > 1) {
      const next = [...digits];
      let cursor = index;
      for (const ch of onlyNums) {
        if (cursor > 3) break;
        next[cursor] = ch;
        cursor++;
      }
      setDigits(next);
      setError(null);
      const focusIdx = Math.min(3, cursor);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = onlyNums[0];
    setDigits(next);
    setError(null);
    if (index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
        setError(null);
      } else if (index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
        setError(null);
        inputRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight' && index < 3) {
      inputRefs.current[index + 1]?.focus();
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && isComplete && !isVerifying) {
      e.preventDefault();
      void submitPin();
      return;
    }
    if (e.key === 'Escape' && variant === 'modal' && !isVerifying) {
      e.preventDefault();
      onCancel();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    setError(null);
    inputRefs.current[Math.min(3, pasted.length)]?.focus();
  };

  const card = (
    <div className="w-full max-w-md rounded-2xl bg-[#111915] border border-[#c6a364]/40 shadow-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/35">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight truncate">
              Private Table PIN
            </h3>
            <p className="text-xs text-slate-400 truncate">
              PIN required to enter this table
            </p>
          </div>
        </div>
        {variant === 'modal' && (
          <button
            type="button"
            disabled={isVerifying}
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <div className="rounded-xl bg-black/35 border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{table.name}</div>
            <div className="text-xs text-slate-400 mt-0.5 truncate">
              {table.houseName ? `Host: ${table.houseName}` : 'Private Room'}
              {' · '}
              {table.settings.mode === 'tournament'
                ? 'Tournament'
                : `Limits ${table.settings.minBet}–${table.settings.maxBet}`}
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-400/35 text-amber-300 text-xs font-semibold inline-flex items-center gap-1 shrink-0">
            <KeyRound className="w-3 h-3" />
            <span>4-Digit PIN</span>
          </span>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs sm:text-sm text-slate-300 text-center">
            Enter the 4-digit access PIN provided by the table host
          </p>
          <div className="grid grid-cols-4 gap-3 max-w-[260px] mx-auto">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                disabled={isVerifying}
                value={digit}
                aria-label={`PIN digit ${idx + 1}`}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                className={`w-full h-14 rounded-xl bg-black/55 border text-amber-300 font-mono text-2xl font-bold text-center focus:outline-none transition-colors ${
                  error
                    ? 'border-rose-500/70 focus:border-rose-400'
                    : digit
                    ? 'border-[#d4af37] focus:border-[#f5d97e]'
                    : 'border-white/15 focus:border-[#d4af37]'
                }`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            disabled={isVerifying}
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {variant === 'page' && <ArrowLeft className="w-4 h-4" />}
            <span>{variant === 'page' ? 'Back to Lobby' : 'Cancel'}</span>
          </button>
          <button
            type="button"
            disabled={isVerifying || !isComplete}
            onClick={() => void submitPin()}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] disabled:opacity-50 transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Unlock &amp; Enter</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (variant === 'page') {
    return (
      <div className="w-full flex-1 flex items-center justify-center p-4 bg-[#070b09]">
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isVerifying) onCancel();
      }}
    >
      {card}
    </div>
  );
}
