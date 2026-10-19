import React, { useEffect, useState } from 'react';
import type { Order, StoreSettings } from '../types';
import { formatCurrency, formatDateTime, generateWhatsAppMessage } from '../utils/format';
import { CheckCircle2, Clock, Bike, MessageCircle, Store, ChefHat, Copy, Check } from 'lucide-react';
import { io } from 'socket.io-client';

interface OrderTrackingModalProps {
  order: Order;
  settings: StoreSettings;
  onClose: () => void;
  onNewOrder: () => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  order: initialOrder,
  settings,
  onClose,
  onNewOrder
}) => {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    // Listen to real time updates for this order
    const socket = io();
    socket.emit('track_order', order.id);

    socket.on('my_order_update', (updated: Order) => {
      if (updated.id === order.id) {
        setOrder(updated);
      }
    });

    socket.on('order_status_updated', (updated: Order) => {
      if (updated.id === order.id) {
        setOrder(updated);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [order.id]);

  const copyPixKey = () => {
    navigator.clipboard.writeText(settings.pixKey);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const getStepProgress = () => {
    switch (order.status) {
      case 'NOVO': return 1;
      case 'PREPARANDO': return 2;
      case 'A_CAMINHO': return 3;
      case 'CONCLUIDO': return 4;
      default: return 1;
    }
  };

  const step = getStepProgress();

  const handleWhatsAppRedirect = () => {
    const encoded = generateWhatsAppMessage(order, settings.whatsapp);
    const cleanPhone = settings.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-6 text-center relative">
          <span className="bg-white/20 text-purple-200 text-xs uppercase px-3 py-1 rounded-full font-bold inline-block mb-2">
            Pedido Realizado com Sucesso
          </span>
          <h2 className="text-2xl font-black">{order.id}</h2>
          <p className="text-purple-200 text-xs mt-1">Horário: {formatDateTime(order.createdAt)}</p>
        </div>

        {/* Tracking Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* Status Timeline */}
          <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-100">
            <h3 className="font-bold text-slate-800 text-sm mb-4 text-center">Status do Pedido</h3>

            <div className="relative flex items-center justify-between px-2">
              {/* Connecting line */}
              <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-200 -z-0">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${((step - 1) / 3) * 100}%` }}
                />
              </div>

              {/* Step 1 */}
              <div className="flex flex-col items-center gap-1 z-10">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step >= 1 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-700">Recebido</span>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center gap-1 z-10">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step >= 2 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <ChefHat className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-700">Preparo</span>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center gap-1 z-10">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step >= 3 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {order.orderType === 'ENTREGA' ? <Bike className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                </div>
                <span className="text-[10px] font-bold text-slate-700">
                  {order.orderType === 'ENTREGA' ? 'A Caminho' : 'Pronto'}
                </span>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col items-center gap-1 z-10">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step >= 4 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-700">Concluído</span>
              </div>
            </div>

            {/* Current status description */}
            <div className="mt-5 text-center p-3 bg-white rounded-xl border border-purple-200">
              {order.status === 'NOVO' && (
                <div className="space-y-1">
                  <p className="font-bold text-purple-900 text-sm">Aguardando confirmação da loja</p>
                  <p className="text-xs text-slate-500">
                    O Kayky já recebeu seu pedido e iniciará a montagem em breve!
                  </p>
                </div>
              )}
              {order.status === 'PREPARANDO' && (
                <div className="space-y-1">
                  <p className="font-bold text-purple-900 text-sm">Seu açaí está sendo montado com muito capricho! 🥣</p>
                  <p className="text-xs text-slate-500">Em poucos minutos estará prontinho.</p>
                </div>
              )}
              {order.status === 'A_CAMINHO' && (
                <div className="space-y-1">
                  <p className="font-bold text-emerald-800 text-sm">
                    {order.orderType === 'ENTREGA'
                      ? 'O motoboy já saiu para entrega! 🛵'
                      : 'Seu açaí está pronto para retirada no balcão! 🏪'}
                  </p>
                  <p className="text-xs text-slate-500">Fique atento ao chamado!</p>
                </div>
              )}
              {order.status === 'CONCLUIDO' && (
                <div className="space-y-1">
                  <p className="font-bold text-emerald-800 text-sm">Pedido Concluído! 💜</p>
                  <p className="text-xs text-slate-500">Obrigado pela preferência e bom apetite!</p>
                </div>
              )}
            </div>
          </div>

          {/* Pix Reminder if Pix was chosen */}
          {order.paymentMethod === 'PIX' && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span>Chave Pix da Loja:</span>
                <span>Valor: {formatCurrency(order.total)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={settings.pixKey}
                  className="flex-1 bg-white border border-emerald-300 text-emerald-950 font-mono text-xs p-2 rounded-xl"
                />
                <button
                  onClick={copyPixKey}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPix ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>
          )}

          {/* WhatsApp Direct Action Button */}
          <button
            onClick={handleWhatsAppRedirect}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <MessageCircle className="w-5 h-5" />
            <span>Enviar resumo / Falar no WhatsApp</span>
          </button>

          {/* Resumo dos Itens */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Itens do Pedido</h4>
            <div className="space-y-2 text-xs text-slate-600">
              {order.items.map((item, idx) => (
                <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>{item.quantity}x {item.size.name}</span>
                    <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                  <p className="text-purple-700 font-semibold">{item.base.name}</p>
                  {item.freeToppings.length > 0 && (
                    <p className="text-slate-500">Grátis: {item.freeToppings.map(t => t.name).join(', ')}</p>
                  )}
                  {item.premiumToppings.length > 0 && (
                    <p className="text-amber-700 font-medium">
                      Extras: {item.premiumToppings.map(p => `${p.quantity > 1 ? `${p.quantity}x ` : ''}${p.item.name}`).join(', ')}
                    </p>
                  )}
                  {item.syrups.length > 0 && (
                    <p className="text-purple-700">Caldas: {item.syrups.map(s => s.name).join(', ')}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between font-black text-slate-900 text-sm pt-2">
              <span>Total Pago/A Pagar:</span>
              <span className="text-purple-900 text-base">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-slate-300 hover:bg-slate-100 font-bold text-slate-700 rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Fechar Acompanhamento
          </button>
          <button
            onClick={onNewOrder}
            className="flex-1 py-3 px-4 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Fazer Outro Pedido
          </button>
        </div>
      </div>
    </div>
  );
};
