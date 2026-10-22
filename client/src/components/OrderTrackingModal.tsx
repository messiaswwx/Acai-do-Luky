import React, { useEffect, useState, useRef } from 'react';
import type { Order, StoreSettings } from '../types';
import { formatCurrency, formatDateTime, generateWhatsAppMessage } from '../utils/format';
import { getSocket } from '../utils/socket';
import { isSupabaseConfigured } from '../utils/supabase';
import { subscribeToOrder } from '../services/supabaseService';
import { playCancellationAlert } from '../utils/audio';
import { 
  CheckCircle2, 
  Clock, 
  Bike, 
  MessageCircle, 
  Store, 
  ChefHat, 
  Copy, 
  Check, 
  XCircle, 
  AlertTriangle, 
  RefreshCw 
} from 'lucide-react';

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
  const previousStatusRef = useRef(initialOrder.status);

  useEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  useEffect(() => {
    const handleOrderUpdate = (updated: Order) => {
      if (updated.id === order.id) {
        if (previousStatusRef.current !== 'CANCELADO' && updated.status === 'CANCELADO') {
          playCancellationAlert();
        }
        previousStatusRef.current = updated.status;
        setOrder(updated);
      }
    };

    // Socket.IO local
    const socket = getSocket();
    socket.emit('track_order', order.id);
    socket.on('my_order_update', handleOrderUpdate);
    socket.on('order_status_updated', handleOrderUpdate);

    // Supabase Realtime (para funcionamento em produção na Vercel)
    let unsubSupabase = () => {};
    if (isSupabaseConfigured) {
      unsubSupabase = subscribeToOrder(order.id, handleOrderUpdate);
    }

    return () => {
      socket.off('my_order_update', handleOrderUpdate);
      socket.off('order_status_updated', handleOrderUpdate);
      unsubSupabase();
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
    let text = '';
    if (order.status === 'CANCELADO') {
      text = `Olá Luky! Vi o aviso de que meu pedido *${order.id}* não pôde ser aceito. Gostaria de tirar uma dúvida!`;
    } else {
      text = generateWhatsAppMessage(order, settings.whatsapp);
    }
    const cleanPhone = settings.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleStartNewOrder = () => {
    localStorage.removeItem('luky_active_order_id');
    onNewOrder();
  };

  const isCancelled = order.status === 'CANCELADO';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-purple-200 dark:border-purple-900/40 text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className={`p-6 text-center relative border-b text-white ${
          isCancelled
            ? 'bg-gradient-to-r from-red-700 via-rose-700 to-red-800 border-red-800'
            : 'bg-gradient-to-r from-[#471256] via-[#5c1c73] to-[#360942] border-purple-800'
        }`}>
          <div className="flex justify-center mb-2">
            <img
              src="/logo.png"
              alt="Logo"
              className={`w-14 h-14 rounded-full border-2 bg-white object-contain shadow-lg ${
                isCancelled ? 'border-red-400' : 'border-amber-400'
              }`}
              loading="eager"
              decoding="async"
            />
          </div>

          {isCancelled ? (
            <span className="bg-red-500 text-white text-[11px] uppercase px-3 py-1 rounded-full font-black inline-flex items-center gap-1 mb-1 shadow-xs animate-bounce">
              <XCircle className="w-3.5 h-3.5" />
              Pedido Não Aceito
            </span>
          ) : (
            <span className="bg-amber-400 text-purple-950 text-[11px] uppercase px-3 py-1 rounded-full font-black inline-block mb-1 shadow-xs">
              Pedido Confirmado
            </span>
          )}

          <h2 className="text-2xl font-black">{order.id}</h2>
          <p className="text-purple-200 text-xs mt-0.5">Realizado às {formatDateTime(order.createdAt)}</p>
        </div>

        {/* Tracking Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* Se o pedido foi RECUSADO / CANCELADO */}
          {isCancelled ? (
            <div className="bg-gradient-to-br from-red-50 via-rose-50 to-red-100 dark:from-red-950/60 dark:via-rose-950/50 dark:to-red-900/40 p-5 rounded-3xl border-2 border-red-500/60 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-600/30">
                  <XCircle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-black text-red-900 dark:text-red-200 text-base">
                    Pedido Não Pôde Ser Aceito
                  </h3>
                  <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                    Infelizmente o Luky não pôde aceitar seu pedido no momento.
                  </p>
                </div>
              </div>

              {/* Motivo informado pelo lojista */}
              <div className="bg-white/90 dark:bg-slate-900/90 p-4 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-xs">
                <p className="text-[11px] font-black uppercase text-red-600 dark:text-red-400 tracking-wider">
                  Motivo informado pela loja:
                </p>
                <p className="text-sm font-bold text-slate-800 dark:text-white mt-1.5 leading-snug">
                  "{order.cancellationReason || 'Infelizmente os pedidos estão temporariamente em pausa ou o item solicitado está em falta.'}"
                </p>
              </div>

              {order.paymentMethod === 'PIX' && (
                <div className="bg-amber-50 dark:bg-amber-950/40 p-3.5 rounded-2xl border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Pagamento via Pix</span>
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Se você já enviou o Pix, não se preocupe! Chame o Luky no WhatsApp abaixo com o comprovante para fazermos o estorno imediato.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={handleWhatsAppRedirect}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-4 rounded-2xl flex items-center justify-center gap-2 text-xs shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Falar com o Luky no WhatsApp</span>
                </button>

                <button
                  onClick={handleStartNewOrder}
                  className="flex-1 bg-purple-900 hover:bg-purple-950 text-white font-black py-3 px-4 rounded-2xl flex items-center justify-center gap-2 text-xs shadow-md transition-all cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Fazer Outro Pedido</span>
                </button>
              </div>
            </div>
          ) : (
            /* Status Timeline normal */
            <div className="bg-purple-50/70 dark:bg-purple-950/40 p-4 rounded-2xl border border-purple-200 dark:border-purple-900/50">
              <h3 className="font-black text-slate-800 dark:text-white text-xs mb-4 text-center uppercase tracking-wider">
                Acompanhamento em Tempo Real
              </h3>

              <div className="relative flex items-center justify-between px-2">
                <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-200 dark:bg-slate-800 -z-0">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${((step - 1) / 3) * 100}%` }}
                  />
                </div>

                {/* Step 1 */}
                <div className="flex flex-col items-center gap-1 z-10">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      step >= 1 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Recebido</span>
                </div>

                {/* Step 2 */}
                <div className="flex flex-col items-center gap-1 z-10">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      step >= 2 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    <ChefHat className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Preparo</span>
                </div>

                {/* Step 3 */}
                <div className="flex flex-col items-center gap-1 z-10">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      step >= 3 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {order.orderType === 'ENTREGA' ? <Bike className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                    {order.orderType === 'ENTREGA' ? 'A Caminho' : 'Pronto'}
                  </span>
                </div>

                {/* Step 4 */}
                <div className="flex flex-col items-center gap-1 z-10">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      step >= 4 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Concluído</span>
                </div>
              </div>

              {/* Current status description */}
              <div className="mt-5 text-center p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-purple-200 dark:border-purple-900/50 shadow-xs">
                {order.status === 'NOVO' && (
                  <div className="space-y-1">
                    <p className="font-black text-purple-900 dark:text-purple-300 text-sm">Aguardando confirmação do Luky</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      O pedido já caiu no painel e logo começará a ser montado!
                    </p>
                  </div>
                )}
                {order.status === 'PREPARANDO' && (
                  <div className="space-y-1">
                    <p className="font-black text-purple-900 dark:text-purple-300 text-sm">Seu açaí está sendo montado com muito capricho! 🥣</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Falta pouco para ficar prontinho.</p>
                  </div>
                )}
                {order.status === 'A_CAMINHO' && (
                  <div className="space-y-1">
                    <p className="font-black text-emerald-800 dark:text-emerald-400 text-sm">
                      {order.orderType === 'ENTREGA'
                        ? 'O motoboy já saiu para entrega! 🛵'
                        : 'Seu açaí está prontinho para retirada no balcão! 🏪'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Fique atento ao chamado!</p>
                  </div>
                )}
                {order.status === 'CONCLUIDO' && (
                  <div className="space-y-1">
                    <p className="font-black text-emerald-800 dark:text-emerald-400 text-sm">Pedido Concluído! 💜</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Obrigado pela preferência e bom apetite!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pix Reminder if Pix was chosen and order not cancelled */}
          {!isCancelled && order.paymentMethod === 'PIX' && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-300 dark:border-emerald-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-950 dark:text-emerald-200">
                <span>Chave Pix da Loja:</span>
                <span className="font-black text-emerald-800 dark:text-emerald-300">Total: {formatCurrency(order.total)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={settings.pixKey}
                  className="flex-1 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200 font-mono text-xs p-2 rounded-xl font-bold"
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

          {/* WhatsApp Direct Action Button (if not cancelled) */}
          {!isCancelled && (
            <button
              onClick={handleWhatsAppRedirect}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Enviar resumo / Falar no WhatsApp</span>
            </button>
          )}

          {/* Resumo dos Itens */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <h4 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider">Itens do Pedido</h4>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              {order.items.map((item, idx) => (
                <div key={idx} className="bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                    <span>{item.quantity}x {item.size.name}</span>
                    <span className="text-purple-900 dark:text-amber-400">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                  <p className="text-purple-700 dark:text-purple-300 font-semibold">{item.base.name}</p>
                  {item.freeToppings.length > 0 && (
                    <p className="text-slate-500 dark:text-slate-400">Grátis: {item.freeToppings.map(t => t.name).join(', ')}</p>
                  )}
                  {item.premiumToppings.length > 0 && (
                    <p className="text-amber-700 dark:text-amber-400 font-medium">
                      Extras: {item.premiumToppings.map(p => `${p.quantity > 1 ? `${p.quantity}x ` : ''}${p.item.name}`).join(', ')}
                    </p>
                  )}
                  {item.syrups.length > 0 && (
                    <p className="text-purple-700 dark:text-purple-300">Caldas: {item.syrups.map(s => s.name).join(', ')}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between font-black text-slate-900 dark:text-white text-sm pt-2">
              <span>Total:</span>
              <span className="text-purple-950 dark:text-amber-400 font-black text-lg">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
          <button
            onClick={handleStartNewOrder}
            className="flex-1 py-3 px-4 bg-purple-800 hover:bg-purple-900 text-white font-black rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Fazer Novo Pedido
          </button>
        </div>
      </div>
    </div>
  );
};
