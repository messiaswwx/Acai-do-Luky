import React, { useEffect, useState } from 'react';
import type { Order, StoreSettings } from '../types';
import { formatCurrency, formatDateTime, generateWhatsAppMessage } from '../utils/format';
import { getSocket } from '../utils/socket';
import { CheckCircle2, Clock, Bike, MessageCircle, Store, ChefHat, Copy, Check } from 'lucide-react';

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
    const socket = getSocket();
    socket.emit('track_order', order.id);

    const handleMyOrder = (updated: Order) => {
      if (updated.id === order.id) {
        setOrder(updated);
      }
    };

    const handleOrderStatus = (updated: Order) => {
      if (updated.id === order.id) {
        setOrder(updated);
      }
    };

    socket.on('my_order_update', handleMyOrder);
    socket.on('order_status_updated', handleOrderStatus);

    return () => {
      socket.off('my_order_update', handleMyOrder);
      socket.off('order_status_updated', handleOrderStatus);
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-purple-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#471256] via-[#5c1c73] to-[#360942] text-white p-6 text-center relative border-b border-purple-800">
          <div className="flex justify-center mb-2">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-14 h-14 rounded-full border-2 border-amber-400 bg-white object-contain shadow-lg"
              loading="eager"
              decoding="async"
            />
          </div>
          <span className="bg-amber-400 text-purple-950 text-[11px] uppercase px-3 py-1 rounded-full font-black inline-block mb-1 shadow-xs">
            Pedido Confirmado
          </span>
          <h2 className="text-2xl font-black">{order.id}</h2>
          <p className="text-purple-200 text-xs mt-0.5">Realizado às {formatDateTime(order.createdAt)}</p>
        </div>

        {/* Tracking Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* Status Timeline */}
          <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200">
            <h3 className="font-black text-slate-800 text-xs mb-4 text-center uppercase tracking-wider">
              Acompanhamento em Tempo Real
            </h3>

            <div className="relative flex items-center justify-between px-2">
              <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-200 -z-0">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
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
            <div className="mt-5 text-center p-3.5 bg-white rounded-xl border border-purple-200 shadow-xs">
              {order.status === 'NOVO' && (
                <div className="space-y-1">
                  <p className="font-black text-purple-900 text-sm">Aguardando confirmação do Luky</p>
                  <p className="text-xs text-slate-500">
                    O pedido já caiu no painel e logo começará a ser montado!
                  </p>
                </div>
              )}
              {order.status === 'PREPARANDO' && (
                <div className="space-y-1">
                  <p className="font-black text-purple-900 text-sm">Seu açaí está sendo montado com muito capricho! 🥣</p>
                  <p className="text-xs text-slate-500">Falta pouco para ficar prontinho.</p>
                </div>
              )}
              {order.status === 'A_CAMINHO' && (
                <div className="space-y-1">
                  <p className="font-black text-emerald-800 text-sm">
                    {order.orderType === 'ENTREGA'
                      ? 'O motoboy já saiu para entrega! 🛵'
                      : 'Seu açaí está prontinho para retirada no balcão! 🏪'}
                  </p>
                  <p className="text-xs text-slate-500">Fique atento ao chamado!</p>
                </div>
              )}
              {order.status === 'CONCLUIDO' && (
                <div className="space-y-1">
                  <p className="font-black text-emerald-800 text-sm">Pedido Concluído! 💜</p>
                  <p className="text-xs text-slate-500">Obrigado pela preferência e bom apetite!</p>
                </div>
              )}
            </div>
          </div>

          {/* Pix Reminder if Pix was chosen */}
          {order.paymentMethod === 'PIX' && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-300 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                <span>Chave Pix da Loja:</span>
                <span className="font-black text-emerald-800">Total: {formatCurrency(order.total)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={settings.pixKey}
                  className="flex-1 bg-white border border-emerald-300 text-emerald-950 font-mono text-xs p-2 rounded-xl font-bold"
                />
                <button
                  onClick={copyPixKey}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-xl font-black flex items-center gap-1 cursor-pointer"
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
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
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
              <span>Total:</span>
              <span className="text-purple-950 font-black text-lg">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-slate-300 hover:bg-slate-100 font-bold text-slate-700 rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
          <button
            onClick={onNewOrder}
            className="flex-1 py-3 px-4 bg-purple-800 hover:bg-purple-900 text-white font-black rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Fazer Novo Pedido
          </button>
        </div>
      </div>
    </div>
  );
};
