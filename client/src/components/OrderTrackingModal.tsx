import React, { useEffect, useState, useRef } from 'react';
import type { Order, StoreSettings } from '../types';
import { formatCurrency, formatDateTime, generateWhatsAppMessage } from '../utils/format';
import { getSocket } from '../utils/socket';
import { isSupabaseConfigured } from '../utils/supabase';
import {
  subscribeToOrder,
  confirmOrderPayment,
  cancelOrderByCustomer,
  subscribeToOrderBroadcastEvents
} from '../services/supabaseService';
import {
  checkOrderPaymentStatus,
  createMercadoPagoPreference
} from '../services/mercadopagoService';
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
  RefreshCw,
  X,
  Smartphone,
  ExternalLink,
  ShieldCheck
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
  const [order, setOrder] = useState<Order>(initialOrder || ({} as Order));
  const [copiedPix, setCopiedPix] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [isOpeningMp, setIsOpeningMp] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('Quero refazer ou alterar os itens do pedido');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [mpStatusInfo, setMpStatusInfo] = useState<{ isPaid?: boolean; message?: string } | null>(() => {
    if (initialOrder?.paymentDetails?.isPaid) return { isPaid: true };
    return null;
  });
  const previousStatusRef = useRef(initialOrder?.status || 'NOVO');

  useEffect(() => {
    if (initialOrder) {
      setOrder(prev => ({
        ...initialOrder,
        paymentDetails: {
          ...prev?.paymentDetails,
          ...initialOrder.paymentDetails,
          isPaid: Boolean(prev?.paymentDetails?.isPaid || initialOrder.paymentDetails?.isPaid),
          mercadoPagoInitPoint:
            initialOrder.paymentDetails?.mercadoPagoInitPoint ||
            prev?.paymentDetails?.mercadoPagoInitPoint
        }
      }));
    }
  }, [initialOrder]);

  const orderId = order?.id || '';
  const currentStatus = order?.status || 'NOVO';
  const isCancelled = currentStatus === 'CANCELADO';
  const items = (Array.isArray(order?.items) ? order.items : []).filter(Boolean);
  const isMpOrder =
    order?.paymentDetails?.gateway === 'MERCADO_PAGO' ||
    order?.paymentMethod === 'CARTAO_ONLINE' ||
    order?.paymentMethod === 'MERCADO_PAGO';
  const isOrderPaid = Boolean(order?.paymentDetails?.isPaid || mpStatusInfo?.isPaid);

  const handleVerifyPayment = async () => {
    if (!orderId) return;
    setIsCheckingPayment(true);
    try {
      const res = await checkOrderPaymentStatus(orderId);
      if (res.isPaid) {
        setMpStatusInfo({ isPaid: true, message: 'Pagamento Aprovado no Mercado Pago! ⚡' });
        setOrder(prev => {
          const next: Order = {
            ...prev,
            paymentDetails: {
              ...prev.paymentDetails,
              gateway: 'MERCADO_PAGO',
              isPaid: true,
              mercadoPagoStatus: 'approved',
              mercadoPagoPaymentId: res.paymentId
            }
          };
          try {
            localStorage.setItem('luky_cached_active_order', JSON.stringify(next));
          } catch {}
          return next;
        });
        await confirmOrderPayment(orderId, currentStatus, res.paymentId ? String(res.paymentId) : undefined);
      } else if (res.status === 'pending' || res.status === 'in_process') {
        setMpStatusInfo({ isPaid: false, message: 'Pagamento ainda em análise no Mercado Pago. Se já concluiu, aguarde alguns segundos.' });
      } else {
        setMpStatusInfo({ isPaid: false, message: 'Nenhum pagamento identificado ainda. Conclua na tela oficial ou app do Mercado Pago.' });
      }
    } catch {
      setMpStatusInfo({ isPaid: false, message: 'Não foi possível verificar o status no momento.' });
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const handleOpenMercadoPago = async () => {
    if (!order?.id) return;
    if (order.paymentDetails?.mercadoPagoInitPoint) {
      window.location.href = order.paymentDetails.mercadoPagoInitPoint;
      return;
    }
    setIsOpeningMp(true);
    try {
      const pref = await createMercadoPagoPreference(order);
      if (pref?.initPoint) {
        setOrder(prev => {
          const next = {
            ...prev,
            paymentDetails: {
              ...prev.paymentDetails,
              gateway: 'MERCADO_PAGO',
              mercadoPagoPreferenceId: pref.preferenceId,
              mercadoPagoInitPoint: pref.initPoint
            }
          };
          try {
            localStorage.setItem('luky_cached_active_order', JSON.stringify(next));
          } catch {}
          return next;
        });
        window.location.href = pref.initPoint;
      }
    } catch (err: any) {
      setMpStatusInfo({
        isPaid: false,
        message: err?.message || 'Não foi possível abrir o Mercado Pago agora. Tente novamente.'
      });
    } finally {
      setIsOpeningMp(false);
    }
  };

  const handleCustomerCancel = async () => {
    if (!orderId || currentStatus !== 'NOVO') return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      const res = await cancelOrderByCustomer(orderId, cancelReason);
      if (!res.success) {
        setCancelError(res.error || 'Não foi possível cancelar o pedido.');
        return;
      }
      playCancellationAlert();
      previousStatusRef.current = 'CANCELADO';
      setShowCancelConfirm(false);
      setOrder(prev => {
        const next: Order = {
          ...prev,
          status: 'CANCELADO',
          cancellationReason: cancelReason
        };
        try {
          localStorage.removeItem('luky_active_order_id');
          localStorage.removeItem('luky_cached_active_order');
        } catch {}
        return next;
      });
    } catch {
      setCancelError('Erro ao cancelar o pedido. Tente novamente.');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (!orderId || !isMpOrder || isCancelled || isOrderPaid) return;

    let cancelled = false;
    const checkNow = () => {
      checkOrderPaymentStatus(orderId)
        .then(res => {
          if (!cancelled && res.isPaid) {
            setMpStatusInfo({ isPaid: true, message: 'Pagamento Aprovado no Mercado Pago! ⚡' });
            setOrder(prev => {
              const next: Order = {
                ...prev,
                paymentDetails: {
                  ...prev.paymentDetails,
                  gateway: 'MERCADO_PAGO',
                  isPaid: true,
                  mercadoPagoStatus: 'approved',
                  mercadoPagoPaymentId: res.paymentId
                }
              };
              try {
                localStorage.setItem('luky_cached_active_order', JSON.stringify(next));
              } catch {}
              return next;
            });
            confirmOrderPayment(orderId, currentStatus, res.paymentId ? String(res.paymentId) : undefined);
          }
        })
        .catch(() => {});
    };

    checkNow();
    const interval = setInterval(checkNow, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId, isMpOrder, isCancelled, isOrderPaid, currentStatus]);

  useEffect(() => {
    if (!orderId) return;

    const handleOrderUpdate = (updated: Order) => {
      try {
        if (!updated || typeof updated !== 'object' || !updated.id) return;
        if (updated.id === orderId) {
          if (previousStatusRef.current !== 'CANCELADO' && updated.status === 'CANCELADO') {
            playCancellationAlert();
          }
          previousStatusRef.current = updated.status;
          setOrder(prev => {
            const mergedPaid = Boolean(
              prev?.paymentDetails?.isPaid || updated.paymentDetails?.isPaid
            );
            if (mergedPaid) {
              setMpStatusInfo({ isPaid: true, message: 'Pagamento Confirmado! ⚡' });
            }
            const next: Order = {
              ...updated,
              paymentDetails: {
                ...prev?.paymentDetails,
                ...updated.paymentDetails,
                isPaid: mergedPaid,
                mercadoPagoInitPoint:
                  updated.paymentDetails?.mercadoPagoInitPoint ||
                  prev?.paymentDetails?.mercadoPagoInitPoint
              }
            };
            try {
              if (next.status === 'CANCELADO' || next.status === 'CONCLUIDO') {
                localStorage.removeItem('luky_active_order_id');
                localStorage.removeItem('luky_cached_active_order');
              } else {
                localStorage.setItem('luky_cached_active_order', JSON.stringify(next));
              }
            } catch {}
            return next;
          });
        }
      } catch (err) {
        console.warn('Erro ao processar atualização do pedido:', err);
      }
    };

    // Socket.IO local
    let socketCleanup = () => {};
    try {
      const socket = getSocket();
      socket.emit('track_order', orderId);
      socket.on('my_order_update', handleOrderUpdate);
      socket.on('order_status_updated', handleOrderUpdate);
      socketCleanup = () => {
        socket.off('my_order_update', handleOrderUpdate);
        socket.off('order_status_updated', handleOrderUpdate);
      };
    } catch (e) {
      console.warn('Socket indisponível:', e);
    }

    // Supabase Realtime (para funcionamento em produção na Vercel)
    let unsubSupabase = () => {};
    let unsubBroadcast = () => {};
    if (isSupabaseConfigured) {
      try {
        unsubSupabase = subscribeToOrder(orderId, handleOrderUpdate);
        unsubBroadcast = subscribeToOrderBroadcastEvents({
          onOrderPaid: payload => {
            if (payload.orderId === orderId) {
              setMpStatusInfo({ isPaid: true, message: 'Pagamento Confirmado! ⚡' });
              setOrder(prev => ({
                ...prev,
                paymentDetails: { ...prev.paymentDetails, isPaid: true }
              }));
            }
          },
          onCustomerCancelled: payload => {
            if (payload.orderId === orderId) {
              setOrder(prev => ({
                ...prev,
                status: 'CANCELADO',
                cancellationReason: payload.reason
              }));
            }
          }
        });
      } catch (e) {
        console.warn('Erro ao assinar Supabase realtime para pedido:', e);
      }
    }

    return () => {
      socketCleanup();
      unsubSupabase();
      unsubBroadcast();
    };
  }, [orderId]);

  const copyPixKey = () => {
    const key = settings?.pixKey || '';
    if (!key) return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(key);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = key;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2500);
    } catch {
      // ignore
    }
  };

  const getStepProgress = () => {
    switch (currentStatus) {
      case 'NOVO': return 1;
      case 'PREPARANDO': return 2;
      case 'A_CAMINHO': return 3;
      case 'CONCLUIDO': return 4;
      default: return 1;
    }
  };

  const step = getStepProgress();

  const handleWhatsAppRedirect = () => {
    const rawPhone = settings?.whatsapp || '11999999999';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    let text = '';
    if (isCancelled) {
      text = encodeURIComponent(`Olá Luky! Vi o aviso de que meu pedido *${orderId}* não pôde ser aceito. Gostaria de tirar uma dúvida!`);
    } else {
      try {
        text = generateWhatsAppMessage(order, cleanPhone);
      } catch {
        text = encodeURIComponent(`Olá! Gostaria de acompanhar meu pedido ${orderId}`);
      }
    }
    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
    }
  };

  const handleStartNewOrder = () => {
    try {
      localStorage.removeItem('luky_active_order_id');
    } catch {
      // ignore
    }
    onNewOrder();
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden border border-purple-200 dark:border-purple-900/40 text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`p-4 sm:p-6 text-center relative border-b text-white ${
          isCancelled
            ? 'bg-gradient-to-r from-red-700 via-rose-700 to-red-800 border-red-800'
            : 'bg-gradient-to-r from-[#471256] via-[#5c1c73] to-[#360942] border-purple-800'
        }`}>
          {/* Botão de Fechar no topo */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

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

          <h2 className="text-2xl font-black">{orderId || 'Carregando...'}</h2>
          <p className="text-purple-200 text-xs mt-0.5">Realizado às {formatDateTime(order?.createdAt)}</p>
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
                  "{order?.cancellationReason || 'Infelizmente os pedidos estão temporariamente em pausa ou o item solicitado está em falta.'}"
                </p>
              </div>

              {order?.paymentMethod === 'PIX' && order?.paymentDetails?.gateway !== 'MERCADO_PAGO' && (
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
                  type="button"
                  onClick={handleWhatsAppRedirect}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-4 rounded-2xl flex items-center justify-center gap-2 text-xs shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Falar com o Luky no WhatsApp</span>
                </button>

                <button
                  type="button"
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
                    {order?.orderType === 'ENTREGA' ? <Bike className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                    {order?.orderType === 'ENTREGA' ? 'A Caminho' : 'Pronto'}
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
                {currentStatus === 'NOVO' && (
                  <div className="space-y-1">
                    <p className="font-black text-purple-900 dark:text-purple-300 text-sm">Aguardando confirmação do Luky</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      O pedido já caiu no painel e logo começará a ser montado!
                    </p>
                  </div>
                )}
                {currentStatus === 'PREPARANDO' && (
                  <div className="space-y-1">
                    <p className="font-black text-purple-900 dark:text-purple-300 text-sm">Seu açaí está sendo montado com muito capricho! 🥣</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Falta pouco para ficar prontinho.</p>
                  </div>
                )}
                {currentStatus === 'A_CAMINHO' && (
                  <div className="space-y-1">
                    <p className="font-black text-emerald-800 dark:text-emerald-400 text-sm">
                      {order?.orderType === 'ENTREGA'
                        ? 'O motoboy já saiu para entrega! 🛵'
                        : 'Seu açaí está prontinho para retirada no balcão! 🏪'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Fique atento ao chamado!</p>
                  </div>
                )}
                {currentStatus === 'CONCLUIDO' && (
                  <div className="space-y-1">
                    <p className="font-black text-emerald-800 dark:text-emerald-400 text-sm">Pedido Concluído! 💜</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Obrigado pela preferência e bom apetite!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pix Reminder if Pix was chosen and order not cancelled */}
          {!isCancelled && !isMpOrder && order?.paymentMethod === 'PIX' && (
            isOrderPaid ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-300 dark:border-emerald-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <span className="font-black text-emerald-950 dark:text-emerald-200 text-xs block">
                    Pagamento Pix Confirmado pela Loja! ⚡
                  </span>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                    Recebemos seu Pix com sucesso. Seu açaí já está liberado para preparo!
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-300 dark:border-emerald-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-950 dark:text-emerald-200">
                  <span>Chave Pix Instantânea:</span>
                  <span className="font-black text-emerald-800 dark:text-emerald-300">Total: {formatCurrency(order?.total || 0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={settings?.pixKey || ''}
                    className="flex-1 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200 font-mono text-xs p-2 rounded-xl font-bold"
                  />
                  <button
                    type="button"
                    onClick={copyPixKey}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-xl font-black flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPix ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                  Assim que realizar o Pix, o Luky confirmará o recebimento para iniciar o preparo do seu açaí.
                </p>
              </div>
            )
          )}

          {/* Mercado Pago Official Status & Action Button */}
          {!isCancelled && isMpOrder && (
            <div className="space-y-2">
              {isOrderPaid ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-300 dark:border-emerald-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Check className="w-6 h-6 stroke-[3]" />
                  </div>
                  <div>
                    <span className="font-black text-emerald-950 dark:text-emerald-200 text-xs block">
                      Pagamento Aprovado no Mercado Pago! ⚡
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                      Confirmado com sucesso! O Luky já foi avisado para preparar seu açaí.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/40 rounded-2xl border border-blue-200 dark:border-blue-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Mercado Pago Oficial</span>
                    </span>
                    <span className="text-xs font-black text-purple-900 dark:text-amber-300">
                      Total: {formatCurrency(order?.total || 0)}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                    O preparo do seu açaí será liberado assim que o pagamento for confirmado no Mercado Pago.
                  </p>

                  <button
                    type="button"
                    onClick={handleOpenMercadoPago}
                    disabled={isOpeningMp}
                    className="w-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-600 hover:to-blue-700 text-white font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <Smartphone className="w-4 h-4 text-amber-300" />
                    <span>
                      {isOpeningMp
                        ? 'Abrindo Mercado Pago...'
                        : 'Abrir Tela Oficial / App do Mercado Pago'}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </button>

                  <button
                    type="button"
                    onClick={handleVerifyPayment}
                    disabled={isCheckingPayment}
                    className="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-slate-800 text-blue-900 dark:text-blue-200 font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer"
                  >
                    {isCheckingPayment ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        <span>Consultando Mercado Pago...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Já Paguei! Verificar Confirmação</span>
                      </>
                    )}
                  </button>

                  {mpStatusInfo?.message && (
                    <p className="text-[11px] text-center text-slate-600 dark:text-slate-300 font-medium">
                      {mpStatusInfo.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* WhatsApp Direct Action Button (if not cancelled) */}
          {!isCancelled && (
            <button
              type="button"
              onClick={handleWhatsAppRedirect}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Enviar resumo / Falar no WhatsApp</span>
            </button>
          )}

          {/* Opção de Cancelamento pelo Cliente (apenas quando o Luky ainda NÃO iniciou o preparo) */}
          {!isCancelled && currentStatus === 'NOVO' && (
            <div className="pt-1">
              {!showCancelConfirm ? (
                <div className="p-3.5 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                  <div className="text-center sm:text-left">
                    <span className="text-xs font-bold text-rose-950 dark:text-rose-200 block">
                      Precisa desistir ou alterar o pedido?
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-400">
                      Como o Luky ainda não iniciou o preparo, você pode cancelar agora.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null);
                      setShowCancelConfirm(true);
                    }}
                    className="shrink-0 w-full sm:w-auto px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancelar Pedido</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border-2 border-rose-400 dark:border-rose-700 bg-rose-50/90 dark:bg-rose-950/40 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-xs font-black text-rose-950 dark:text-rose-200 uppercase">
                        Confirmar Cancelamento do Pedido
                      </h5>
                      <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5">
                        Selecione o motivo do cancelamento:
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    {[
                      'Quero refazer ou alterar os itens do pedido',
                      'Escolhi a forma de pagamento ou endereço errado',
                      'Desisti da compra no momento'
                    ].map(reasonOption => (
                      <button
                        key={reasonOption}
                        type="button"
                        onClick={() => setCancelReason(reasonOption)}
                        className={`text-left text-xs px-3 py-2 rounded-xl border font-bold transition-all cursor-pointer ${
                          cancelReason === reasonOption
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-rose-200 dark:border-rose-800/80 hover:bg-rose-100/50'
                        }`}
                      >
                        {reasonOption}
                      </button>
                    ))}
                  </div>

                  {cancelError && (
                    <p className="text-xs font-bold text-red-600 dark:text-red-400 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-red-300">
                      {cancelError}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={isCancelling}
                      className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleCustomerCancel}
                      disabled={isCancelling}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{isCancelling ? 'Cancelando...' : 'Sim, Cancelar Pedido'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aviso quando o preparo já começou (cancelamento bloqueado) */}
          {!isCancelled && currentStatus !== 'NOVO' && (
            <div className="p-3 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/50 text-center">
              <p className="text-[11px] font-bold text-purple-900 dark:text-purple-300">
                🍧 O Luky já iniciou o preparo do seu pedido! A partir desta etapa o cancelamento pelo site fica desativado.
              </p>
            </div>
          )}

          {/* Resumo dos Itens */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <h4 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider">Itens do Pedido</h4>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              {items.length === 0 ? (
                <p className="text-slate-400 italic text-xs py-2">Detalhes dos itens não disponíveis.</p>
              ) : (
                items.map((item, idx) => {
                  if (!item || typeof item !== 'object') return null;
                  const sizeName = typeof item?.size?.name === 'string' ? item.size.name : (typeof item?.size === 'string' ? item.size : 'Açaí');
                  const baseName = typeof item?.base?.name === 'string' ? item.base.name : (typeof item?.base === 'string' ? item.base : null);
                  const rawFree = Array.isArray(item?.freeToppings) ? item.freeToppings : [];
                  const freeToppings = rawFree.filter((t: any) => !String(t?.id || '').startsWith('fruit-'));
                  const fruits = Array.isArray(item?.fruits) && item.fruits.length > 0
                    ? item.fruits
                    : rawFree.filter((t: any) => String(t?.id || '').startsWith('fruit-'));
                  const premiumToppings = Array.isArray(item?.premiumToppings) ? item.premiumToppings : [];
                  const syrups = Array.isArray(item?.syrups) ? item.syrups : [];
                  const unitPrice = Number(item?.unitPrice) || 0;
                  const quantity = Number(item?.quantity) || 1;

                  const syrupNames = syrups
                    .map((s: any) => typeof s === 'string' ? s : (typeof s?.name === 'string' ? s.name : ''))
                    .filter(Boolean)
                    .join(', ');

                  const freeNames = freeToppings
                    .map((t: any) => typeof t === 'string' ? t : (typeof t?.name === 'string' ? t.name : ''))
                    .filter(Boolean)
                    .join(', ');

                  const fruitNames = fruits
                    .map((f: any) => typeof f === 'string' ? f : (typeof f?.name === 'string' ? f.name : ''))
                    .filter(Boolean)
                    .join(', ');

                  const premiumNames = premiumToppings
                    .map((p: any) => {
                      const pName = typeof p?.item?.name === 'string' ? p.item.name : (typeof p?.name === 'string' ? p.name : (typeof p === 'string' ? p : ''));
                      if (!pName) return '';
                      const pQty = (Number(p?.quantity) || 1) > 1 ? `${p.quantity}x ` : '';
                      return `${pQty}${pName}`;
                    })
                    .filter(Boolean)
                    .join(', ');

                  return (
                    <div key={item?.id || idx} className="bg-slate-50 dark:bg-slate-800/70 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/60 space-y-1">
                      <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                        <span>{quantity}x {sizeName}</span>
                        <span className="text-purple-900 dark:text-amber-400 font-mono">{formatCurrency(unitPrice * quantity)}</span>
                      </div>
                      {baseName && (
                        <p className="text-purple-700 dark:text-purple-300 font-semibold text-[11px]">Base: {baseName}</p>
                      )}
                      {syrupNames && (
                        <p className="text-purple-700 dark:text-purple-300 text-[11px]">
                          Calda: {syrupNames}
                        </p>
                      )}
                      {freeNames && (
                        <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                          Complementos: {freeNames}
                        </p>
                      )}
                      {fruitNames && (
                        <p className="text-rose-600 dark:text-rose-400 text-[11px]">
                          Frutas: {fruitNames}
                        </p>
                      )}
                      {premiumNames && (
                        <p className="text-amber-700 dark:text-amber-400 font-medium text-[11px]">
                          Extras: {premiumNames}
                        </p>
                      )}
                      {(() => {
                        const cleanItemNotes = (item?.notes || '').replace(/\[Frutas:[^\]]*\]\s*-?\s*/gi, '').trim();
                        return cleanItemNotes ? (
                          <p className="text-slate-400 italic text-[10px]">Obs: {cleanItemNotes}</p>
                        ) : null;
                      })()}
                      <div className="pt-0.5">
                        {item?.needSpoon === false ? (
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            🍃 Sem colher
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                            🥄 Com colher
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Totais do Pedido */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Colher descartável:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {order?.needCutlery === false ? '🍃 Não precisa de colher' : '🥄 Enviar colher'}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subtotal dos itens:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatCurrency(order?.subtotal || 0)}</span>
              </div>
              {order?.orderType === 'ENTREGA' && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Taxa de entrega{order?.address?.neighborhood ? ` (${order.address.neighborhood})` : ''}:</span>
                  <span className="font-mono font-bold text-purple-700 dark:text-amber-400">{formatCurrency(order?.deliveryFee || 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-slate-900 dark:text-white text-sm pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>Total:</span>
                <span className="text-purple-950 dark:text-amber-400 font-black text-lg font-mono">{formatCurrency(order?.total || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
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
