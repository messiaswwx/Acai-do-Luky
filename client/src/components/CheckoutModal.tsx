import React, { useState, useMemo } from 'react';
import type { CartItem, StoreSettings, PaymentMethod, Order } from '../types';
import { formatCurrency } from '../utils/format';
import { X, Bike, Store, QrCode, CreditCard, Banknote, Copy, Check, ArrowLeft, Send } from 'lucide-react';
import { isSupabaseConfigured } from '../utils/supabase';
import { createOrder } from '../services/supabaseService';
import { sanitizeText, sanitizePhone } from '../utils/sanitize';

interface CheckoutModalProps {
  items: CartItem[];
  settings: StoreSettings;
  onClose: () => void;
  onBackToCart: () => void;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  items,
  settings,
  onClose,
  onBackToCart,
  onOrderSuccess
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<'ENTREGA' | 'RETIRADA'>('ENTREGA');

  // Address
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [complement, setComplement] = useState('');
  const [reference, setReference] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [cardType, setCardType] = useState<'DEBITO' | 'CREDITO'>('DEBITO');
  const [needChange, setNeedChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [copiedPix, setCopiedPix] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const subtotal = useMemo(
    () => items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    [items]
  );
  const deliveryFee = orderType === 'ENTREGA' ? settings.deliveryFee : 0;
  const total = subtotal + deliveryFee;

  const copyPixKey = () => {
    navigator.clipboard.writeText(settings.pixKey);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!customerName.trim()) {
      setErrorMsg('Por favor, informe seu nome completo.');
      return;
    }

    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Por favor, informe um WhatsApp válido com DDD (ex: 11999999999).');
      return;
    }

    if (orderType === 'ENTREGA') {
      if (!street.trim() || !number.trim() || !neighborhood.trim()) {
        setErrorMsg('Por favor, preencha rua, número e bairro para a entrega.');
        return;
      }
    }

    if (paymentMethod === 'DINHEIRO' && needChange) {
      const changeNum = parseFloat(changeFor.replace(',', '.'));
      if (isNaN(changeNum) || changeNum <= total) {
        setErrorMsg(`O valor para troco deve ser maior que o total do pedido (${formatCurrency(total)}).`);
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
          neighborhood: sanitizeText(neighborhood),
          complement: sanitizeText(complement),
          reference: sanitizeText(reference)
        } : undefined,
        items,
        paymentMethod,
        paymentDetails: {
          needChange: paymentMethod === 'DINHEIRO' ? needChange : undefined,
          changeFor: paymentMethod === 'DINHEIRO' && needChange ? parseFloat(changeFor.replace(',', '.')) : undefined,
          cardType: paymentMethod === 'CARTAO_ENTREGA' ? cardType : undefined
        },
        subtotal,
        deliveryFee,
        total
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
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-6">
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
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOrderType('ENTREGA')}
                className={`p-3.5 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  orderType === 'ENTREGA'
                    ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-purple-200 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <Bike className="w-5 h-5 text-purple-700 dark:text-purple-400" />
                <span>Receber em Casa</span>
                <span className="text-[11px] font-black text-amber-600 dark:text-amber-400">
                  Taxa: {formatCurrency(settings.deliveryFee)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('RETIRADA')}
                className={`p-3.5 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  orderType === 'RETIRADA'
                    ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-purple-200 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <Store className="w-5 h-5 text-purple-700 dark:text-purple-400" />
                <span>Retirar no Balcão</span>
                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">Sem taxa</span>
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
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Bairro *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Centro"
                      value={neighborhood}
                      onChange={e => setNeighborhood(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
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

          {/* 3. Forma de Pagamento */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-900 text-amber-300 text-xs font-black flex items-center justify-center">3</span>
              <h3 className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                Forma de Pagamento
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('PIX')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'PIX'
                    ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <QrCode className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-black">Pix</span>
                <span className="text-[10px] text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded font-black border border-emerald-200 dark:border-emerald-800">
                  Instantâneo
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARTAO_ENTREGA')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'CARTAO_ENTREGA'
                    ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <CreditCard className="w-5 h-5 text-purple-700 dark:text-purple-400" />
                <span className="font-black">Cartão</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Na entrega</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('DINHEIRO')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'DINHEIRO'
                    ? 'border-amber-500 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <Banknote className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <span className="font-black">Dinheiro</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Com troco</span>
              </button>
            </div>

            {/* Pix Details */}
            {paymentMethod === 'PIX' && (
              <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">Chave Pix da Loja ({settings.pixKeyType}):</span>
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
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-black transition-colors cursor-pointer shadow-xs"
                  >
                    {copiedPix ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                  💡 Chave pronta para copiar e colar no seu banco!
                </p>
              </div>
            )}

            {/* Cartão Details */}
            {paymentMethod === 'CARTAO_ENTREGA' && (
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3.5 rounded-2xl flex items-center justify-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="cardType"
                    checked={cardType === 'DEBITO'}
                    onChange={() => setCardType('DEBITO')}
                    className="text-purple-700"
                  />
                  <span>Débito</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="cardType"
                    checked={cardType === 'CREDITO'}
                    onChange={() => setCardType('CREDITO')}
                    className="text-purple-700"
                  />
                  <span>Crédito</span>
                </label>
              </div>
            )}

            {/* Dinheiro Details */}
            {paymentMethod === 'DINHEIRO' && (
              <div className="bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900 dark:text-amber-200">
                  <input
                    type="checkbox"
                    checked={needChange}
                    onChange={e => setNeedChange(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  <span>Precisa de troco?</span>
                </label>

                {needChange && (
                  <div>
                    <label className="block text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                      Troco para quanto em dinheiro?
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder={`Ex: ${(total + 10).toFixed(2)}`}
                      value={changeFor}
                      onChange={e => setChangeFor(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                )}
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
              <span>Taxa de entrega:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {orderType === 'ENTREGA' ? formatCurrency(deliveryFee) : 'Grátis'}
              </span>
            </div>
            <div className="flex justify-between text-base font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total do Pedido:</span>
              <span className="text-purple-950 dark:text-amber-400 font-black text-xl">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-purple-950 font-black py-4 px-6 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50"
          >
            <Send className="w-5 h-5 stroke-[2.5]" />
            <span>{isSubmitting ? 'Enviando Pedido...' : `Confirmar Pedido (${formatCurrency(total)})`}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
