import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Order, OrderStatus, StoreSettings, MenuData, InventoryItem } from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import { playOrderAlert } from '../utils/audio';
import { getRemainingHoursText } from '../utils/promo';
import { getSocket } from '../utils/socket';
import { isSupabaseConfigured } from '../utils/supabase';
import { 
  fetchOrders as fetchSupabaseOrders,
  fetchOrderById,
  updateOrderStatus as updateSupabaseOrderStatus,
  subscribeToOrders,
  fetchInventory,
  updateInventoryQuantity,
  saveInventoryItem,
  subscribeToInventory,
  confirmOrderPayment,
  subscribeToOrderBroadcastEvents
} from '../services/supabaseService';
import { checkOrderPaymentStatus } from '../services/mercadopagoService';
import { PrintReceipt } from './PrintReceipt';
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  CheckCircle, 
  Bike, 
  ChefHat, 
  Printer, 
  Settings, 
  SlidersHorizontal, 
  RefreshCw, 
  MessageSquare, 
  DollarSign, 
  ShoppingBag, 
  Power, 
  Flame, 
  Percent, 
  Check, 
  Save, 
  Clock, 
  XCircle,
  LogOut,
  ExternalLink,
  Boxes,
  Plus,
  Minus,
  AlertTriangle,
  PackageCheck,
  Sparkles,
  Pencil,
  Lock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

