import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured } from '../utils/supabase';
import { adminLoginRPC, setAdminSessionToken } from '../services/supabaseService';
import { ThemeToggle } from './ThemeToggle';

interface AdminLoginProps {
  expectedPin?: string;
  onLoginSuccess: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

const DEVICE_TOKEN_KEY = 'luky_device_token';

export const AdminLogin: React.FC<AdminLoginProps> = ({
  expectedPin = '1234',
  onLoginSuccess,
  isDark = false,
  onToggleTheme
}) => {
  // PIN state
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Security & lockout state
  const [errorMsg, setErrorMsg] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer regressivo de bloqueio temporário (Lockout contra tentativas brutas)
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          setErrorMsg('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPin(val);
    if (errorMsg && lockoutSeconds <= 0) setErrorMsg('');
  };

  // Envio do PIN
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (lockoutSeconds > 0) return;

    if (!pin.trim()) {
      setErrorMsg('Por favor, digite o PIN numérico.');
      return;
    }

    if (pin.length < 4) {
      setErrorMsg('O PIN deve conter no mínimo 4 dígitos.');
      return;
    }

    setIsSubmitting(true);

    try {
      const storedDeviceToken = localStorage.getItem(DEVICE_TOKEN_KEY) || '';
      let data: any = null;

      // 1. Tenta autenticar pelo Supabase RPC (segurança direta no banco)
      if (isSupabaseConfigured) {
        data = await adminLoginRPC(pin.trim(), storedDeviceToken);
      }

      // 2. Se o Supabase não responder, tenta a API local
      if (!data) {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: pin.trim(),
            deviceToken: storedDeviceToken
          })
        });

        if (res.status === 429) {
          const lockedData = await res.json();
          setLockoutSeconds(lockedData.lockoutSeconds || 60);
          setErrorMsg(lockedData.error || 'Muitas tentativas incorretas. Bloqueado temporariamente por segurança.');
          setAttemptsLeft(0);
          return;
        }

        data = await res.json();
      }

      if (data && data.locked) {
        setLockoutSeconds(data.lockoutSeconds || 60);
        setErrorMsg(data.error || 'Muitas tentativas incorretas. Bloqueado temporariamente por segurança.');
        setAttemptsLeft(0);
        return;
      }

      if (data && data.success) {
        // PIN correto! Acesso liberado
        if (data.sessionToken) {
          setAdminSessionToken(data.sessionToken);
        }
        if (data.deviceToken) {
          localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
        }
        sessionStorage.setItem('luky_admin_unlocked', 'true');
        onLoginSuccess();
        return;
      }

      // PIN incorreto
      setErrorMsg(data?.error || 'PIN incorreto. Verifique a senha e tente novamente.');
      setPin('');
    } catch {
      // Fallback offline caso o servidor esteja inacessível
      if (pin.trim() === (expectedPin || '1234').trim()) {
        sessionStorage.setItem('luky_admin_unlocked', 'true');
        onLoginSuccess();
      } else {
        setErrorMsg('PIN incorreto. Tente novamente.');
        setPin('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#320740] via-[#481258] to-[#250330] flex flex-col items-center justify-center p-4 relative">
      {/* Top Bar with Return & Theme Toggle */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 px-2">
        <Link
          to="/"
          className="text-xs font-bold text-purple-200 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para o Cardápio</span>
        </Link>

        {onToggleTheme && (
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        )}
      </div>

      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5 border border-purple-200/60 dark:border-purple-900/40 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="relative inline-block">
            <div className="w-20 h-20 rounded-full bg-white p-1 ring-4 ring-amber-400 shadow-xl mx-auto overflow-hidden">
              <img
                src="/logo.png"
                alt="Logo Açaí do Luky"
                className="w-full h-full rounded-full object-contain"
              />
            </div>
            <span className="absolute -bottom-1 -right-1 bg-purple-900 text-amber-300 p-1.5 rounded-full border-2 border-white dark:border-slate-900 shadow-md">
              <Lock className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Painel do Luky</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Digite seu PIN de 4 dígitos para acessar o painel
            </p>
          </div>
        </div>

        {/* Notificação de Bloqueio por Tentativas Incorretas (Lockout) */}
        {lockoutSeconds > 0 && (
          <div className="p-4 bg-red-50 dark:bg-red-950/80 border-2 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 rounded-2xl flex items-start gap-3 animate-in shake">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-black text-xs text-red-950 dark:text-red-100 uppercase tracking-wider">
                Acesso Temporariamente Bloqueado
              </span>
              <p className="text-xs text-red-800 dark:text-red-300">
                Muitas tentativas incorretas. Aguarde o cronômetro para tentar novamente:
              </p>
              <div className="pt-1 flex items-center gap-1.5 font-black text-sm text-red-700 dark:text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                <span>Desbloqueio em: {lockoutSeconds} segundos</span>
              </div>
            </div>
          </div>
        )}

        {/* Notificação de Erro Normal */}
        {errorMsg && lockoutSeconds === 0 && (
          <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold rounded-xl text-center animate-in shake">
            {errorMsg}
            {attemptsLeft !== null && attemptsLeft > 0 && (
              <span className="block text-[11px] font-medium text-red-600 dark:text-red-400 mt-0.5">
                Restam {attemptsLeft} tentativa(s) antes do bloqueio de segurança.
              </span>
            )}
          </div>
        )}

        {/* FORMULÁRIO DE PIN DIRETO */}
        <form onSubmit={handlePinSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                <span>PIN de Acesso</span>
              </label>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                {pin.length > 0 ? `${pin.length} dígitos` : 'Mínimo 4 dígitos'}
              </span>
            </div>

            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                required
                autoFocus
                disabled={lockoutSeconds > 0 || isSubmitting}
                placeholder="Ex: 1234"
                value={pin}
                onChange={handlePinChange}
                className="w-full text-center text-xl tracking-widest font-black py-3 px-10 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-purple-700 dark:focus:border-purple-500 focus:outline-hidden transition-colors disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1 cursor-pointer"
                title={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || lockoutSeconds > 0 || pin.length < 4}
            className="w-full bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 hover:from-purple-900 hover:to-indigo-900 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-purple-950/20 active:scale-98 transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {lockoutSeconds > 0 ? (
              `Bloqueado (${lockoutSeconds}s)`
            ) : isSubmitting ? (
              'Validando PIN...'
            ) : (
              <>
                <span>Entrar no Painel</span>
                <span className="text-amber-400 font-bold">→</span>
              </>
            )}
          </button>
        </form>

        {/* Retornar ao Cardápio */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2 text-xs">
          <Link
            to="/"
            className="text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 font-bold flex items-center gap-1.5 transition-colors pt-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para o Cardápio do Cliente</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
