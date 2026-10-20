import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, KeyRound, Smartphone, RefreshCw, CheckCircle2, ShieldAlert, Laptop } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AdminLoginProps {
  expectedPin?: string;
  onLoginSuccess: () => void;
}

const DEVICE_TOKEN_KEY = 'luky_device_token';

export const AdminLogin: React.FC<AdminLoginProps> = ({
  expectedPin = '1234',
  onLoginSuccess
}) => {
  // Step: 'PIN' | '2FA'
  const [step, setStep] = useState<'PIN' | '2FA'>('PIN');

  // Step 1: PIN state
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isDeviceKnown, setIsDeviceKnown] = useState<boolean>(() => {
    return Boolean(localStorage.getItem(DEVICE_TOKEN_KEY));
  });

  // Step 2: 2FA state
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [phone, setPhone] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Common security & lockout state
  const [errorMsg, setErrorMsg] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer regressivo de bloqueio temporário (Lockout)
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

  // Cooldown de reenvio do código 2FA
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPin(val);
    if (errorMsg && lockoutSeconds <= 0) setErrorMsg('');
  };

  const handle2faCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTwoFactorCode(val);
    if (errorMsg && lockoutSeconds <= 0) setErrorMsg('');
  };

  // Envio da Etapa 1: PIN
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

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pin.trim(),
          deviceToken: storedDeviceToken
        })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.require2FA) {
          // Dispositivo novo / não autorizado: avança para a Etapa 2 (2FA)
          setChallengeToken(data.challengeToken);
          setPhone(data.phone || '5511999999999');
          setDemoCode(data.demoCode || '');
          setStep('2FA');
          setTwoFactorCode('');
          setErrorMsg('');
          setAttemptsLeft(null);
          setResendCooldown(30);
          return;
        }

        // Dispositivo já autorizado ou 2FA desligado: acesso liberado com sucesso!
        if (data.deviceToken) {
          localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
        }
        sessionStorage.setItem('luky_admin_unlocked', 'true');
        onLoginSuccess();
        return;
      }

      if (res.status === 429) {
        setLockoutSeconds(data.lockoutSeconds || 60);
        setErrorMsg(data.error || 'Acesso temporariamente bloqueado por tentativas incorretas.');
        setAttemptsLeft(0);
      } else if (res.status === 401) {
        setErrorMsg(data.error || 'PIN incorreto.');
        setAttemptsLeft(data.attemptsLeft ?? null);
        setPin('');
      } else {
        setErrorMsg(data.error || 'Erro ao validar PIN.');
      }
    } catch {
      // Fallback offline de emergência
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

  // Envio da Etapa 2: Código 2FA para autorizar este dispositivo
  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (lockoutSeconds > 0) return;

    if (!twoFactorCode.trim() || twoFactorCode.length < 6) {
      setErrorMsg('Digite o código de 6 dígitos completo.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken,
          code: twoFactorCode.trim(),
          deviceName: navigator.userAgent.includes('Mobile') ? 'Celular' : 'Computador/Notebook'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Dispositivo agora está autorizado permanentemente!
        if (data.deviceToken) {
          localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
          setIsDeviceKnown(true);
        }
        sessionStorage.setItem('luky_admin_unlocked', 'true');
        onLoginSuccess();
        return;
      }

      if (res.status === 429) {
        setLockoutSeconds(data.lockoutSeconds || 60);
        setErrorMsg(data.error || 'Acesso bloqueado por tentativas excedidas.');
        setAttemptsLeft(0);
      } else if (res.status === 401) {
        setErrorMsg(data.error || 'Código 2FA incorreto.');
        setAttemptsLeft(data.attemptsLeft ?? null);
        setTwoFactorCode('');
      } else {
        setErrorMsg(data.error || 'Erro ao validar código.');
      }
    } catch {
      // Fallback offline (código backup 998877 ou código demo)
      if (twoFactorCode.trim() === '998877' || (demoCode && twoFactorCode.trim() === demoCode)) {
        localStorage.setItem(DEVICE_TOKEN_KEY, `local_${Date.now()}`);
        sessionStorage.setItem('luky_admin_unlocked', 'true');
        onLoginSuccess();
      } else {
        setErrorMsg('Código incorreto.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reenviar código 2FA
  const handleResendCode = async () => {
    if (resendCooldown > 0 || lockoutSeconds > 0) return;
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/resend-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.demoCode) setDemoCode(data.demoCode);
        setResendCooldown(30);
      } else {
        setErrorMsg(data.error || 'Não foi possível reenviar agora.');
      }
    } catch {
      setErrorMsg('Erro de conexão ao reenviar código.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Formata telefone para exibição (ex: +55 (11) 9****-9999)
  const formatMaskedPhone = (num: string) => {
    const clean = num.replace(/\D/g, '');
    if (clean.length >= 10) {
      const ddd = clean.slice(-11, -9) || clean.slice(0, 2);
      const last4 = clean.slice(-4);
      return `(${ddd}) 9****-${last4}`;
    }
    return 'WhatsApp cadastrado';
  };

  const whatsappShareUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(
    `🔐 [Açaí do Luky] Código para autorizar este dispositivo no painel: ${demoCode}`
  )}`;

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
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 'PIN'
                ? 'Digite seu PIN para desbloquear o painel'
                : 'Autorização de Novo Dispositivo (2FA)'}
            </p>
          </div>

          {/* Badge de Dispositivo Autorizado */}
          {step === 'PIN' && isDeviceKnown && (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold px-3 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Aparelho Autorizado (2FA dispensado)</span>
            </div>
          )}
        </div>

        {/* Notificação de Bloqueio por Tentativas Incorretas (Lockout) */}
        {lockoutSeconds > 0 && (
          <div className="p-4 bg-red-50 border-2 border-red-300 text-red-900 rounded-2xl flex items-start gap-3 animate-in shake">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-black text-xs text-red-950 uppercase tracking-wider">
                Acesso Temporariamente Bloqueado
              </span>
              <p className="text-xs text-red-800">
                Tentativas incorretas consecutivas detectadas. Aguarde o cronômetro para tentar novamente:
              </p>
              <div className="pt-1 flex items-center gap-1.5 font-black text-sm text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                <span>Desbloqueio em: {lockoutSeconds} segundos</span>
              </div>
            </div>
          </div>
        )}

        {/* Notificação de Erro Normal */}
        {errorMsg && lockoutSeconds === 0 && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center animate-in shake">
            {errorMsg}
            {attemptsLeft !== null && attemptsLeft > 0 && (
              <span className="block text-[11px] font-medium text-red-600 mt-0.5">
                Restam {attemptsLeft} tentativa(s) antes do bloqueio de segurança.
              </span>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* ETAPA 1: DIGITAÇÃO DO PIN DE ACESSO                      */}
        {/* ========================================================= */}
        {step === 'PIN' ? (
          <form onSubmit={handlePinSubmit} className="space-y-4">
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
        ) : (
          /* ========================================================= */
          /* ETAPA 2: VERIFICAÇÃO 2FA PARA AUTORIZAR ESTE DISPOSITIVO  */
          /* ========================================================= */
          <form onSubmit={handle2faSubmit} className="space-y-4">
            <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3.5 space-y-2 text-center">
              <div className="w-10 h-10 rounded-full bg-purple-900 text-amber-300 flex items-center justify-center mx-auto shadow-md">
                <Laptop className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-black text-purple-950">Novo Dispositivo Detectado</h2>
              <p className="text-xs text-purple-800 leading-relaxed">
                Para sua segurança, autorize este aparelho com o código enviado para o WhatsApp <strong>{formatMaskedPhone(phone)}</strong>.
              </p>
              <span className="inline-block text-[10px] text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-full font-medium">
                ✨ Só precisa autorizar uma vez neste aparelho!
              </span>

              {/* Botão de Envio Direto via WhatsApp */}
              <div className="pt-1 flex flex-col gap-2">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Enviar Código para meu WhatsApp</span>
                </a>

                {/* Dica para teste/desenvolvimento ou chave mestra */}
                {demoCode && (
                  <button
                    type="button"
                    onClick={() => setTwoFactorCode(demoCode)}
                    className="text-[11px] text-purple-700 bg-white border border-purple-200 hover:bg-purple-100/60 font-semibold py-1.5 px-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    title="Clique para preencher automaticamente"
                  >
                    <span>Código 2FA gerado:</span>
                    <strong className="tracking-widest font-mono text-purple-950 bg-amber-100 px-1.5 py-0.5 rounded text-xs">{demoCode}</strong>
                    <span className="text-[10px] text-slate-400 font-normal">(Clique p/ preencher)</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-center">
                Digite o Código de 6 Dígitos ou a Chave Mestra
              </label>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                disabled={lockoutSeconds > 0 || isSubmitting}
                placeholder="000000"
                value={twoFactorCode}
                onChange={handle2faCodeChange}
                className="w-full text-center text-2xl tracking-[0.35em] font-black py-3 px-4 rounded-2xl border-2 border-purple-200 focus:border-purple-700 focus:outline-hidden transition-colors disabled:bg-slate-100 disabled:text-slate-400 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || lockoutSeconds > 0 || twoFactorCode.length < 6}
              className="w-full bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 hover:from-purple-900 hover:to-indigo-900 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-purple-950/20 active:scale-98 transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {lockoutSeconds > 0 ? (
                `Bloqueado (${lockoutSeconds}s)`
              ) : isSubmitting ? (
                'Autorizando Aparelho...'
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Autorizar Aparelho e Entrar</span>
                </>
              )}
            </button>

            {/* Ações Secundárias */}
            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('PIN');
                  setTwoFactorCode('');
                  setErrorMsg('');
                }}
                className="text-slate-500 hover:text-purple-800 font-bold transition-colors cursor-pointer"
              >
                ← Voltar ao PIN
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || lockoutSeconds > 0 || isSubmitting}
                className="text-purple-700 hover:text-purple-900 font-bold disabled:text-slate-400 transition-colors cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>
                  {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar Código'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Tip & Return link */}
        <div className="pt-2 border-t border-slate-100 flex flex-col items-center gap-2 text-xs">
          <span className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
            <span>Chave Mestra de Backup: <strong>998877</strong></span>
          </span>

          <Link
            to="/"
            className="text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1.5 transition-colors pt-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para o Cardápio do Cliente</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