interface AdminPanelProps {
  settings: StoreSettings;
  menu: MenuData;
  onUpdateSettings: (newSettings: StoreSettings) => Promise<{ success: boolean; error?: string } | void>;
  onUpdateMenu: (newMenu: MenuData) => Promise<boolean | void>;
  onLogout?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  settings,
  menu,
  onUpdateSettings,
  onUpdateMenu,
  onLogout,
  isDark = false,
  onToggleTheme
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'PEDIDOS' | 'CARDAPIO' | 'ESTOQUE' | 'CONFIGURACOES'>('PEDIDOS');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'TODOS'>('TODOS');
  const [savingSettings, setSavingSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<StoreSettings>(settings);

  // Local state for full menu editing & discount management
  const [editableMenu, setEditableMenu] = useState<MenuData>(menu);
  const [savingMenu, setSavingMenu] = useState(false);
  const [menuSavedFeedback, setMenuSavedFeedback] = useState(false);

  const hasUnsavedMenuChanges = useMemo(() => {
    return JSON.stringify(editableMenu) !== JSON.stringify(menu);
  }, [editableMenu, menu]);

  // Controle de Estoque (Foco Exclusivo em Embalagens)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemQty, setEditingItemQty] = useState<string>('');
  const [newItemModal, setNewItemModal] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    category: 'EMBALAGENS',
    quantity: 50,
    unit: 'un',
    min_alert_quantity: 15,
    cost_price: 0.50,
    supplier: 'Distribuidora de Embalagens'
  });

  // Modal de Recusa de Pedido
  const [rejectModalOrder, setRejectModalOrder] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('Ingredientes ou produtos esgotados no momento');
  const [customRejectionReason, setCustomRejectionReason] = useState<string>('');
  const [isSubmittingReject, setIsSubmittingReject] = useState<boolean>(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    setEditableMenu(menu);
  }, [menu]);

  const loadOrders = async () => {
    try {
      if (isSupabaseConfigured) {
        const supOrders = await fetchSupabaseOrders();
        if (supOrders && supOrders.length > 0) {
          setOrders(supOrders);
          return;
        }
      }
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error('Erro ao buscar pedidos:', e);
    }
  };

  const loadInventory = async () => {
    setInventoryLoading(true);
    try {
      if (isSupabaseConfigured) {
        const items = await fetchInventory();
        setInventory(items);
      }
    } finally {
      setInventoryLoading(false);
    }
  };

  const [checkingPaymentOrderId, setCheckingPaymentOrderId] = useState<string | null>(null);
  const [mpCheckFeedback, setMpCheckFeedback] = useState<
    Record<string, { type: 'success' | 'pending' | 'warning' | 'error'; text: string }>
  >({});
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    loadOrders();
    loadInventory();

    const handleNewOrder = (newOrder: Order) => {
      setOrders(prev => {
        if (prev.some(o => o.id === newOrder.id)) return prev;
        if (soundEnabledRef.current) {
          playOrderAlert();
        }
        return [newOrder, ...prev];
      });
    };

    const handleOrderStatus = (updated: Order) => {
      setOrders(prev =>
        prev.map(o =>
          o.id === updated.id
            ? {
                ...updated,
                paymentDetails: {
                  ...o.paymentDetails,
                  ...updated.paymentDetails,
                  isPaid: Boolean(o.paymentDetails?.isPaid || updated.paymentDetails?.isPaid)
                }
              }
            : o
        )
      );
    };

    // Socket.IO local
    const socket = getSocket();
    socket.on('new_order', handleNewOrder);
    socket.on('order_status_updated', handleOrderStatus);

    // Supabase Realtime (se configurado)
    let unsubscribeSupabase = () => {};
    let unsubscribeInventory = () => {};
    let unsubscribeBroadcast = () => {};
    if (isSupabaseConfigured) {
      unsubscribeSupabase = subscribeToOrders(
        (newOrder) => handleNewOrder(newOrder),
        (updatedOrder) => handleOrderStatus(updatedOrder)
      );

      unsubscribeInventory = subscribeToInventory((updatedItem) => {
        setInventory(prev => {
          const exists = prev.some(i => i.id === updatedItem.id);
          if (exists) {
            return prev.map(i => i.id === updatedItem.id ? updatedItem : i);
          }
          return [...prev, updatedItem];
        });
      });

      unsubscribeBroadcast = subscribeToOrderBroadcastEvents({
        onOrderPaid: payload => {
          setOrders(prev => {
            const found = prev.find(o => o.id === payload.orderId);
            if (found && !found.paymentDetails?.isPaid) {
              confirmOrderPayment(payload.orderId, found.status, payload.paymentId);
            }
            return prev.map(o =>
              o.id === payload.orderId
                ? {
                    ...o,
                    paymentDetails: { ...o.paymentDetails, isPaid: true }
                  }
                : o
            );
          });
        },
        onCustomerCancelled: payload => {
          setOrders(prev => {
            const found = prev.find(o => o.id === payload.orderId);
            if (found && found.status === 'NOVO') {
              updateSupabaseOrderStatus(payload.orderId, 'CANCELADO', payload.reason);
            }
            return prev.map(o =>
              o.id === payload.orderId && o.status === 'NOVO'
                ? {
                    ...o,
                    status: 'CANCELADO',
                    cancellationReason: payload.reason
                  }
                : o
            );
          });
        }
      });
    }

    return () => {
      socket.off('new_order', handleNewOrder);
      socket.off('order_status_updated', handleOrderStatus);
      unsubscribeSupabase();
      unsubscribeInventory();
      unsubscribeBroadcast();
    };
  }, []);

  // Verificação automática em segundo plano no Mercado Pago para pedidos NOVO pendentes
  useEffect(() => {
    const checkPendingMpOrders = async () => {
      const pendingMp = orders.filter(o => {
        const isMp =
          o.paymentDetails?.gateway === 'MERCADO_PAGO' ||
          o.paymentMethod === 'CARTAO_ONLINE' ||
          o.paymentMethod === 'MERCADO_PAGO';
        return o.status === 'NOVO' && isMp && !o.paymentDetails?.isPaid;
      });

      for (const ord of pendingMp) {
        try {
          const res = await checkOrderPaymentStatus(ord.id);
          if (res.isPaid) {
            setOrders(prev =>
              prev.map(o =>
                o.id === ord.id
                  ? {
                      ...o,
                      paymentDetails: {
                        ...o.paymentDetails,
                        gateway: 'MERCADO_PAGO',
                        isPaid: true,
                        mercadoPagoStatus: 'approved',
                        mercadoPagoPaymentId: res.paymentId
                      }
                    }
                  : o
              )
            );
            await confirmOrderPayment(ord.id, ord.status, res.paymentId ? String(res.paymentId) : undefined);
          }
        } catch {
          // ignore
        }
      }
    };

    checkPendingMpOrders();
    const timer = setInterval(checkPendingMpOrders, 8000);
    return () => clearInterval(timer);
  }, [orders]);

  const handleConfirmPaymentForOrder = async (order: Order, paymentId?: string) => {
    setOrders(prev =>
      prev.map(o =>
        o.id === order.id
          ? {
              ...o,
              paymentDetails: {
                ...o.paymentDetails,
                isPaid: true
              }
            }
          : o
      )
    );
    await confirmOrderPayment(order.id, order.status, paymentId);
  };

  const handleCheckMpForOrder = async (order: Order) => {
    setCheckingPaymentOrderId(order.id);
    try {
      const [res, refreshedOrder] = await Promise.all([
        checkOrderPaymentStatus(order.id),
        isSupabaseConfigured ? fetchOrderById(order.id).catch(() => null) : Promise.resolve(null)
      ]);

      const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const alreadyPaidInDb = Boolean(refreshedOrder?.paymentDetails?.isPaid);

      if (res.isPaid || alreadyPaidInDb) {
        setMpCheckFeedback(prev => ({
          ...prev,
          [order.id]: {
            type: 'success',
            text: `✅ Confirmado às ${nowTime}: Pagamento aprovado no Mercado Pago! Preparo liberado.`
          }
        }));
        await handleConfirmPaymentForOrder(order, res.paymentId ? String(res.paymentId) : undefined);
      } else if (res.status === 'pending' || res.status === 'in_process') {
        setMpCheckFeedback(prev => ({
          ...prev,
          [order.id]: {
            type: 'pending',
            text: `⏳ Consultado às ${nowTime}: Cliente iniciou o pagamento, aguardando aprovação do Mercado Pago.`
          }
        }));
      } else if (res.status === 'rejected' || res.status === 'cancelled') {
        setMpCheckFeedback(prev => ({
          ...prev,
          [order.id]: {
            type: 'error',
            text: `❌ Consultado às ${nowTime}: Tentativa de pagamento recusada ou cancelada no Mercado Pago.`
          }
        }));
      } else if (res.status === 'error') {
        setMpCheckFeedback(prev => ({
          ...prev,
          [order.id]: {
            type: 'error',
            text: `⚠️ Falha ao conectar na API do Mercado Pago às ${nowTime}. Tente novamente.`
          }
        }));
      } else {
        setMpCheckFeedback(prev => ({
          ...prev,
          [order.id]: {
            type: 'warning',
            text: `ℹ️ Consultado às ${nowTime}: Cliente ainda não concluiu o pagamento no Mercado Pago.`
          }
        }));
      }
    } finally {
      setCheckingPaymentOrderId(null);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus, cancellationReason?: string) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder && newStatus === 'PREPARANDO') {
      const isMp =
        targetOrder.paymentDetails?.gateway === 'MERCADO_PAGO' ||
        targetOrder.paymentMethod === 'CARTAO_ONLINE' ||
        targetOrder.paymentMethod === 'MERCADO_PAGO';
      const requiresPriorPayment = isMp || targetOrder.paymentMethod === 'PIX';
      if (requiresPriorPayment && !targetOrder.paymentDetails?.isPaid) {
        return;
      }
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { 
      ...o, 
      status: newStatus,
      cancellationReason: cancellationReason || o.cancellationReason
    } : o));

    if (isSupabaseConfigured) {
      await updateSupabaseOrderStatus(orderId, newStatus, cancellationReason);
    }

    try {
      await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          notes: cancellationReason ? `[RECUSADO: ${cancellationReason}]` : undefined
        })
      });
    } catch {
      // offline fallback
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModalOrder) return;
    const finalReason = rejectionReason === 'OUTRO'
      ? (customRejectionReason.trim() || 'Pedido não pôde ser aceito no momento')
      : rejectionReason;

    setIsSubmittingReject(true);
    await updateOrderStatus(rejectModalOrder.id, 'CANCELADO', finalReason);
    setIsSubmittingReject(false);
    setRejectModalOrder(null);
    setCustomRejectionReason('');
  };

  // Funções de Estoque
  const handleAdjustQuantity = async (item: InventoryItem, delta: number) => {
    const newQty = Math.max(0, Number((item.quantity + delta).toFixed(2)));
    setInventory(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));
    if (isSupabaseConfigured) {
      await updateInventoryQuantity(item.id, newQty);
    }
  };

  const handleSetQuantity = async (item: InventoryItem, qty: number) => {
    const validQty = Math.max(0, isNaN(qty) ? 0 : Math.round(Number(qty)));
    setInventory(prev => prev.map(i => i.id === item.id ? { ...i, quantity: validQty } : i));
    if (isSupabaseConfigured) {
      await updateInventoryQuantity(item.id, validQty);
    }
  };

  const handleCreateInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemForm.name.trim()) return;

    const newItem: InventoryItem = {
      id: `est-${Date.now().toString().slice(-6)}`,
      name: newItemForm.name.trim(),
      category: newItemForm.category,
      quantity: Number(newItemForm.quantity) || 0,
      unit: newItemForm.unit.trim() || 'un',
      min_alert_quantity: Number(newItemForm.min_alert_quantity) || 1,
      cost_price: Number(newItemForm.cost_price) || 0,
      supplier: newItemForm.supplier.trim() || undefined
    };

    setInventory(prev => [...prev, newItem]);
    if (isSupabaseConfigured) {
      await saveInventoryItem(newItem);
    }

    setNewItemModal(false);
    setNewItemForm({
      name: '',
      category: 'EMBALAGENS',
      quantity: 50,
      unit: 'un',
      min_alert_quantity: 15,
      cost_price: 0.50,
      supplier: 'Distribuidora de Embalagens'
    });
  };

  const lowStockItems = useMemo(() => {
    return inventory.filter(i => i.quantity <= i.min_alert_quantity);
  }, [inventory]);

  const totalPackagingUnits = useMemo(() => {
    return inventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const getOrderRank = (item: InventoryItem) => {
      const id = (item.id || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      if (id.includes('300') || name.includes('300ml') || name.includes('300 ml')) return 1;
      if (id.includes('500') || name.includes('500ml') || name.includes('500 ml')) return 2;
      if (id.includes('700') || name.includes('700ml') || name.includes('700 ml')) return 3;
      if (id.includes('1000') || name.includes('1 litro') || name.includes('1l') || name.includes('1,1') || name.includes('1.1') || name.includes('barca') || name.includes('marmita') || name.includes('1100')) return 4;
      return 100;
    };

    return [...inventory].sort((a, b) => {
      const rankA = getOrderRank(a);
      const rankB = getOrderRank(b);
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [inventory]);

  // Price & Discount editing handlers
  const handleSizeOriginalPriceChange = (sizeId: string, val: number) => {
    setEditableMenu(prev => {
      const sizes = prev.sizes.map(s => {
        if (s.id !== sizeId) return s;
        const originalPrice = Math.max(0, val);
        const discountPercent = s.discountPercent || 0;
        const price = discountPercent > 0 
          ? Number((originalPrice * (1 - discountPercent / 100)).toFixed(2))
          : originalPrice;
        return { ...s, originalPrice, price };
      });
      return { ...prev, sizes };
    });
  };

  const handleSizeDiscountChange = (sizeId: string, percent: number) => {
    setEditableMenu(prev => {
      const sizes = prev.sizes.map(s => {
        if (s.id !== sizeId) return s;
        const discountPercent = Math.max(0, Math.min(99, percent));
        const basePrice = s.originalPrice ?? s.price;
        const price = discountPercent > 0 
          ? Number((basePrice * (1 - discountPercent / 100)).toFixed(2))
          : basePrice;
        
        // If discount cleared, remove expiration
        const discountExpiresAt = discountPercent === 0 ? undefined : s.discountExpiresAt;
        const discountHours = discountPercent === 0 ? undefined : s.discountHours;

        return { ...s, originalPrice: basePrice, discountPercent, price, discountExpiresAt, discountHours };
      });
      return { ...prev, sizes };
    });
  };

  // Change promo duration in hours (e.g. 24h, 48h, or null for indefinite)
  const handleSizeDiscountDurationChange = (sizeId: string, hours: number | null) => {
    setEditableMenu(prev => {
      const sizes = prev.sizes.map(s => {
        if (s.id !== sizeId) return s;
        if (!hours || hours <= 0) {
          return { ...s, discountHours: undefined, discountExpiresAt: undefined };
        }
        const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
        return { ...s, discountHours: hours, discountExpiresAt: expiresAt };
      });
      return { ...prev, sizes };
    });
  };

  const handleClearDiscount = (sizeId: string) => {
    setEditableMenu(prev => {
      const sizes = prev.sizes.map(s => {
        if (s.id !== sizeId) return s;
        const basePrice = s.originalPrice ?? s.price;
        return {
          ...s,
          price: basePrice,
          originalPrice: basePrice,
          discountPercent: 0,
          discountHours: undefined,
          discountExpiresAt: undefined
        };
      });
      return { ...prev, sizes };
    });
  };

  const handlePremiumToppingPriceChange = (id: string, val: number) => {
    setEditableMenu(prev => {
      const premiumToppings = prev.premiumToppings.map(p => 
        p.id === id ? { ...p, price: Math.max(0, val) } : p
      );
      return { ...prev, premiumToppings };
    });
  };

  const handleToggleItemAvailability = (
    category: 'sizes' | 'bases' | 'freeToppings' | 'fruits' | 'premiumToppings' | 'syrups',
    itemId: string
  ) => {
    setEditableMenu(prev => {
      const updated = { ...prev };
      // Se for fruta, garante que o array existe
      if (category === 'fruits' && !updated.fruits) {
        updated.fruits = [
          { id: 'fruit-banana', name: 'Banana', available: true },
          { id: 'fruit-morango', name: 'Morango', available: true },
          { id: 'fruit-kiwi', name: 'Kiwi', available: true },
          { id: 'fruit-manga', name: 'Manga', available: true },
          { id: 'fruit-uva', name: 'Uva', available: true }
        ];
      }
      // @ts-ignore
      updated[category] = (updated[category] || []).map((item: any) => 
        item.id === itemId ? { ...item, available: !item.available } : item
      );
      return updated;
    });
  };

  const handleSaveMenu = async () => {
    setSavingMenu(true);
    const success = await onUpdateMenu(editableMenu);
    setSavingMenu(false);
    if (success !== false) {
      setMenuSavedFeedback(true);
      setTimeout(() => setMenuSavedFeedback(false), 3500);
    } else {
      alert('Atenção: Não foi possível salvar as alterações no banco de dados. Verifique a conexão com a internet.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (localSettings.adminPin && localSettings.adminPin !== 'PROTEGIDO' && localSettings.adminPin.length < 4) {
      alert('O PIN deve conter no mínimo 4 números.');
      return;
    }
    setSavingSettings(true);
    const res = await onUpdateSettings(localSettings);
    setSavingSettings(false);
    if (res && typeof res === 'object' && !res.success) {
      alert(res.error || 'Erro ao salvar configurações.');
    } else {
      alert('Configurações salvas com sucesso!');
      if (localSettings.adminPin) {
        setLocalSettings(prev => ({ ...prev, adminPin: '' }));
      }
    }
  };

  const handleQuickToggleStoreOpen = async () => {
    const nextStatus = !localSettings.isOpen;
    const updated = { ...localSettings, isOpen: nextStatus };
    setLocalSettings(updated);
    await onUpdateSettings(updated);
  };

  // Memoized Metrics to avoid unnecessary recomputations when typing in price inputs
  const totalRevenue = useMemo(() => {
    return orders
      .filter(o => o.status !== 'CANCELADO')
      .reduce((acc, o) => acc + o.total, 0);
  }, [orders]);

  const pendingOrders = useMemo(() => orders.filter(o => o.status === 'NOVO'), [orders]);
  const inPrepOrders = useMemo(() => orders.filter(o => o.status === 'PREPARANDO'), [orders]);

  const filteredOrders = useMemo(() => {
    if (filterStatus === 'TODOS') return orders;
    return orders.filter(o => o.status === filterStatus);
  }, [orders, filterStatus]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header Bar for Admin */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-purple-200/80 dark:border-purple-900/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 text-slate-800 dark:text-slate-100">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-amber-400 bg-white object-contain shadow-sm shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-white truncate">Painel do Luky</h1>
              <button
                type="button"
                onClick={handleQuickToggleStoreOpen}
                title="Clique para alternar entre Loja Aberta e Loja Fechada"
                className={`text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-black flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                  localSettings.isOpen 
                    ? 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
                    : 'bg-red-100 hover:bg-red-200 dark:bg-red-950/80 dark:hover:bg-red-900 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse'
                }`}
              >
                <Power className="w-3 h-3 stroke-[2.5]" />
                <span>{localSettings.isOpen ? 'Loja Aberta' : 'Loja Fechada'}</span>
              </button>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">Cozinha, Gestão de Preços, Promoções e Cardápio</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {onToggleTheme && (
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          )}

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer border ${
              soundEnabled
                ? 'bg-amber-50 dark:bg-amber-950/40 text-purple-950 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-700 dark:text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            <span className="hidden xs:inline">Som:</span>
            <span>{soundEnabled ? 'Ligado' : 'Mudo'}</span>
          </button>

          <button
            onClick={playOrderAlert}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-900 dark:text-purple-300 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
            title="Testar campainha"
          >
            <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            onClick={loadOrders}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Atualizar</span>
          </button>

          <Link
            to="/"
            target="_blank"
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cardápio Cliente</span>
            <span className="sm:hidden">Cardápio</span>
          </Link>

          {onLogout && (
            <button
              onClick={onLogout}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Sair do painel e bloquear acesso"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase block truncate">Faturamento</span>
            <div className="text-base sm:text-lg font-black text-purple-950 dark:text-amber-400 truncate">{formatCurrency(totalRevenue)}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase block truncate">Total Pedidos</span>
            <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{orders.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400 text-purple-950 flex items-center justify-center shrink-0 font-black">
            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase block truncate">Novos Pedidos</span>
            <div className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-400">{pendingOrders.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
            <ChefHat className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase block truncate">Em Preparo</span>
            <div className="text-base sm:text-lg font-black text-purple-700 dark:text-purple-300">{inPrepOrders.length}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - 2x2 proportional grid on mobile, horizontal bar on desktop */}
      <div className="grid grid-cols-2 sm:flex sm:border-b sm:border-purple-200 dark:sm:border-purple-900/60 gap-2">
        <button
          onClick={() => setActiveTab('PEDIDOS')}
          className={`py-2.5 px-3 sm:pb-3 sm:px-4 rounded-xl sm:rounded-none font-black text-xs sm:text-sm flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border sm:border-0 sm:border-b-2 transition-colors cursor-pointer ${
            activeTab === 'PEDIDOS'
              ? 'bg-purple-900 text-amber-300 border-purple-900 sm:bg-transparent sm:border-purple-800 dark:sm:border-amber-400 sm:text-purple-950 dark:sm:text-amber-300'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:bg-transparent sm:border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Gestão de Pedidos ({orders.length})</span>
          <span className="sm:hidden truncate">Pedidos ({orders.length})</span>
          {pendingOrders.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-bounce shrink-0">
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('CARDAPIO')}
          className={`py-2.5 px-3 sm:pb-3 sm:px-4 rounded-xl sm:rounded-none font-black text-xs sm:text-sm flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border sm:border-0 sm:border-b-2 transition-colors cursor-pointer ${
            activeTab === 'CARDAPIO'
              ? 'bg-purple-900 text-amber-300 border-purple-900 sm:bg-transparent sm:border-purple-800 dark:sm:border-amber-400 sm:text-purple-950 dark:sm:text-amber-300'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:bg-transparent sm:border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Preços, Descontos & Cardápio</span>
          <span className="sm:hidden truncate">Cardápio & Preços</span>
        </button>

        <button
          onClick={() => setActiveTab('ESTOQUE')}
          className={`py-2.5 px-3 sm:pb-3 sm:px-4 rounded-xl sm:rounded-none font-black text-xs sm:text-sm flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border sm:border-0 sm:border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ESTOQUE'
              ? 'bg-purple-900 text-amber-300 border-purple-900 sm:bg-transparent sm:border-purple-800 dark:sm:border-amber-400 sm:text-purple-950 dark:sm:text-amber-300'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:bg-transparent sm:border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Boxes className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Estoque de Embalagens ({inventory.length})</span>
          <span className="sm:hidden truncate">Estoque ({inventory.length})</span>
          {lowStockItems.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-pulse shrink-0">
              {lowStockItems.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('CONFIGURACOES')}
          className={`py-2.5 px-3 sm:pb-3 sm:px-4 rounded-xl sm:rounded-none font-black text-xs sm:text-sm flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border sm:border-0 sm:border-b-2 transition-colors cursor-pointer ${
            activeTab === 'CONFIGURACOES'
              ? 'bg-purple-900 text-amber-300 border-purple-900 sm:bg-transparent sm:border-purple-800 dark:sm:border-amber-400 sm:text-purple-950 dark:sm:text-amber-300'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:bg-transparent sm:border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="truncate">Configurações</span>
        </button>
      </div>

      {/* TAB 1: GESTÃO DE PEDIDOS */}
      {activeTab === 'PEDIDOS' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(['TODOS', 'NOVO', 'PREPARANDO', 'A_CAMINHO', 'CONCLUIDO', 'CANCELADO'] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  filterStatus === st
                    ? 'bg-purple-900 dark:bg-purple-700 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {st === 'TODOS' && 'Todos os Pedidos'}
                {st === 'NOVO' && '🔔 Novos'}
                {st === 'PREPARANDO' && '🥣 Em Preparo'}
                {st === 'A_CAMINHO' && '🛵 Saiu / Pronto'}
                {st === 'CONCLUIDO' && '✅ Concluídos'}
                {st === 'CANCELADO' && '❌ Cancelados'}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500">
              <ShoppingBag className="w-12 h-12 stroke-1 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="font-bold text-slate-600 dark:text-slate-300">Nenhum pedido com este filtro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map(order => (
                <div
                  key={order.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border-2 flex flex-col justify-between overflow-hidden shadow-xs transition-shadow hover:shadow-md ${
                    order.status === 'NOVO'
                      ? 'border-amber-400 dark:border-amber-500 bg-amber-50/20 dark:bg-amber-950/20 shadow-md ring-2 ring-amber-400/30'
                      : order.status === 'PREPARANDO'
                      ? 'border-purple-300 dark:border-purple-700'
                      : order.status === 'A_CAMINHO'
                      ? 'border-blue-300 dark:border-blue-700'
                      : 'border-slate-200 dark:border-slate-800 opacity-95'
                  }`}
                >
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/70 dark:bg-slate-800/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 dark:text-white text-base">{order.id}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{formatDateTime(order.createdAt)}</span>
                      </div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-0.5">{order.customerName}</h3>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        order.status === 'NOVO'
                          ? 'bg-amber-500 text-white animate-pulse'
                          : order.status === 'PREPARANDO'
                          ? 'bg-purple-700 text-white'
                          : order.status === 'A_CAMINHO'
                          ? 'bg-blue-600 text-white'
                          : order.status === 'CONCLUIDO'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {order.status === 'NOVO' && 'Novo Pedido'}
                        {order.status === 'PREPARANDO' && 'Preparando'}
                        {order.status === 'A_CAMINHO' && 'A Caminho'}
                        {order.status === 'CONCLUIDO' && 'Concluído'}
                        {order.status === 'CANCELADO' && 'Cancelado'}
                      </span>

                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {order.orderType === 'ENTREGA' ? '🛵 Entrega' : '🏪 Retirada'}
                      </span>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        order.needCutlery === false || (order.notes && order.notes.includes('SEM COLHER'))
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                      }`}>
                        {order.needCutlery === false || (order.notes && order.notes.includes('SEM COLHER')) ? '🍃 Sem colher' : '🥄 Com colher'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3 flex-1 text-xs">
                    {order.orderType === 'ENTREGA' && order.address ? (
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/70 space-y-0.5">
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {order.address.street}, {order.address.number} - {order.address.neighborhood}
                        </p>
                        {order.address.complement && <p className="text-slate-500 dark:text-slate-400">Compl: {order.address.complement}</p>}
                        {order.address.reference && <p className="text-slate-500 dark:text-slate-400">Ref: {order.address.reference}</p>}
                      </div>
                    ) : (
                      <div className="bg-purple-50 dark:bg-purple-950/50 p-2 rounded-xl text-purple-900 dark:text-purple-300 font-semibold text-[11px] border border-purple-100 dark:border-purple-900/60">
                        Retirada presencial no balcão
                      </div>
                    )}

                    <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                      {order.items.map((item, idx) => {
                        const complements = (item.freeToppings || []).filter(t => !t.id?.startsWith('fruit-'));
                        const fruits = (item.fruits && item.fruits.length > 0)
                          ? item.fruits
                          : (item.freeToppings || []).filter(t => t.id?.startsWith('fruit-'));

                        return (
                          <div key={idx} className="bg-slate-50/70 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-700/60">
                            <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                              <span>{item.quantity}x {item.size.name}</span>
                              <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                            </div>
                            <p className="text-purple-800 dark:text-purple-300 font-semibold">{item.base.name}</p>
                            {item.syrups && item.syrups.length > 0 && (
                              <p className="text-purple-700 dark:text-purple-400">
                                <span className="font-semibold">Calda:</span> {item.syrups.map(s => s.name).join(', ')}
                              </p>
                            )}
                            {complements.length > 0 && (
                              <p className="text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">Comp:</span> {complements.map(t => t.name).join(', ')}
                              </p>
                            )}
                            {fruits.length > 0 && (
                              <p className="text-rose-600 dark:text-rose-400">
                                <span className="font-semibold">Frutas:</span> {fruits.map(f => f.name).join(', ')}
                              </p>
                            )}
                            {item.premiumToppings.length > 0 && (
                              <p className="text-amber-700 dark:text-amber-400">
                                <span className="font-semibold">Extras:</span> {item.premiumToppings.map(p => `${p.quantity > 1 ? `${p.quantity}x ` : ''}${p.item.name}`).join(', ')}
                              </p>
                            )}
                            {(() => {
                              const cleanItemNotes = (item.notes || '').replace(/\[Frutas:[^\]]*\]\s*-?\s*/gi, '').trim();
                              return cleanItemNotes ? (
                                <p className="italic text-purple-950 dark:text-amber-200 font-bold bg-amber-100/70 dark:bg-amber-950/60 border border-transparent dark:border-amber-800 p-1 rounded mt-1">
                                  Obs: {cleanItemNotes}
                                </p>
                              ) : null;
                            })()}
                            <div className="pt-1">
                              {item.needSpoon === false ? (
                                <span className="inline-block text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                  🍃 Sem colher
                                </span>
                              ) : (
                                <span className="inline-block text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                                  🥄 Com colher
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                      {order.orderType === 'ENTREGA' && (
                        <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>Taxa de Entrega ({order.address?.neighborhood || 'Bairro'}):</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(order.deliveryFee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-slate-200">
                        <span>Total:</span>
                        <span className="text-purple-950 dark:text-amber-400 font-black text-base">{formatCurrency(order.total)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex justify-between items-center flex-wrap gap-1">
                        <span>Pagamento:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                          {(order.paymentDetails?.gateway === 'MERCADO_PAGO' || order.paymentMethod === 'CARTAO_ONLINE' || order.paymentMethod === 'MERCADO_PAGO') ? (
                            <>
                              <span className="bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-md font-bold text-[10px]">
                                Mercado Pago Oficial
                              </span>
                              {order.paymentDetails?.isPaid ? (
                                <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded-md font-black text-[10px]">
                                  PAGO ✓
                                </span>
                              ) : (
                                <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-md font-black text-[10px]">
                                  Aguardando MP
                                </span>
                              )}
                            </>
                          ) : order.paymentMethod === 'PIX' ? (
                            <>
                              <span className="text-emerald-700 dark:text-emerald-400 font-bold">⚡ Pix Direto (Loja)</span>
                              {order.paymentDetails?.isPaid ? (
                                <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded-md font-black text-[10px]">
                                  PAGO ✓
                                </span>
                              ) : (
                                <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-md font-black text-[10px]">
                                  Aguardando Pix
                                </span>
                              )}
                            </>
                          ) : (
                            order.paymentMethod === 'DINHEIRO' && (
                              order.paymentDetails?.needChange 
                                ? `Dinheiro (Troco p/ ${formatCurrency(order.paymentDetails.changeFor || 0)})`
                                : 'Dinheiro'
                            )
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {order.status === 'NOVO' && (() => {
                      const isMp =
                        order.paymentDetails?.gateway === 'MERCADO_PAGO' ||
                        order.paymentMethod === 'CARTAO_ONLINE' ||
                        order.paymentMethod === 'MERCADO_PAGO';
                      const requiresPriorPayment = isMp || order.paymentMethod === 'PIX';
                      const isPaid = Boolean(order.paymentDetails?.isPaid);
                      const isPrepLocked = requiresPriorPayment && !isPaid;

                      return (
                        <div className="space-y-2">
                          {isPrepLocked && (
                            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 space-y-2">
                              <p className="text-[11px] font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span>
                                  {isMp
                                    ? 'Aguardando confirmação do Mercado Pago para liberar o preparo'
                                    : 'Confirme o recebimento do Pix para liberar o preparo'}
                                </span>
                              </p>
                              <div className="flex gap-1.5">
                                {isMp && (
                                  <button
                                    type="button"
                                    onClick={() => handleCheckMpForOrder(order)}
                                    disabled={checkingPaymentOrderId === order.id}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2.5 rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                                  >
                                    <RefreshCw className={`w-3 h-3 ${checkingPaymentOrderId === order.id ? 'animate-spin' : ''}`} />
                                    <span>{checkingPaymentOrderId === order.id ? 'Consultando...' : 'Verificar no MP'}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleConfirmPaymentForOrder(order)}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-1.5 px-2.5 rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                  title="Marcar pagamento como confirmado e liberar preparo"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{isMp ? 'Confirmar Pago' : 'Confirmar Pix Recebido'}</span>
                                </button>
                              </div>
                              {mpCheckFeedback[order.id] && (
                                <div
                                  className={`p-2 rounded-lg text-[11px] font-bold border ${
                                    mpCheckFeedback[order.id].type === 'success'
                                      ? 'bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                                      : mpCheckFeedback[order.id].type === 'error'
                                      ? 'bg-red-100/90 dark:bg-red-950/60 text-red-900 dark:text-red-200 border-red-300 dark:border-red-800'
                                      : 'bg-blue-100/90 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-800'
                                  }`}
                                >
                                  {mpCheckFeedback[order.id].text}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isPrepLocked}
                              onClick={() => updateOrderStatus(order.id, 'PREPARANDO')}
                              title={
                                isPrepLocked
                                  ? 'O preparo só pode ser iniciado após a confirmação do pagamento'
                                  : 'Iniciar preparo do pedido'
                              }
                              className={`flex-1 font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs ${
                                isPrepLocked
                                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-purple-950 cursor-pointer'
                              }`}
                            >
                              {isPrepLocked ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Aguardando Pagamento</span>
                                </>
                              ) : (
                                <>
                                  <ChefHat className="w-4 h-4" />
                                  <span>Aceitar e Preparar</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectModalOrder(order);
                                setRejectionReason('Ingredientes ou produtos esgotados no momento');
                                setCustomRejectionReason('');
                              }}
                              className="bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs"
                              title="Não aceitar / Recusar pedido"
                            >
                              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                              <span>Não Aceitar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {order.status === 'PREPARANDO' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateOrderStatus(order.id, 'A_CAMINHO')}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                        >
                          <Bike className="w-4 h-4" />
                          <span>{order.orderType === 'ENTREGA' ? 'Despachar Entrega' : 'Pronto p/ Retirada'}</span>
                        </button>
                        <button
                          onClick={() => {
                            setRejectModalOrder(order);
                            setRejectionReason('Alta demanda / Fila de espera muito longa');
                            setCustomRejectionReason('');
                          }}
                          className="bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700 font-bold py-2.5 px-2.5 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          title="Cancelar pedido"
                        >
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                          <span>Cancelar</span>
                        </button>
                      </div>
                    )}

                    {order.status === 'A_CAMINHO' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'CONCLUIDO')}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Finalizar Pedido</span>
                      </button>
                    )}

                    {order.status === 'CANCELADO' && (
                      <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-2.5 rounded-xl text-xs space-y-1">
                        <p className="font-bold flex items-center gap-1.5 text-red-800 dark:text-red-200">
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                          <span>Pedido Não Aceito / Cancelado</span>
                        </p>
                        {order.cancellationReason && (
                          <p className="text-[11px] text-red-600 dark:text-red-300 italic">
                            Motivo: "{order.cancellationReason}"
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://wa.me/55${order.customerPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold py-2 px-2.5 rounded-xl flex items-center justify-center gap-1 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>WhatsApp</span>
                      </a>

                      <button
                        onClick={() => setSelectedOrderForPrint(order)}
                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold py-2 px-2.5 rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                        <span>Imprimir</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONTROLE DE PREÇOS, DESCONTOS COM HORAS & ESTOQUE */}
      {activeTab === 'CARDAPIO' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-5 sm:space-y-6 text-slate-800 dark:text-slate-100">
          {/* Action Header with Save Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Percent className="w-5 h-5 text-amber-500" />
                <span>Gestão de Preços & Promoções por Horas</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Defina descontos em porcentagem e configure a validade temporária (ex: 24h, 48h).
              </p>
            </div>

            <button
              onClick={handleSaveMenu}
              disabled={savingMenu}
              className={`py-3 px-5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                menuSavedFeedback
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : hasUnsavedMenuChanges
                    ? 'bg-amber-400 hover:bg-amber-500 text-purple-950 shadow-amber-400/30 ring-2 ring-amber-300 active:scale-98 animate-pulse'
                    : 'bg-purple-800 hover:bg-purple-900 text-white shadow-purple-900/20 active:scale-98'
              }`}
            >
              {menuSavedFeedback ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Cardápio Salvo!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{savingMenu ? 'Salvando...' : hasUnsavedMenuChanges ? 'Salvar Alterações Pendentes' : 'Salvar Alterações'}</span>
                </>
              )}
            </button>
          </div>

          {/* 1. SIZES & PROMOTIONS WITH HOURLY DURATION */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-purple-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" />
                <span>Copos & Promoções Temporárias</span>
              </h3>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                O cliente visualiza o desconto e o contador de tempo restante
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {editableMenu.sizes.map(size => {
                const basePrice = size.originalPrice ?? size.price;
                const discount = size.discountPercent || 0;
                const hasDiscount = discount > 0;
                const savings = basePrice - size.price;
                const remaining = size.discountExpiresAt ? getRemainingHoursText(size.discountExpiresAt) : null;

                return (
                  <div
                    key={size.id}
                    className={`p-4 rounded-3xl border-2 transition-all space-y-3 ${
                      !size.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-60'
                        : hasDiscount
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50/20 dark:bg-amber-950/20 shadow-md ring-2 ring-amber-400/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 bg-white dark:bg-slate-800/40'
                    }`}
                  >
                    {/* Size Top Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-base text-slate-900 dark:text-white">{size.name}</span>
                        {hasDiscount && (
                          <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                            <Flame className="w-3 h-3 fill-white" />
                            {discount}% OFF
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleToggleItemAvailability('sizes', size.id)}
                        className={`text-xs px-2.5 py-1 rounded-full font-black transition-colors cursor-pointer ${
                          size.available ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300'
                        }`}
                      >
                        {size.available ? 'Disponível' : 'Pausado'}
                      </button>
                    </div>

                    {/* Inputs: Normal Price & Discount */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Preço Normal (R$)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          value={basePrice}
                          onChange={e => handleSizeOriginalPriceChange(size.id, parseFloat(e.target.value) || 0)}
                          className="w-full text-sm font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Desconto (% OFF)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="90"
                          value={discount}
                          onChange={e => handleSizeDiscountChange(size.id, parseInt(e.target.value) || 0)}
                          className="w-full text-sm font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-purple-900 dark:text-amber-300"
                        />
                      </div>
                    </div>

                    {/* Quick Discount Shortcut Buttons */}
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block mb-1">Porcentagem de desconto:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[0, 10, 15, 20, 25, 30].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => handleSizeDiscountChange(size.id, pct)}
                            className={`text-[11px] px-2.5 py-1 rounded-lg font-black transition-all cursor-pointer ${
                              discount === pct
                                ? 'bg-amber-400 text-purple-950 shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {pct === 0 ? 'Sem desc.' : `${pct}%`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* TEMPORARY DISCOUNT: DURATION IN HOURS */}
                    {hasDiscount && (
                      <div className="p-3 bg-purple-50/80 dark:bg-purple-950/40 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-purple-950 dark:text-purple-300 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                            Duração Temporária (em Horas)
                          </span>
                          {size.discountHours ? (
                            <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 rounded-full">
                              Fixado: {size.discountHours}h
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full">
                              Sem prazo
                            </span>
                          )}
                        </div>

                        {/* Preset duration buttons in hours */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[
                            { label: 'Sem prazo', hours: null },
                            { label: '12 Horas', hours: 12 },
                            { label: '24 Horas (1 dia)', hours: 24 },
                            { label: '48 Horas (2 dias)', hours: 48 },
                            { label: '72 Horas (3 dias)', hours: 72 }
                          ].map(item => {
                            const isSelected = size.discountHours === item.hours;
                            return (
                              <button
                                key={item.label}
                                type="button"
                                onClick={() => handleSizeDiscountDurationChange(size.id, item.hours)}
                                className={`text-[10px] px-2.5 py-1 rounded-lg font-black transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-purple-800 dark:bg-purple-700 text-white shadow-xs'
                                    : 'bg-white dark:bg-slate-800 hover:bg-purple-100 dark:hover:bg-slate-700 text-purple-900 dark:text-purple-300 border border-purple-200 dark:border-slate-700'
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Timer remaining preview */}
                        {remaining && (
                          <div className="pt-1 flex items-center justify-between text-[11px] font-bold text-purple-900 dark:text-purple-300 border-t border-purple-200/60 dark:border-purple-900/60">
                            <span>⏳ Validade ativa:</span>
                            <span className="bg-amber-400 text-purple-950 px-2 py-0.5 rounded-md font-black">
                              {remaining}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Resulting Price Banner & Clear Button */}
                    <div className={`p-2.5 rounded-2xl flex items-center justify-between text-xs ${
                      hasDiscount ? 'bg-amber-100/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-purple-950 dark:text-amber-200 font-bold' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700'
                    }`}>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Preço Final ao Cliente:</span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-black text-base text-purple-950 dark:text-amber-400">{formatCurrency(size.price)}</span>
                          {hasDiscount && (
                            <span className="line-through text-slate-400 dark:text-slate-500 text-[11px]">{formatCurrency(basePrice)}</span>
                          )}
                        </div>
                      </div>

                      {hasDiscount ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full font-black block">
                            Cliente economiza {formatCurrency(savings)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleClearDiscount(size.id)}
                            className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Remover Desconto</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. ADICIONAIS ESPECIAIS (PAGOS) */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="font-black text-sm text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Preços dos Adicionais Especiais</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {editableMenu.premiumToppings.map(item => (
                <div key={item.id} className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-100">{item.name}</span>
                    <button
                      onClick={() => handleToggleItemAvailability('premiumToppings', item.id)}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black transition-colors cursor-pointer ${
                        item.available ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300'
                      }`}
                    >
                      {item.available ? 'Disponível' : 'Pausado'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">Valor: R$</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={item.price}
                      onChange={e => handlePremiumToppingPriceChange(item.id, parseFloat(e.target.value) || 0)}
                      className="w-full text-xs font-bold p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. BASES */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="font-black text-sm text-purple-900 dark:text-amber-300 uppercase tracking-wider">Bases de Açaí / Cupuaçu</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {editableMenu.bases.map(base => (
                <div key={base.id} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-100">{base.name}</span>
                  <button
                    onClick={() => handleToggleItemAvailability('bases', base.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-black transition-colors cursor-pointer ${
                      base.available ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {base.available ? 'OK' : 'Falta'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 4. ACOMPANHAMENTOS GRÁTIS */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="font-black text-sm text-purple-900 dark:text-amber-300 uppercase tracking-wider">Acompanhamentos Grátis</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {editableMenu.freeToppings.map(item => (
                <div key={item.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mr-2">{item.name}</span>
                  <button
                    onClick={() => handleToggleItemAvailability('freeToppings', item.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors cursor-pointer ${
                      item.available ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {item.available ? 'OK' : 'Falta'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 5. CALDAS */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="font-black text-sm text-purple-900 dark:text-amber-300 uppercase tracking-wider">Caldas & Coberturas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {editableMenu.syrups.map(item => (
                <div key={item.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mr-2">{item.name}</span>
                  <button
                    onClick={() => handleToggleItemAvailability('syrups', item.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors cursor-pointer ${
                      item.available ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {item.available ? 'OK' : 'Falta'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 6. FRUTAS FRESCAS */}
          {editableMenu.fruits && editableMenu.fruits.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <h3 className="font-black text-sm text-purple-900 dark:text-amber-300 uppercase tracking-wider">Frutas Frescas</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {editableMenu.fruits.map(item => (
                  <div key={item.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mr-2">{item.name}</span>
                    <button
                      onClick={() => handleToggleItemAvailability('fruits', item.id)}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors cursor-pointer ${
                        item.available ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300'
                      }`}
                    >
                      {item.available ? 'OK' : 'Falta'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Save Button Reminder */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              onClick={handleSaveMenu}
              disabled={savingMenu}
              className={`py-3.5 px-7 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg active:scale-98 transition-all cursor-pointer ${
                menuSavedFeedback
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : hasUnsavedMenuChanges
                    ? 'bg-amber-400 hover:bg-amber-500 text-purple-950 shadow-amber-400/30 ring-2 ring-amber-300 animate-pulse'
                    : 'bg-purple-800 hover:bg-purple-900 text-white shadow-purple-900/20'
              }`}
            >
              {menuSavedFeedback ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Cardápio Salvo com Sucesso!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{savingMenu ? 'Salvando...' : hasUnsavedMenuChanges ? 'Salvar Alterações de Preço Pendentes' : 'Salvar Alterações de Preço'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: CONTROLE DE ESTOQUE (FOCO EXCLUSIVO EM EMBALAGENS) */}
      {activeTab === 'ESTOQUE' && (
        <div className="space-y-5">
          {/* Header & Quick Actions */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-slate-800 dark:text-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-purple-700 dark:text-purple-400" />
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Estoque de Embalagens & Copos</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sincronizado em tempo real: cada copo ou barca comprado pelo cliente deduz automaticamente 1 unidade do estoque.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadInventory}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${inventoryLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>

              <button
                type="button"
                onClick={() => setNewItemModal(true)}
                className="px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-purple-950/20 active:scale-98 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Embalagem</span>
              </button>
            </div>
          </div>

          {/* KPI Cards de Estoque */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 flex items-center justify-center shrink-0">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Total de Embalagens</span>
                <div className="text-lg font-black text-slate-900 dark:text-white">{totalPackagingUnits} un</div>
                <span className="text-[10px] text-slate-400">{inventory.length} tamanhos cadastrados</span>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
              lowStockItems.length > 0 
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-2 ring-amber-300/30' 
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                lowStockItems.length > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              }`}>
                {lowStockItems.length > 0 ? <AlertTriangle className="w-5 h-5" /> : <PackageCheck className="w-5 h-5" />}
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Estoque Baixo / Alerta</span>
                <div className={`text-lg font-black ${lowStockItems.length > 0 ? 'text-amber-950 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                  {lowStockItems.length > 0 ? `${lowStockItems.length} embalagens acabando!` : 'Tudo abastecido'}
                </div>
                <span className="text-[10px] text-slate-400">Abaixo do mínimo recomendado</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Baixa Automática</span>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Sincronizado com Pedidos ⚡</span>
                </div>
                <span className="text-[10px] text-slate-400">Deduz a cada venda aprovada</span>
              </div>
            </div>
          </div>

          {/* Grid de Itens do Estoque de Embalagens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredInventory.map(item => {
              const isLow = item.quantity <= item.min_alert_quantity;

              return (
                <div
                  key={item.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 transition-all flex flex-col justify-between gap-4 shadow-xs ${
                    isLow 
                      ? 'border-amber-400 dark:border-amber-500 bg-amber-50/20 dark:bg-amber-950/20 ring-2 ring-amber-400/20' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-purple-300'
                  }`}
                >
                  {/* Top: Nome e Categoria */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-black text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded-full uppercase tracking-wider inline-block">
                        Embalagem
                      </span>
                      <h3 className="font-black text-sm text-slate-900 dark:text-white mt-1.5 leading-snug" title={item.name}>
                        {item.name}
                      </h3>
                      {item.supplier && (
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={`Fornecedor: ${item.supplier}`}>
                          Fornecedor: {item.supplier}
                        </p>
                      )}
                    </div>

                    {isLow && (
                      <span className="bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse shrink-0">
                        <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        Baixo
                      </span>
                    )}
                  </div>

                  {/* Contador de Quantidade e Botões Rápidos */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 flex flex-col gap-3">
                    {/* Linha do Saldo com toque para editar */}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400 block">
                          Saldo Atual
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">Toque para editar</span>
                      </div>

                      {editingItemId === item.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const num = Number(editingItemQty);
                            if (!isNaN(num)) {
                              handleSetQuantity(item, num);
                            }
                            setEditingItemId(null);
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="number"
                            min="0"
                            step="1"
                            autoFocus
                            value={editingItemQty}
                            onChange={(e) => setEditingItemQty(e.target.value)}
                            onBlur={() => {
                              const num = Number(editingItemQty);
                              if (!isNaN(num)) {
                                handleSetQuantity(item, num);
                              }
                              setEditingItemId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditingItemId(null);
                            }}
                            className="w-18 px-2 py-1 text-center font-mono font-black text-base bg-white dark:bg-slate-900 border-2 border-purple-600 rounded-xl text-purple-950 dark:text-amber-300 focus:outline-none shadow-xs"
                          />
                          <button
                            type="submit"
                            className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center cursor-pointer shadow-xs"
                            title="Confirmar"
                          >
                            <Check className="w-3.5 h-3.5 text-white" />
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItemId(item.id);
                            setEditingItemQty(String(item.quantity));
                          }}
                          className="group/qty flex items-baseline gap-1.5 bg-white dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 transition-all cursor-pointer shadow-2xs"
                          title="Clique para digitar o número exato"
                        >
                          <span className="text-2xl font-black text-purple-950 dark:text-amber-300 font-mono tracking-tight group-hover/qty:text-purple-700 dark:group-hover/qty:text-amber-400 transition-colors">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{item.unit}</span>
                          <Pencil className="w-3 h-3 text-slate-400 group-hover/qty:text-purple-600 dark:group-hover/qty:text-amber-400 transition-colors ml-0.5" />
                        </button>
                      )}
                    </div>

                    {/* Botões -10, -1, +1, +10 com Grid de 4 Colunas (100% contidos na caixa!) */}
                    <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/50">
                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(item, -10)}
                        className="h-8.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 hover:border-red-300 dark:hover:border-red-800 text-xs font-black text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs"
                        title="Diminuir 10 unidades"
                      >
                        -10
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(item, -1)}
                        className="h-8.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 hover:border-red-300 dark:hover:border-red-800 text-xs font-black text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs"
                        title="Diminuir 1 unidade"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(item, 1)}
                        className="h-8.5 rounded-xl bg-purple-900 hover:bg-purple-950 dark:bg-purple-800 dark:hover:bg-purple-700 text-amber-300 text-xs font-black flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs"
                        title="Adicionar 1 unidade"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(item, 10)}
                        className="h-8.5 rounded-xl bg-purple-900 hover:bg-purple-950 dark:bg-purple-800 dark:hover:bg-purple-700 text-amber-300 text-xs font-black flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs"
                        title="Adicionar 10 unidades (1 pacote)"
                      >
                        +10
                      </button>
                    </div>
                  </div>

                  {/* Alerta de Estoque Mínimo */}
                  {isLow ? (
                    <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Comprar mais! Mínimo sugerido: {item.min_alert_quantity} {item.unit}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 dark:text-slate-400 flex items-center justify-between px-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>Alerta mínimo: <strong className="text-slate-600 dark:text-slate-300">{item.min_alert_quantity} {item.unit}</strong></span>
                      {item.cost_price ? <span>Custo: <strong className="text-slate-600 dark:text-slate-300">{formatCurrency(item.cost_price)}</strong></span> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Modal de Cadastro de Nova Embalagem */}
          {newItemModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-purple-200 dark:border-purple-900/50 space-y-4 animate-in zoom-in-95">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-purple-700 dark:text-purple-400" />
                    <span>Cadastrar Nova Embalagem</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setNewItemModal(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateInventoryItem} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nome da Embalagem *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Copo Descartável 400ml"
                      value={newItemForm.name}
                      onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Unidade</label>
                      <input
                        type="text"
                        placeholder="Ex: un, caixas, pacotes"
                        value={newItemForm.unit}
                        onChange={e => setNewItemForm({ ...newItemForm, unit: e.target.value })}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Quantidade Inicial</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={newItemForm.quantity}
                        onChange={e => setNewItemForm({ ...newItemForm, quantity: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Alerta Mínimo</label>
                      <input
                        type="number"
                        min="1"
                        value={newItemForm.min_alert_quantity}
                        onChange={e => setNewItemForm({ ...newItemForm, min_alert_quantity: parseFloat(e.target.value) || 1 })}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Custo Unitário (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newItemForm.cost_price}
                        onChange={e => setNewItemForm({ ...newItemForm, cost_price: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Fornecedor (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: Embalagens Silva, Distribuidora"
                      value={newItemForm.supplier}
                      onChange={e => setNewItemForm({ ...newItemForm, supplier: e.target.value })}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setNewItemModal(false)}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
                    >
                      Salvar Embalagem
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONFIGURAÇÕES DA LOJA */}
      {activeTab === 'CONFIGURACOES' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
          <form onSubmit={handleSaveSettings} className="max-w-xl space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Configurações Gerais da Loja</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ajuste os dados de pagamento, entrega e horário.</p>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white block">Status de Atendimento</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {localSettings.isOpen ? 'Os clientes podem fazer pedidos normalmente.' : 'Loja fechada temporariamente.'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleQuickToggleStoreOpen}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 ${
                  localSettings.isOpen ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {localSettings.isOpen ? 'Loja Aberta' : 'Loja Fechada'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nome da Empresa</label>
                <input
                  type="text"
                  value={localSettings.storeName}
                  onChange={e => setLocalSettings({ ...localSettings, storeName: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-purple-600 dark:focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">WhatsApp da Loja</label>
                <input
                  type="text"
                  value={localSettings.whatsapp}
                  onChange={e => setLocalSettings({ ...localSettings, whatsapp: e.target.value })}
                  placeholder="5511999999999"
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-purple-600 dark:focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Chave Pix</label>
                <input
                  type="text"
                  value={localSettings.pixKey}
                  onChange={e => setLocalSettings({ ...localSettings, pixKey: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-purple-600 dark:focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tipo da Chave Pix</label>
                <input
                  type="text"
                  value={localSettings.pixKeyType}
                  onChange={e => setLocalSettings({ ...localSettings, pixKeyType: e.target.value })}
                  placeholder="Ex: CPF, Telefone, E-mail"
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-purple-600 dark:focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Taxas de Entrega por Bairro</label>
                <div className="w-full text-xs p-3 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/60 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold">
                  🛵 Automática por bairro (R$ 4,00 a R$ 10,00)
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tempo Estimado de Espera</label>
                <input
                  type="text"
                  value={localSettings.estimatedTime}
                  onChange={e => setLocalSettings({ ...localSettings, estimatedTime: e.target.value })}
                  placeholder="Ex: 30 - 45 min"
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-purple-600 dark:focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Endereço de Retirada</label>
              <input
                type="text"
                value={localSettings.address}
                onChange={e => setLocalSettings({ ...localSettings, address: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-purple-600 dark:focus:border-purple-500"
              />
            </div>

            {/* SEGURANÇA DO PAINEL */}
            <div className="bg-purple-50 dark:bg-purple-950/40 p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-base">🔐</span>
                <h3 className="text-xs font-black text-purple-950 dark:text-purple-300 uppercase tracking-wider">
                  Segurança do Painel Administrativo
                </h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  PIN de Acesso Principal (Senha do Painel)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={localSettings.adminPin ?? ''}
                  onChange={e => setLocalSettings({ ...localSettings, adminPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ex: 1234"
                  className="w-full text-sm font-bold p-2.5 rounded-xl border border-purple-300 dark:border-purple-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
                <span className="text-[10px] text-purple-700 dark:text-purple-400 block mt-1">
                  Código numérico exclusivo exigido para desbloquear e gerenciar o painel /admin.
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="bg-purple-800 hover:bg-purple-900 text-white font-black py-3 px-6 rounded-xl text-xs transition-colors cursor-pointer shadow-md disabled:opacity-50"
            >
              {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </form>
        </div>
      )}

      {selectedOrderForPrint && (
        <PrintReceipt
          order={selectedOrderForPrint}
          settings={settings}
          onClose={() => setSelectedOrderForPrint(null)}
        />
      )}

      {/* Modal de Confirmação de Recusa do Pedido */}
      {rejectModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-red-200 dark:border-red-900/50 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white p-5 text-center relative">
              <div className="w-12 h-12 rounded-2xl bg-white/20 mx-auto flex items-center justify-center mb-2">
                <XCircle className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-black text-lg">Não Aceitar Pedido</h3>
              <p className="text-red-100 text-xs font-mono font-bold mt-0.5">{rejectModalOrder.id} • {rejectModalOrder.customerName}</p>
            </div>

            {/* Conteúdo */}
            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-2">
                  Selecione o motivo da recusa (o cliente verá este aviso imediatamente):
                </label>
                <div className="space-y-1.5">
                  {[
                    'Ingredientes ou produtos esgotados no momento',
                    'Endereço fora da nossa área de entrega',
                    'Alta demanda / Fila de espera muito longa',
                    'Loja precisou encerrar o atendimento mais cedo',
                    'OUTRO'
                  ].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRejectionReason(option)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center justify-between ${
                        rejectionReason === option
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 font-bold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{option === 'OUTRO' ? 'Outro motivo (digitar)' : option}</span>
                      {rejectionReason === option && <Check className="w-4 h-4 text-red-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {rejectionReason === 'OUTRO' && (
                <div>
                  <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                    Digite o motivo que será mostrado ao cliente:
                  </label>
                  <textarea
                    value={customRejectionReason}
                    onChange={(e) => setCustomRejectionReason(e.target.value)}
                    placeholder="Ex: Acabou o cupuaçu e as barcas de 1L..."
                    rows={2}
                    className="w-full p-2.5 rounded-xl border border-red-300 dark:border-red-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-red-400 outline-none resize-none"
                  />
                </div>
              )}

              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 p-3 rounded-2xl text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Aviso Importante</span>
                </p>
                <p>
                  Ao confirmar, o status mudará para Cancelado e o cliente receberá na hora a notificação com este motivo em tempo real no celular dele.
                </p>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                disabled={isSubmittingReject}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmittingReject}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs transition-colors cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isSubmittingReject ? (
                  <span>Recusando...</span>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Confirmar Recusa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Barra Flutuante de Salvamento Rápido de Preços & Descontos */}
      {hasUnsavedMenuChanges && (
        <div className="fixed bottom-5 left-4 right-4 max-w-xl mx-auto bg-gradient-to-r from-purple-950 via-purple-900 to-purple-950 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border-2 border-amber-400 flex items-center justify-between gap-3 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-purple-950 flex items-center justify-center font-black shrink-0 shadow-md">
              <Sparkles className="w-5 h-5 text-purple-950 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-xs sm:text-sm text-white truncate">Preços ou Descontos alterados!</div>
              <div className="text-[10px] sm:text-xs text-purple-200 truncate">Clique em salvar para aplicar instantaneamente na tela do cliente.</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditableMenu(menu)}
              className="px-2.5 py-2 text-[11px] font-bold text-purple-200 hover:text-white transition-colors cursor-pointer"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleSaveMenu}
              disabled={savingMenu}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-purple-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingMenu ? 'Salvando...' : 'Salvar Agora'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
