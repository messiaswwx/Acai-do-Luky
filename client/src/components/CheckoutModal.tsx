import React, { useState } from 'react';
import type { CartItem, StoreSettings, PaymentMethod, Order } from '../types';
import { formatCurrency } from '../utils/format';
import { X, Bike, Store, QrCode, CreditCard, Banknote, Copy, Check, ArrowLeft, Send } from 'lucide-react';

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

  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
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
      setErrorMsg('Por favor, informe seu nome.');
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
        setErrorMsg(`O valor para troco deve ser maior que o total (${formatCurrency(total)}).`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const orderPayload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        orderType,
        address: orderType === 'ENTREGA' ? {
          street: street.trim(),
          number: number.trim(),
          neighborhood: neighborhood.trim(),
          complement: complement.trim(),
          reference: reference.trim()
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

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      if (!res.ok) {
        throw new Error('Falha ao registrar pedido.');
      }

      const createdOrder: Order = await res.json();
      onOrderSuccess(createdOrder);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Erro ao conectar ao servidor. Verifique sua conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-purple-950 text-white">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToCart}
              className="p-1.5 hover:bg-white/10 rounded-full text-purple-200 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-lg">Finalizar Pedido</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full text-purple-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl font-medium">
              {errorMsg}
            </div>
          )}

          {/* 1. Dados do Cliente */}
          <div className="space-y-3">
            <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider text-purple-950">
              1. Seus Dados de Contato
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Seu Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria Silva"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp com DDD *</label>
                <input
                  type="tel"
                  required
                  placeholder="(11) 99999-9999"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                />
              </div>
            </div>
          </div>

          {/* 2. Forma de Recebimento */}
          <div className="space-y-3">
            <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider text-purple-950">
              2. Como deseja receber?
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOrderType('ENTREGA')}
                className={`p-3.5 rounded-2xl border-2 font-bold text-sm flex flex-col items-center gap-1.5 transition-all ${
                  orderType === 'ENTREGA'
                    ? 'border-purple-600 bg-purple-50 text-purple-950 shadow-xs'
                    : 'border-slate-200 hover:border-purple-200 text-slate-600'
                }`}
              >
                <Bike className="w-5 h-5 text-purple-700" />
                <span>Receber em Casa</span>
                <span className="text-[11px] font-semibold text-purple-600">
                  Taxa: {formatCurrency(settings.deliveryFee)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('RETIRADA')}
                className={`p-3.5 rounded-2xl border-2 font-bold text-sm flex flex-col items-center gap-1.5 transition-all ${
                  orderType === 'RETIRADA'
                    ? 'border-purple-600 bg-purple-50 text-purple-950 shadow-xs'
                    : 'border-slate-200 hover:border-purple-200 text-slate-600'
                }`}
              >
                <Store className="w-5 h-5 text-purple-700" />
                <span>Retirar no Local</span>
                <span className="text-[11px] font-semibold text-emerald-600">Sem taxa</span>
              </button>
            </div>

            {/* Endereço de Entrega */}
            {orderType === 'ENTREGA' ? (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 mt-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Rua / Avenida *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nome da sua rua"
                      value={street}
                      onChange={e => setStreet(e.target.value)}
                      className="w-full text-sm p-2.5 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Número *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 123"
                      value={number}
                      onChange={e => setNumber(e.target.value)}
                      className="w-full text-sm p-2.5 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Bairro *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Centro"
                      value={neighborhood}
                      onChange={e => setNeighborhood(e.target.value)}
                      className="w-full text-sm p-2.5 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Complemento / Apto</label>
                    <input
                      type="text"
                      placeholder="Ex: Apto 12 Bloco B"
                      value={complement}
                      onChange={e => setComplement(e.target.value)}
                      className="w-full text-sm p-2.5 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ponto de Referência</label>
                  <input
                    type="text"
                    placeholder="Ex: Próximo à padaria central"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="w-full text-sm p-2.5 rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 text-xs text-purple-900 flex items-start gap-2.5">
                <Store className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-purple-950">Endereço para retirada:</span>
                  <p className="mt-0.5">{settings.address}</p>
                  <p className="mt-1 font-semibold text-purple-700">Tempo estimado de preparo: {settings.estimatedTime}</p>
                </div>
              </div>
            )}
          </div>

          {/* 3. Forma de Pagamento */}
          <div className="space-y-3">
            <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider text-purple-950">
              3. Forma de Pagamento
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('PIX')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'PIX'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <QrCode className="w-5 h-5 text-emerald-600" />
                <span>Pix</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-black">
                  Instantâneo
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARTAO_ENTREGA')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'CARTAO_ENTREGA'
                    ? 'border-purple-600 bg-purple-50 text-purple-950 shadow-xs'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <CreditCard className="w-5 h-5 text-purple-600" />
                <span>Cartão</span>
                <span className="text-[10px] text-slate-500">Na entrega</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('DINHEIRO')}
                className={`p-3 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'DINHEIRO'
                    ? 'border-amber-600 bg-amber-50 text-amber-950 shadow-xs'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Banknote className="w-5 h-5 text-amber-600" />
                <span>Dinheiro</span>
                <span className="text-[10px] text-slate-500">Com troco</span>
              </button>
            </div>

            {/* Pix Details */}
            {paymentMethod === 'PIX' && (
              <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">Chave Pix da Loja ({settings.pixKeyType}):</span>
                  <span className="text-xs font-bold text-emerald-700">{formatCurrency(total)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={settings.pixKey}
                    className="flex-1 bg-white border border-emerald-300 text-emerald-900 font-mono text-xs p-2.5 rounded-xl font-bold"
                  />
                  <button
                    type="button"
                    onClick={copyPixKey}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {copiedPix ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-emerald-700">
                  💡 Você pode realizar o Pix agora ou após confirmar o pedido. O comprovante pode ser enviado no WhatsApp da loja!
                </p>
              </div>
            )}

            {/* Cartão Details */}
            {paymentMethod === 'CARTAO_ENTREGA' && (
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-700">
                  <input
                    type="radio"
                    name="cardType"
                    checked={cardType === 'DEBITO'}
                    onChange={() => setCardType('DEBITO')}
                    className="text-purple-600"
                  />
                  <span>Débito</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-700">
                  <input
                    type="radio"
                    name="cardType"
                    checked={cardType === 'CREDITO'}
                    onChange={() => setCardType('CREDITO')}
                    className="text-purple-600"
                  />
                  <span>Crédito</span>
                </label>
              </div>
            )}

            {/* Dinheiro Details */}
            {paymentMethod === 'DINHEIRO' && (
              <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900">
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
                    <label className="block text-xs font-medium text-amber-800 mb-1">
                      Troco para quanto em dinheiro?
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder={`Ex: ${(total + 10).toFixed(2)}`}
                      value={changeFor}
                      onChange={e => setChangeFor(e.target.value)}
                      className="w-full text-sm p-2.5 rounded-xl border border-amber-300 bg-white"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resumo de Valores */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal dos itens:</span>
              <span className="font-bold text-slate-800">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxa de entrega:</span>
              <span className="font-bold text-slate-800">
                {orderType === 'ENTREGA' ? formatCurrency(deliveryFee) : 'Grátis'}
              </span>
            </div>
            <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
              <span>Total a Pagar:</span>
              <span className="text-purple-900">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-emerald-900/20 active:scale-98 transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50"
          >
            <Send className="w-5 h-5 stroke-[2.5]" />
            <span>{isSubmitting ? 'Enviando Pedido...' : `Confirmar Pedido (${formatCurrency(total)})`}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
