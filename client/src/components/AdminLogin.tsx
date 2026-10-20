import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AdminLoginProps {
  expectedPin: string;
  onLoginSuccess: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ expectedPin, onLoginSuccess }) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!pin.trim()) {
      setErrorMsg('Por favor, digite o PIN de acesso.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const correctPin = expectedPin || '1234';
      if (pin.trim() === correctPin) {
        localStorage.setItem('luky_admin_auth', 'true');
        onLoginSuccess();
      } else {
        setErrorMsg('PIN incorreto. Verifique a senha e tente novamente.');
        setPin('');
      }
      setIsSubmitting(false);
    }, 250);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#320740] via-[#481258] to-[#250330] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 border border-purple-200/60 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-3">
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
            <p className="text-xs text-slate-500 mt-1">Acesso exclusivo para gestão de cozinha e pedidos</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center animate-in shake duration-200">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-purple-700" />
              <span>Digite seu PIN de Acesso</span>
            </label>

            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                maxLength={20}
                required
                autoFocus
                placeholder="Ex: 1234"
                value={pin}
                onChange={e => setPin(e.target.value)}
                className="w-full text-center text-lg tracking-widest font-black py-3 px-10 rounded-2xl border-2 border-slate-200 focus:border-purple-700 focus:outline-hidden transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                title={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 hover:from-purple-900 hover:to-indigo-900 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-purple-950/20 active:scale-98 transition-all text-sm cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Verificando...' : 'Entrar no Painel'}
          </button>
        </form>

        {/* Tip & Return link */}
        <div className="pt-2 border-t border-slate-100 flex flex-col items-center gap-3 text-xs">
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
