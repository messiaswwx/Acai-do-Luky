import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, KeyRound, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AdminSession } from '../utils/auth';
import { saveSession } from '../utils/auth';

interface AdminLoginProps {
  expectedPin?: string;
  expiredReason?: string | null;
  onLoginSuccess: (session: AdminSession) => void;
}

const DURATION_OPTIONS = [
  { hours: 4, label: '4 horas', hint: 'Rápido' },
  { hours: 8, label: '8 horas', hint: 'Turno padrão' },
  { hours: 12, label: '12 horas', hint: 'Dia inteiro' },
  { hours: 24, label: '24 horas', hint: '1 dia' },
];

export const AdminLogin: React.FC<AdminLoginProps> = ({
  expectedPin = '1234',
  expiredReason,
  onLoginSuccess
}) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [durationHours, setDurationHours] = useState(8);
  const [errorMsg, setErrorMsg] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer regressivo para desbloqueio por força bruta
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          setErrorMsg('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permite apenas dígitos numéricos
    const numericValue = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPin(numericValue);
    if (errorMsg && lockoutSeconds <= 0) {
      setErrorMsg('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (lockoutSeconds > 0) return;

    if (!pin.trim()) {
      setErrorMsg('Por favor, digite o PIN numérico de acesso.');
      return;
    }

    if (pin.length < 4) {
      setErrorMsg('O PIN deve conter no mínimo 4 números.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim(), durationHours })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const session: AdminSession = {
          token: data.token,
          expiresAt: data.expiresAt,
          durationHours: data.durationHours || durationHours,
          loggedInAt: data.loggedInAt || Date.now()
        };
        saveSession(session);
        onLoginSuccess(session);
        return;
      }

      if (res.status === 429) {
        setLockoutSeconds(data.lockoutSeconds || 60);
        setErrorMsg(data.error || 'Acesso temporariamente bloqueado por excesso de tentativas.');
        setAttemptsLeft(0);
      } else if (res.status === 401) {
        setErrorMsg(data.error || 'PIN incorreto. Verifique a senha e tente novamente.');
        setAttemptsLeft(data.attemptsLeft ?? null);
        setPin('');
      } else {
        setErrorMsg(data.error || 'Erro ao realizar login. Tente novamente.');
      }
    } catch {
      // Fallback offline / local de segurança caso o servidor não esteja acessível
      const correctPin = (expectedPin || '1234').trim();
      if (pin.trim() === correctPin) {
        const session: AdminSession = {
          token: `local_${Date.now()}`,
          expiresAt: Date.now() + durationHours * 3600 * 1000,
          durationHours,
          loggedInAt: Date.now()
        };
        saveSession(session);
        onLoginSuccess(session);
      } else {
        setErrorMsg('PIN incorreto. Tente novamente.');
        setPin('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#320740] via-[#481258] to-[#250330] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5 border border-purple-200/60 animate-in fade-in zoom-in-95 duration-200">
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
            <span className="absolute -bottom-1 -right-1 bg-purple-900 text-amber-300 p-1.5 rounded-full border-2 border-white shadow-md">
              <Lock className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900">Painel do Luky</h1>
            <p className="text-xs text-slate-500 mt-0.5">Acesso administrativo para gestão de pedidos e cardápio</p>
          </div>
        </div>

        {/* Notificação de Sessão Expirada */}
        {expiredReason && (
          <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold rounded-2xl flex items-start gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-amber-950">Sessão Expirada</strong>
              <span>{expiredReason}</span>
            </div>
          </div>
        )}

        {/* Notificação de Bloqueio por Força Bruta */}
        {lockoutSeconds > 0 && (
          <div className="p-3.5 bg-red-50 border-2 border-red-300 text-red-800 text-xs font-bold rounded-2xl flex items-center gap-3 animate-in shake">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <span className="block text-red-950">Acesso bloqueado por segurança!</span>
              <span className="text-[11px] font-normal text-red-700">
                Aguarde <strong>{lockoutSeconds}s</strong> para tentar novamente.
              </span>
            </div>
          </div>
        )}

        {/* Mensagem de Erro de Senha / Validação */}
        {errorMsg && lockoutSeconds === 0 && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center animate-in shake">
            {errorMsg}
            {attemptsLeft !== null && attemptsLeft > 0 && (
              <span className="block text-[11px] font-medium text-red-600 mt-0.5">
                Restam {attemptsLeft} tentativa(s) antes do bloqueio temporário.
              </span>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PIN Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-purple-700" />
                <span>PIN de Acesso</span>
              </label>
              <span className="text-[10px] text-slate-400 font-medium">
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
                className="w-full text-center text-xl tracking-widest font-black py-3 px-10 rounded-2xl border-2 border-slate-200 focus:border-purple-700 focus:outline-hidden transition-colors disabled:bg-slate-100 disabled:text-slate-400"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                title={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Duração da Sessão / Tempo de Autenticação */}
          <div className="pt-1">
            <label className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-700" />
              <span>Duração da Autenticação</span>
            </label>

            <div className="grid grid-cols-4 gap-1.5">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => setDurationHours(opt.hours)}
                  className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer border ${
                    durationHours === opt.hours
                      ? 'bg-purple-900 text-amber-300 border-purple-900 font-black shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-purple-50 hover:text-purple-900 font-medium'
                  }`}
                >
                  <div className="text-xs leading-none">{opt.label}</div>
                  <div className={`text-[9px] mt-1 ${durationHours === opt.hours ? 'text-amber-200/80' : 'text-slate-400'}`}>
                    {opt.hint}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 text-center">
              A sessão será encerrada automaticamente após {durationHours}h por segurança.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || lockoutSeconds > 0 || pin.length < 4}
            className="w-full bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 hover:from-purple-900 hover:to-indigo-900 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-purple-950/20 active:scale-98 transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {lockoutSeconds > 0
              ? `Bloqueado (${lockoutSeconds}s)`
              : isSubmitting
                ? 'Validando...'
                : 'Entrar no Painel'}
          </button>
        </form>

        {/* Tip & Return link */}
        <div className="pt-2 border-t border-slate-100 flex flex-col items-center gap-2.5 text-xs">
          <span className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
            <span>PIN padrão inicial: <strong>1234</strong></span>
          </span>

          <Link
            to="/"
            className="text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para o Cardápio do Cliente</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
