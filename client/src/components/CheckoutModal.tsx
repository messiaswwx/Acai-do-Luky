import React, { useState, useMemo } from 'react';
import type { CartItem, StoreSettings, PaymentMethod, Order, CustomerProfile } from '../types';
import { formatCurrency } from '../utils/format';
import { X, Bike, Store, QrCode, CreditCard, ShieldCheck, Copy, Check, ArrowLeft, Send, Utensils } from 'lucide-react';
import { isSupabaseConfigured } from '../utils/supabase';
import { createOrder } from '../services/supabaseService';
import { sanitizeText, sanitizePhone } from '../utils/sanitize';
import { PRAIA_GRANDE_NEIGHBORHOODS, getDeliveryFeeByNeighborhood } from '../utils/delivery';

interface CheckoutModalProps {
  items: CartItem[];
  settings: StoreSettings;
  onClose: () => void;
  onBackToCart: () => void;
  onOrderSuccess: (order: Order) => void;
  customer?: CustomerProfile | null;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  items,
  settings,
  onClose,
  onBackToCart,
  onOrderSuccess,
  customer
}) => {
  const [customerName, setCustomerName] = useState(() => customer?.name || '');
  const [customerPhone, setCustomerPhone] = useState(() => customer?.phone || '');
  const [orderType, setOrderType] = useState<'ENTREGA' | 'RETIRADA'>('ENTREGA');

  // Address
  const [street, setStreet] = useState(() => customer?.address?.street || '');
  const [number, setNumber] = useState(() => customer?.address?.number || '');
  const [selectedNeighborhoodOption, setSelectedNeighborhoodOption] = useState(() => {
    const initial = customer?.address?.neighborhood || '';
    if (!initial) return '';
    const match = PRAIA_GRANDE_NEIGHBORHOODS.find(n => n.name.toLowerCase() === initial.trim().toLowerCase());
    return match ? match.name : 'Outros';
  });
  const [customNeighborhood, setCustomNeighborhood] = useState(() => {
    const initial = customer?.address?.neighborhood || '';
    if (!initial) return '';
    const match = PRAIA_GRANDE_NEIGHBORHOODS.find(n => n.name.toLowerCase() === initial.trim().toLowerCase());
    return match ? '' : initial;
  });
  const [complement, setComplement] = useState(() => customer?.address?.complement || '');
  const [reference, setReference] = useState(() => customer?.address?.reference || '');

  const effectiveNeighborhood = useMemo(() => {
    if (selectedNeighborhoodOption === 'Outros') {
      return customNeighborhood.trim();
    }
    return selectedNeighborhoodOption;
  }, [selectedNeighborhoodOption, customNeighborhood]);

  // Cutlery / Spoons: Com colher ou Sem colher
  const [needCutlery, setNeedCutlery] = useState(() => {
    if (items.length > 0 && items.every(i => i.needSpoon === false)) {
      return false;
    }
    return true;
  });

  // Payment: 100% Online (Mercado Pago: Pix e Cartões)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [cardType, setCardType] = useState<'DEBITO' | 'CREDITO'>('CREDITO');
  const [copiedPix, setCopiedPix] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const subtotal = useMemo(
    () => items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    [items]
  );
  const deliveryFee = useMemo(() => {
    if (orderType !== 'ENTREGA') return 0;
    if (!selectedNeighborhoodOption) return 0;
    if (selectedNeighborhoodOption === 'Outros') return 10.00;
    return getDeliveryFeeByNeighborhood(selectedNeighborhoodOption, 10.00);
  }, [orderType, selectedNeighborhoodOption]);
  const total = subtotal + deliveryFee;

  const copyPixKey = () => {
    navigator.clipboard.writeText(settings.pixKey);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!settings.isOpen) {
      setErrorMsg('A loja está temporariamente fechada e não pode receber novos pedidos agora. Por favor, volte quando a loja reabrir!');
      return;
    }

    if (!customerName.trim()) {
      setErrorMsg('Por favor, informe seu nome completo.');
      return;
    }

    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Por favor, informe um WhatsApp válido com DDD (ex: 11999999999).');
      return;
    }

    if (orderType === 'ENTREGA') {
      if (!street.trim() || !number.trim() || !selectedNeighborhoodOption || (selectedNeighborhoodOption === 'Outros' && !customNeighborhood.trim())) {
        setErrorMsg('Por favor, preencha rua, número e o nome do seu bairro para a entrega.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const orderPayload = {
        customerName: sanitizeText(customerName),
        customerPhone: sanitizePhone(customerPhone),
        orderType,
        address: orderType === 'ENTREGA' ? {
          street: sanitizeText(street),
          number: sanitizeText(number),
          neighborhood: sanitizeText(effectiveNeighborhood || 'Outros'),
          complement: sanitizeText(complement),
          reference: sanitizeText(reference)
        } : undefined,
        items,
        paymentMethod: paymentMethod === 'CARTAO_ONLINE' ? ('CARTAO_ONLINE' as PaymentMethod) : ('PIX' as PaymentMethod),
        paymentDetails: {
          cardType: paymentMethod === 'CARTAO_ONLINE' ? cardType : undefined,
          gateway: 'MERCADO_PAGO'
        },
        subtotal,
        deliveryFee,
        total,
        needCutlery,
        notes: needCutlery ? '[COM COLHER]' : '[SEM COLHER]'
      };

      let createdOrder: Order | null = null;

      // 1. Tenta salvar no Supabase (Nuvem em Tempo Real)
      if (isSupabaseConfigured) {
        createdOrder = await createOrder(orderPayload);
      }

      // 2. Se o Supabase não estiver configurado ou falhar, salva no backend local
      if (!createdOrder) {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });

        if (!res.ok) {
          throw new Error('Falha ao registrar pedido.');
        }

        createdOrder = await res.json();
      }

      if (createdOrder) {
        onOrderSuccess(createdOrder);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Erro ao conectar ao servidor. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-purple-200/50 dark:border-purple-900/40 text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-purple-800/40 flex items-center justify-between bg-gradient-to-r from-[#471256] via-[#5c1c73] to-[#360942] text-white">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToCart}
              className="p-1.5 hover:bg-white/10 rounded-full text-purple-200 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-8 h-8 rounded-full border border-amber-400 bg-white object-cover"
              />
              <div>
                <h2 className="font-black text-base">Finalizar Pedido</h2>
                <p className="text-[10px] text-amber-300 font-semibold">{settings.storeName}</p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full text-purple-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form id="checkout-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl font-bold">
              {errorMsg}
            </div>
          )}

          {/* 1. Dados do Cliente */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-900 text-amber-300 text-xs font-black flex items-center justify-center">1</span>
              <h3 className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                Dados de Contato
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Seu Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">WhatsApp com DDD *</label>
                <input
                  type="tel"
                  required
                  placeholder="(11) 99999-9999"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 font-medium"
                />
              </div>
            </div>
          </div>

          {/* 2. Forma de Recebimento */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-900 text-amber-300 text-xs font-black flex items-center justify-center">2</span>
              <h3 className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                Como Deseja Receber?
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setOrderType('ENTREGA')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center justify-center text-center gap-1 transition-all cursor-pointer h-[76px] ${
                  orderType === 'ENTREGA'
                    ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-purple-200 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <Bike className="w-5 h-5 text-purple-700 dark:text-purple-400 shrink-0" />
                <span className="leading-tight">Receber em Casa</span>
                <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 leading-tight">
                  {selectedNeighborhoodOption ? `Taxa: ${formatCurrency(deliveryFee)}` : 'Entrega rápida'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('RETIRADA')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center justify-center text-center gap-1 transition-all cursor-pointer h-[76px] ${
                  orderType === 'RETIRADA'
                    ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-purple-200 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <Store className="w-5 h-5 text-purple-700 dark:text-purple-400 shrink-0" />
                <span className="leading-tight">Retirar no Balcão</span>
                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                  Sem taxa
                </span>
              </button>
            </div>

            {/* Endereço de Entrega */}
            {orderType === 'ENTREGA' ? (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 mt-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Rua / Avenida *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nome da sua rua"
                      value={street}
                      onChange={e => setStreet(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Número *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 123"
                      value={number}
                      onChange={e => setNumber(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Bairro *
                      </label>
                      {selectedNeighborhoodOption && (
                        <span className="text-[11px] font-black font-mono text-emerald-600 dark:text-emerald-400">
                          Taxa: {formatCurrency(deliveryFee)}
                        </span>
                      )}
                    </div>
                    <select
                      required
                      value={selectedNeighborhoodOption}
                      onChange={e => setSelectedNeighborhoodOption(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
                    >
                      <option value="">Selecione seu bairro...</option>
                      {PRAIA_GRANDE_NEIGHBORHOODS.map(n => (
                        <option key={n.name} value={n.name}>
                          {n.name}
                        </option>
                      ))}
                      <option value="Outros">Outros</option>
                    </select>

                    {selectedNeighborhoodOption === 'Outros' && (
                      <input
                        type="text"
                        required
                        placeholder="Digite o nome do seu bairro..."
                        value={customNeighborhood}
                        onChange={e => setCustomNeighborhood(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-slate-800 text-slate-900 dark:text-white mt-2 font-medium focus:ring-2 focus:ring-purple-600 focus:outline-hidden animate-in fade-in duration-150"
                        autoFocus
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Complemento</label>
                    <input
                      type="text"
                      placeholder="Ex: Apto 12 Bloco B"
                      value={complement}
                      onChange={e => setComplement(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ponto de Referência</label>
                  <input
                    type="text"
                    placeholder="Ex: Próximo à padaria ou mercado"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-purple-50 dark:bg-purple-950/80 p-3.5 rounded-2xl border border-purple-200 dark:border-purple-900/60 text-xs text-purple-900 dark:text-purple-200 flex items-start gap-2.5">
                <Store className="w-5 h-5 text-purple-700 dark:text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block text-purple-950 dark:text-white">Endereço de Retirada:</span>
                  <p className="mt-0.5 font-medium">{settings.address}</p>
                  <p className="mt-1 font-bold text-amber-700 dark:text-amber-400">Preparo estimado: {settings.estimatedTime}</p>
                </div>
              </div>
            )}
          </div>

          {/* 3. Colher Descartável */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-900 text-amber-300 text-xs font-black flex items-center justify-center">3</span>
                <h3 className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                  <span>Precisa de Colher Descartável?</span>
                </h3>
              </div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                Grátis
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setNeedCutlery(true)}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  needCutlery
                    ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 shadow-xs ring-1 ring-purple-600/30'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800/60 hover:border-slate-300'
                }`}
              >
                <span>🥄 Com colher</span>
                {needCutlery && <Check className="w-4 h-4 text-purple-700 dark:text-purple-400 stroke-[3]" />}
              </button>

              <button
                type="button"
                onClick={() => setNeedCutlery(false)}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !needCutlery
                    ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-200 shadow-xs ring-1 ring-emerald-600/30'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800/60 hover:border-slate-300'
                }`}
              >
                <span>🍃 Sem colher</span>
                {!needCutlery && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[3]" />}
              </button>
            </div>
          </div>

          {/* 4. Forma de Pagamento (100% Online - Mercado Pago) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-900 text-amber-300 text-xs font-black flex items-center justify-center">4</span>
                <h3 className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Pagamento Online
                </h3>
              </div>
              <span className="text-[10px] font-black text-purple-900 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-900/50 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                Mercado Pago Seguro
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Opção 1: Pix Online */}
              <button
                type="button"
                onClick={() => setPaymentMethod('PIX')}
                className={`p-3.5 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'PIX'
                    ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-200 shadow-sm ring-1 ring-emerald-500/30'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                  <QrCode className="w-5 h-5" />
                </div>
                <span className="font-black text-sm">Pix Online</span>
                <span className="text-[10px] text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full font-black border border-emerald-200 dark:border-emerald-800">
                  ⚡ Aprovação Imediata
                </span>
              </button>

              {/* Opção 2: Cartão Online */}
              <button
                type="button"
                onClick={() => setPaymentMethod('CARTAO_ONLINE')}
                className={`p-3.5 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'CARTAO_ONLINE' || paymentMethod === 'CARTAO_ENTREGA'
                    ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 shadow-sm ring-1 ring-purple-600/30'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <span className="font-black text-sm">Cartão Online</span>
                <span className="text-[10px] text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded-full font-black border border-purple-200 dark:border-purple-800">
                  Crédito / Débito
                </span>
              </button>
            </div>

            {/* Pix Details */}
            {paymentMethod === 'PIX' && (
              <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-4 rounded-2xl space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">Chave Pix Instantânea ({settings.pixKeyType}):</span>
                  <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">{formatCurrency(total)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={settings.pixKey}
                    className="flex-1 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200 font-mono text-xs p-2.5 rounded-xl font-bold"
                  />
                  <button
                    type="button"
                    onClick={copyPixKey}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-black transition-colors cursor-pointer shadow-xs shrink-0"
                  >
                    {copiedPix ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                  ⚡ <strong>Mercado Pago:</strong> Seu pedido entra em preparo imediatamente após o pagamento online!
                </p>
              </div>
            )}

            {/* Cartão Details */}
            {(paymentMethod === 'CARTAO_ONLINE' || paymentMethod === 'CARTAO_ENTREGA') && (
              <div className="bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-4 rounded-2xl space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-950 dark:text-purple-200">Modalidade do Cartão:</span>
                  <span className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold">Mercado Pago</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCardType('CREDITO')}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      cardType === 'CREDITO'
                        ? 'border-purple-700 bg-white dark:bg-slate-800 text-purple-950 dark:text-amber-300 shadow-xs ring-1 ring-purple-600'
                        : 'border-purple-200/60 dark:border-purple-900 bg-purple-100/50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                    }`}
                  >
                    <span>Cartão de Crédito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardType('DEBITO')}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      cardType === 'DEBITO'
                        ? 'border-purple-700 bg-white dark:bg-slate-800 text-purple-950 dark:text-amber-300 shadow-xs ring-1 ring-purple-600'
                        : 'border-purple-200/60 dark:border-purple-900 bg-purple-100/50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                    }`}
                  >
                    <span>Cartão de Débito</span>
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-purple-800 dark:text-purple-300 pt-1 border-t border-purple-200/60 dark:border-purple-900/60">
                  <span>Bandeiras aceitas:</span>
                  <span className="font-bold">Visa • Master • Elo • Hiper</span>
                </div>
                <p className="text-[11px] text-purple-700 dark:text-purple-400 font-medium leading-relaxed">
                  🔒 Pagamento 100% online preparado via Mercado Pago. Sem necessidade de máquina na entrega!
                </p>
              </div>
            )}
          </div>

          {/* Resumo de Valores */}
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex justify-between">
              <span>Subtotal dos itens:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxa de entrega{orderType === 'ENTREGA' && (effectiveNeighborhood || selectedNeighborhoodOption) ? ` (${effectiveNeighborhood || selectedNeighborhoodOption})` : ''}:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {orderType === 'ENTREGA' ? (selectedNeighborhoodOption ? formatCurrency(deliveryFee) : 'Selecione o bairro') : 'Grátis'}
              </span>
            </div>
            <div className="flex justify-between text-base font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total do Pedido:</span>
              <span className="text-purple-950 dark:text-amber-400 font-black text-xl">{formatCurrency(total)}</span>
            </div>
          </div>
        </form>

        {/* Fixed Footer Bar com o Botão Perfeitamente Enquadrado */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="submit"
            form="checkout-form"
            disabled={isSubmitting || !settings.isOpen}
            className={`w-full font-black py-3.5 px-6 rounded-2xl shadow-xl active:scale-98 transition-all flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
              !settings.isOpen
                ? 'bg-slate-500 text-white shadow-none'
                : 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-purple-950 shadow-amber-500/20'
            }`}
          >
            <Send className="w-5 h-5 stroke-[2.5]" />
            <span>
              {!settings.isOpen
                ? 'Loja Fechada no Momento'
                : isSubmitting
                ? 'Enviando Pedido...'
                : `Confirmar Pedido (${formatCurrency(total)})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
