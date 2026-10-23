import { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { SizeItem, CartItem, Order, MenuData, StoreSettings, CustomerProfile } from './types';
import { formatCurrency } from './utils/format';
import { isDiscountActive, getRemainingHoursText, getSizeLimits } from './utils/promo';
import { getSocket } from './utils/socket';
import { useTheme } from './utils/theme';
import { ThemeToggle } from './components/ThemeToggle';
import { MonteAcaiModal } from './components/MonteAcaiModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { CustomerDrawer } from './components/CustomerDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminPanel } from './components/AdminPanel';
import { AdminLogin } from './components/AdminLogin';
import { isSupabaseConfigured } from './utils/supabase';
import { 
  fetchStoreSettings, 
  fetchMenuData, 
  saveStoreSettings, 
  saveMenuData,
  subscribeToStoreSettings,
  subscribeToMenuData,
  fetchOrderById,
  subscribeToOrder,
  adminLogout
} from './services/supabaseService';
import { playCancellationAlert } from './utils/audio';
import { 
  Clock, 
  MapPin, 
  Sparkles, 
  Plus, 
  MessageCircle, 
  Store, 
  Layers, 
  ChevronRight, 
  Heart, 
  Star, 
  Flame, 
  ShoppingBag,
  XCircle,
  User,
  X,
  ArrowRight,
  Search,
  RefreshCw
} from 'lucide-react';

const INITIAL_SETTINGS: StoreSettings = {
  storeName: "Açaí do Luky",
  isOpen: true,
  whatsapp: "5513991886260",
  pixKey: "lukyacai@exemplo.com",
  pixKeyType: "Chave E-mail",
  deliveryFee: 5.00,
  estimatedTime: "30 - 45 min",
  address: "R. Eufrozina maria da conceição, 119",
  minOrderValue: 12.00,
  adminPin: "1234"
};

const INITIAL_MENU: MenuData = {
  sizes: [
    { 
      id: "size-300", 
      name: "Copo 300ml", 
      description: "Perfeito para matar aquela vontade de forma rápida e refrescante.", 
      price: 14.00, 
      originalPrice: 14.00, 
      discountPercent: 0, 
      maxComplements: 2,
      maxFruits: 1,
      maxSyrups: 1,
      maxFreeToppings: 3, 
      available: true 
    },
    { 
      id: "size-500", 
      name: "Copo 500ml", 
      description: "O queridinho da galera! Equilíbrio ideal entre açaí e acompanhamentos.", 
      price: 20.00, 
      originalPrice: 20.00, 
      discountPercent: 0, 
      maxComplements: 2,
      maxFruits: 2,
      maxSyrups: 1,
      maxFreeToppings: 4, 
      available: true 
    },
    { 
      id: "size-700", 
      name: "Copo 700ml", 
      description: "Tamanho caprichado para quem ama açaí de verdade.", 
      price: 25.00, 
      originalPrice: 25.00, 
      discountPercent: 0, 
      maxComplements: 3,
      maxFruits: 2,
      maxSyrups: 1,
      maxFreeToppings: 5, 
      available: true 
    },
    { 
      id: "size-1000", 
      name: "Marmita G 1,1L", 
      description: "Fartura total de 1,1L para dividir com a galera ou matar a larica!", 
      price: 35.00, 
      originalPrice: 35.00, 
      discountPercent: 0, 
      maxComplements: 3,
      maxFruits: 3,
      maxSyrups: 1,
      maxFreeToppings: 6, 
      available: true 
    }
  ],
  bases: [
    { id: "base-tradicional", name: "Açaí Tradicional Cremoso", available: true },
    { id: "base-cupuacu", name: "Cupuaçu Puro Cremoso", available: true },
    { id: "base-misto", name: "Casadinho (Açaí e Cupuaçu)", available: true }
  ],
  syrups: [
    { id: "syrup-condensado", name: "Leite Condensado", available: true },
    { id: "syrup-chocolate", name: "Calda de Chocolate", available: true },
    { id: "syrup-morango", name: "Calda de Morango", available: true },
    { id: "syrup-caramelo", name: "Calda de Caramelo", available: true }
  ],
  freeToppings: [
    { id: "free-granola", name: "Granola", available: true },
    { id: "free-leite-po", name: "Leite em Pó", available: true },
    { id: "free-sucrilhos", name: "Sucrilhos", available: true },
    { id: "free-disqueti", name: "Disqueti", available: true },
    { id: "free-pacoca", name: "Paçoca", available: true },
    { id: "free-chocoball", name: "Chocoball", available: true },
    { id: "free-jujuba", name: "Jujuba", available: true },
    { id: "free-amendoim", name: "Amendoim Triturado", available: true },
    { id: "fruit-banana", name: "Banana", available: true },
    { id: "fruit-morango", name: "Morango", available: true },
    { id: "fruit-kiwi", name: "Kiwi", available: true },
    { id: "fruit-manga", name: "Manga", available: true },
    { id: "fruit-uva", name: "Uva", available: true }
  ],
  fruits: [
    { id: "fruit-banana", name: "Banana", available: true },
    { id: "fruit-morango", name: "Morango", available: true },
    { id: "fruit-kiwi", name: "Kiwi", available: true },
    { id: "fruit-manga", name: "Manga", available: true },
    { id: "fruit-uva", name: "Uva", available: true }
  ],
  premiumToppings: [
    { id: "prem-nutella", name: "Nutella Pura Original", price: 6.00, available: true }
  ]
};

const CACHED_SETTINGS_KEY = 'luky_cached_settings';
const CACHED_MENU_KEY = 'luky_cached_menu';

function getInitialStoreSettings(): StoreSettings {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(CACHED_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            ...INITIAL_SETTINGS,
            ...parsed,
            storeName: String(parsed.storeName || INITIAL_SETTINGS.storeName),
            whatsapp: String(parsed.whatsapp || INITIAL_SETTINGS.whatsapp),
            estimatedTime: String(parsed.estimatedTime || INITIAL_SETTINGS.estimatedTime)
          };
        }
      }
    } catch {}
  }
  return INITIAL_SETTINGS;
}

function getInitialMenuData(): MenuData {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(CACHED_MENU_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sizes) && parsed.sizes.length > 0) {
          return {
            ...INITIAL_MENU,
            ...parsed,
            sizes: parsed.sizes,
            bases: Array.isArray(parsed.bases) ? parsed.bases : INITIAL_MENU.bases,
            syrups: Array.isArray(parsed.syrups) ? parsed.syrups : INITIAL_MENU.syrups,
            freeToppings: Array.isArray(parsed.freeToppings) ? parsed.freeToppings : INITIAL_MENU.freeToppings,
            fruits: Array.isArray(parsed.fruits) ? parsed.fruits : INITIAL_MENU.fruits,
            premiumToppings: Array.isArray(parsed.premiumToppings) ? parsed.premiumToppings : INITIAL_MENU.premiumToppings
          };
        }
      }
    } catch {}
  }
  return INITIAL_MENU;
}

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [settings, setSettings] = useState<StoreSettings>(getInitialStoreSettings);
  const [menu, setMenu] = useState<MenuData>(getInitialMenuData);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        return !localStorage.getItem(CACHED_SETTINGS_KEY);
      }
    } catch {}
    return true;
  });

  // Admin Auth State: Exige o PIN toda vez que entra na aba de admin (desbloqueio por sessão/aba)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('luky_admin_unlocked') === 'true';
    } catch {
      return false;
    }
  });

  // Customer State
  const [selectedSizeToBuild, setSelectedSizeToBuild] = useState<SizeItem | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('luky_cart_items');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {}
    return [];
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('luky_cached_active_order');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      }
    } catch {}
    return null;
  });
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isSearchOrderOpen, setIsSearchOrderOpen] = useState(false);
  const [searchOrderCode, setSearchOrderCode] = useState('');
  const [searchOrderLoading, setSearchOrderLoading] = useState(false);
  const [searchOrderError, setSearchOrderError] = useState('');
  const [customer, setCustomer] = useState<CustomerProfile | null>(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('luky_active_customer');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      }
    } catch {}
    return null;
  });
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);

  // Fetch settings & menu from Supabase (ou fallback para backend local)
  const fetchData = async () => {
    try {
      if (isSupabaseConfigured) {
        const [supSettings, supMenu] = await Promise.all([
          fetchStoreSettings(),
          fetchMenuData()
        ]);
        if (supSettings) {
          setSettings(supSettings);
          localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(supSettings));
        }
        if (supMenu) {
          setMenu(supMenu);
          localStorage.setItem(CACHED_MENU_KEY, JSON.stringify(supMenu));
        }
        setIsInitialLoading(false);
        return;
      }

      const [resSettings, resMenu] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/menu')
      ]);
      if (resSettings.ok) {
        const dataSettings = await resSettings.json();
        setSettings(dataSettings);
        localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(dataSettings));
      }
      if (resMenu.ok) {
        const dataMenu = await resMenu.json();
        setMenu(dataMenu);
        localStorage.setItem(CACHED_MENU_KEY, JSON.stringify(dataMenu));
      }
      setIsInitialLoading(false);
    } catch {
      console.warn('Backend inicializando, usando dados padrão.');
      setIsInitialLoading(false);
    }
  };

  // Restore active order from localStorage if exists
  useEffect(() => {
    // Retorno oficial do Mercado Pago (Redirecionamento da tela ou app do Mercado Pago)
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const mpStatus = params.get('mp_status') || params.get('collection_status') || params.get('status');
        const orderIdFromUrl = params.get('order_id') || params.get('external_reference');

        if (orderIdFromUrl) {
          localStorage.setItem('luky_active_order_id', orderIdFromUrl);

          const handleMpOrder = (order: Order | null) => {
            if (order) {
              if (mpStatus === 'approved') {
                order = {
                  ...order,
                  paymentDetails: {
                    ...order.paymentDetails,
                    isPaid: true,
                    mercadoPagoStatus: 'approved'
                  }
                };
              }
              setActiveOrder(order);
              try {
                localStorage.setItem('luky_cached_active_order', JSON.stringify(order));
              } catch {}
              setIsTrackingModalOpen(true);
            }
          };

          if (isSupabaseConfigured) {
            fetchOrderById(orderIdFromUrl).then(handleMpOrder).catch(() => {});
          } else {
            fetch(`/api/orders/${orderIdFromUrl}`).then(r => r.ok ? r.json() : null).then(handleMpOrder).catch(() => {});
          }

          // Limpa a URL para remover os parâmetros da barra de endereço
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
      } catch {}
    }

    let savedOrderId: string | null = null;
    try {
      savedOrderId = localStorage.getItem('luky_active_order_id');
    } catch {}

    if (savedOrderId) {
      const applyOrder = (order: Order | null) => {
        if (order) {
          setActiveOrder(order);
          try {
            localStorage.setItem('luky_cached_active_order', JSON.stringify(order));
          } catch {}
          if (order.status !== 'CONCLUIDO') {
            setIsTrackingModalOpen(true);
          }
        }
      };

      if (isSupabaseConfigured) {
        fetchOrderById(savedOrderId)
          .then(order => {
            if (order) {
              applyOrder(order);
            } else {
              fetch(`/api/orders/${savedOrderId}`)
                .then(res => res.ok ? res.json() : null)
                .then(applyOrder)
                .catch(() => {});
            }
          })
          .catch(() => {
            fetch(`/api/orders/${savedOrderId}`)
              .then(res => res.ok ? res.json() : null)
              .then(applyOrder)
              .catch(() => {});
          });
      } else {
        fetch(`/api/orders/${savedOrderId}`)
          .then(res => res.ok ? res.json() : null)
          .then(applyOrder)
          .catch(() => {});
      }
    }
  }, []);

  // Monitora alterações em tempo real no pedido ativo do cliente
  useEffect(() => {
    if (!activeOrder?.id) return;

    const handleActiveOrderUpdate = (updated: Order) => {
      if (updated.id === activeOrder.id) {
        if (activeOrder.status !== 'CANCELADO' && updated.status === 'CANCELADO') {
          playCancellationAlert();
          setIsTrackingModalOpen(true);
        }
        setActiveOrder(updated);
      }
    };

    const socket = getSocket();
    socket.emit('track_order', activeOrder.id);
    socket.on('my_order_update', handleActiveOrderUpdate);
    socket.on('order_status_updated', handleActiveOrderUpdate);

    let unsubSupabase = () => {};
    if (isSupabaseConfigured) {
      unsubSupabase = subscribeToOrder(activeOrder.id, handleActiveOrderUpdate);
    }

    return () => {
      socket.off('my_order_update', handleActiveOrderUpdate);
      socket.off('order_status_updated', handleActiveOrderUpdate);
      unsubSupabase();
    };
  }, [activeOrder?.id, activeOrder?.status]);

  // Persiste itens não confirmados da sacola para não perder ao atualizar a página
  useEffect(() => {
    try {
      if (cartItems.length > 0) {
        localStorage.setItem('luky_cart_items', JSON.stringify(cartItems));
      } else {
        localStorage.removeItem('luky_cart_items');
      }
    } catch {
      // ignore
    }
  }, [cartItems]);

  useEffect(() => {
    fetchData();

    // Supabase Realtime subscriptions
    if (isSupabaseConfigured) {
      const unsubSettings = subscribeToStoreSettings(newSettings => {
        setSettings(newSettings);
        localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(newSettings));
      });
      const unsubMenu = subscribeToMenuData(newMenu => {
        setMenu(newMenu);
        localStorage.setItem(CACHED_MENU_KEY, JSON.stringify(newMenu));
      });
      return () => {
        unsubSettings();
        unsubMenu();
      };
    }

    const socket = getSocket();
    const handleSettingsUpdated = (newSettings: StoreSettings) => {
      setSettings(newSettings);
      localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(newSettings));
    };
    const handleMenuUpdated = (newMenu: MenuData) => {
      setMenu(newMenu);
      localStorage.setItem(CACHED_MENU_KEY, JSON.stringify(newMenu));
    };

    socket.on('settings_updated', handleSettingsUpdated);
    socket.on('menu_updated', handleMenuUpdated);

    return () => {
      socket.off('settings_updated', handleSettingsUpdated);
      socket.off('menu_updated', handleMenuUpdated);
    };
  }, []);

  const handleUpdateSettings = async (newSettings: StoreSettings): Promise<{ success: boolean; error?: string }> => {
    let result = { success: true };
    if (isSupabaseConfigured) {
      result = await saveStoreSettings(newSettings);
      if (!result.success) {
        return result;
      }
    }
    setSettings(newSettings);
    localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(newSettings));
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch {
      // Servidor local offline, Supabase já persistiu
    }
    return result;
  };

  const handleUpdateMenu = async (newMenu: MenuData): Promise<boolean> => {
    setMenu(newMenu);
    localStorage.setItem(CACHED_MENU_KEY, JSON.stringify(newMenu));
    let success = true;
    if (isSupabaseConfigured) {
      success = await saveMenuData(newMenu);
    }
    try {
      await fetch('/api/menu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMenu)
      });
    } catch {
      // Servidor local offline, Supabase já persistiu
    }
    return success;
  };

  const handleAddToCart = useCallback((item: CartItem) => {
    setCartItems(prev => [...prev, item]);
    setIsCartOpen(true);
  }, []);

  const handleUpdateQuantity = useCallback((itemId: string, delta: number) => {
    setCartItems(prev => {
      return prev
        .map(i => {
          if (i.id === itemId) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter((i): i is CartItem => i !== null);
    });
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setCartItems(prev => prev.filter(i => i.id !== itemId));
  }, []);

  const handleReorder = useCallback((items: CartItem[]) => {
    setCartItems(prev => [...prev, ...items]);
    setIsCartOpen(true);
  }, []);

  const handleTrackCustomerOrder = useCallback((order: Order) => {
    setActiveOrder(order);
    try {
      localStorage.setItem('luky_active_order_id', order.id);
      localStorage.setItem('luky_cached_active_order', JSON.stringify(order));
    } catch {}
    setIsTrackingModalOpen(true);
  }, []);

  const handleOrderSuccess = useCallback((order: Order) => {
    setCartItems([]);
    try {
      localStorage.removeItem('luky_cart_items');
      localStorage.setItem('luky_active_order_id', order.id);
      localStorage.setItem('luky_cached_active_order', JSON.stringify(order));
    } catch {
      // ignore
    }
    setIsCheckoutOpen(false);
    setIsCartOpen(false);
    setActiveOrder(order);
    setIsTrackingModalOpen(true);
  }, []);

  const handleCloseTracking = useCallback(() => {
    setIsTrackingModalOpen(false);
  }, []);

  const handleNewOrder = useCallback(() => {
    try {
      localStorage.removeItem('luky_active_order_id');
      localStorage.removeItem('luky_cached_active_order');
      localStorage.removeItem('luky_cart_items');
    } catch {
      // ignore
    }
    setActiveOrder(null);
    setIsTrackingModalOpen(false);
    setCartItems([]);
  }, []);

  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchOrderCode.trim();
    if (!q) return;
    setSearchOrderLoading(true);
    setSearchOrderError('');
    try {
      let order: Order | null = null;
      if (isSupabaseConfigured) {
        order = await fetchOrderById(q);
      }
      if (!order) {
        const res = await fetch(`/api/orders/${q}`);
        if (res.ok) order = await res.json();
      }
      if (order) {
        setActiveOrder(order);
        try {
          localStorage.setItem('luky_cached_active_order', JSON.stringify(order));
          localStorage.setItem('luky_active_order_id', order.id);
        } catch {}
        setIsSearchOrderOpen(false);
        setIsTrackingModalOpen(true);
        setSearchOrderCode('');
      } else {
        setSearchOrderError('Pedido não localizado. Verifique se digitou o código completo (ex: PED-12345).');
      }
    } catch {
      setSearchOrderError('Erro ao consultar pedido. Tente novamente.');
    } finally {
      setSearchOrderLoading(false);
    }
  };

  // Observa expiração de sessão do admin
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAdminAuthenticated(false);
    };
    window.addEventListener('luky-admin-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('luky-admin-unauthorized', handleUnauthorized);
  }, []);

  const handleAdminLogout = useCallback(async () => {
    await adminLogout();
    sessionStorage.removeItem('luky_admin_unlocked');
    setIsAdminAuthenticated(false);
  }, []);

  const totalCartCount = useMemo(() => {
    if (!Array.isArray(cartItems)) return 0;
    return cartItems.reduce((acc, i) => acc + (Number(i?.quantity) || 1), 0);
  }, [cartItems]);

  const totalCartPrice = useMemo(() => {
    if (!Array.isArray(cartItems)) return 0;
    return cartItems.reduce((acc, i) => acc + (Number(i?.unitPrice) || 0) * (Number(i?.quantity) || 1), 0);
  }, [cartItems]);

  const getSizeBadge = (sizeId: string, sizeName?: string) => {
    if (sizeId === 'size-1000' || (sizeName && (sizeName.includes('1,1L') || sizeName.includes('1000') || sizeName.toLowerCase().includes('marmita')))) {
      return { text: 'Fartura 🏆', bg: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
    }
    switch (sizeId) {
      case 'size-300':
        return { text: 'Pausa Rápida ⚡', bg: 'bg-purple-100 text-purple-900 border-purple-200' };
      case 'size-500':
        return { text: 'Mais Pedido ⭐', bg: 'bg-amber-400 text-purple-950 font-black border-amber-300 shadow-xs' };
      case 'size-700':
        return { text: 'Caprichado 🔥', bg: 'bg-orange-100 text-orange-900 border-orange-200' };
      case 'size-1000':
        return { text: 'Fartura 🏆', bg: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
      default:
        return { text: 'Especial ✨', bg: 'bg-purple-100 text-purple-900 border-purple-200' };
    }
  };

  return (
    <ErrorBoundary>
      <BrowserRouter>
      <Routes>
        {/* ========================================================= */}
        {/* ROTA 1: CARDÁPIO PÚBLICO DO CLIENTE (/)                   */}
        {/* ========================================================= */}
        <Route
          path="/"
          element={
            <div className="min-h-screen bg-gradient-to-b from-purple-50/50 via-slate-50 to-purple-50/30 dark:from-slate-950 dark:via-purple-950/20 dark:to-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
              {/* Header do Cliente (100% focado na experiência de compra) */}
              <header className="bg-purple-950 text-slate-200 text-xs py-2.5 px-4 border-b border-purple-900/60 sticky top-0 z-40 shadow-md">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img 
                      src="/logo.png" 
                      alt="Logo Açaí do Luky" 
                      className="w-8 h-8 rounded-full object-contain bg-white shadow-xs shrink-0 ring-1 ring-amber-400" 
                    />
                    <span className="font-extrabold text-white tracking-wide flex items-center gap-1.5">
                      <span>{settings.storeName}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      <span className="text-[10px] text-amber-300 font-semibold hidden sm:inline">Delivery Oficial</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botão de Tema Escuro / Claro */}
                    <ThemeToggle isDark={isDark} onToggle={toggleTheme} />

                    {/* Botão permanente para acompanhar pedido ativo ou consultar status */}
                    <button
                      onClick={() => {
                        if (activeOrder) {
                          setIsTrackingModalOpen(true);
                        } else {
                          setIsSearchOrderOpen(true);
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer transition-all ${
                        activeOrder?.status === 'CANCELADO'
                          ? 'bg-red-500 text-white animate-bounce ring-2 ring-red-300'
                          : activeOrder
                          ? 'bg-amber-400 text-purple-950 animate-pulse'
                          : 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                      }`}
                      title={activeOrder ? 'Acompanhar pedido em andamento' : 'Rastrear status de um pedido'}
                    >
                      {activeOrder?.status === 'CANCELADO' ? (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Pedido Não Aceito (Ver Aviso)</span>
                        </>
                      ) : activeOrder ? (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>Acompanhar Pedido</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-300" />
                          <span>Rastrear Pedido</span>
                        </>
                      )}
                    </button>

                    {/* Botão de Conta / Perfil do Cliente */}
                    <button
                      onClick={() => setIsCustomerDrawerOpen(true)}
                      className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        customer
                          ? 'bg-purple-900/90 hover:bg-purple-800 text-white border border-purple-700/60 shadow-xs'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                      title={customer ? `Conectado como ${customer.name || 'Cliente'}` : 'Acessar minha conta'}
                    >
                      <User className="w-3.5 h-3.5 text-amber-300" />
                      {customer ? (
                        <span className="max-w-[100px] truncate">{customer.name ? customer.name.split(' ')[0] : 'Conta'}</span>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Minha Conta</span>
                          <span className="sm:hidden">Entrar</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setIsCartOpen(true)}
                      className="bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-300" />
                      <span>Sacola</span>
                      {totalCartCount > 0 && (
                        <span className="bg-amber-400 text-purple-950 text-[10px] w-4 h-4 rounded-full font-black flex items-center justify-center">
                          {totalCartCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </header>

              {/* Conteúdo Principal do Cliente */}
              <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-28 space-y-6">
                {/* Banner de Aviso de Pedido Não Aceito (se o cliente tiver minimizado o modal) */}
                {activeOrder && activeOrder.status === 'CANCELADO' && !isTrackingModalOpen && (
                  <div 
                    onClick={() => setIsTrackingModalOpen(true)}
                    className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white p-4 sm:p-5 rounded-3xl shadow-xl border-2 border-red-400 flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer hover:opacity-95 transition-all animate-in fade-in slide-in-from-top-2"
                  >
                    <div className="flex items-center gap-3.5 text-center sm:text-left">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                        <XCircle className="w-7 h-7 text-amber-300" />
                      </div>
                      <div>
                        <h3 className="font-black text-base tracking-wide flex items-center justify-center sm:justify-start gap-2">
                          <span>Atenção: Seu pedido #{activeOrder.id} não pôde ser aceito!</span>
                        </h3>
                        <p className="text-xs text-red-100 mt-1 max-w-xl leading-relaxed">
                          {activeOrder.cancellationReason
                            ? `Motivo: "${activeOrder.cancellationReason}"`
                            : 'Infelizmente o estabelecimento não pôde atender seu pedido. Clique para ver detalhes e falar com o lojista.'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 bg-white text-red-700 hover:bg-red-50 px-4 py-2 rounded-2xl font-black text-xs shadow-md transition-colors">
                      Ver Aviso Completo
                    </div>
                  </div>
                )}

                {/* Alerta de Loja Fechada */}
                {!isInitialLoading && !settings.isOpen && (
                  <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white p-4 sm:p-5 rounded-3xl shadow-xl border border-red-500/50 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-3.5 text-center sm:text-left">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                        <Store className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-black text-base tracking-wide flex items-center justify-center sm:justify-start gap-2">
                          <span>Loja Fechada no Momento</span>
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping"></span>
                        </h3>
                        <p className="text-xs text-red-100 mt-1 max-w-xl leading-relaxed">
                          Nosso atendimento está em pausa no momento. Você pode navegar pelo cardápio e montar seu copo, mas novos pedidos só serão aceitos quando a loja reabrir!
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 bg-black/25 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/20 text-xs font-black text-amber-300 flex items-center gap-1.5 shadow-xs">
                      <Clock className="w-4 h-4 text-amber-300" />
                      <span>Volte em breve!</span>
                    </div>
                  </div>
                )}

                {/* Hero Card */}
                <div className="relative overflow-hidden bg-gradient-to-br from-[#471256] via-[#5c1c73] to-[#360942] text-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-purple-800/40">
                  <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-amber-400/10 pointer-events-none" />
                  <div className="absolute right-20 -top-8 w-36 h-36 rounded-full bg-purple-400/15 pointer-events-none" />

                  <div className="relative z-10 space-y-5">
                    {/* Status & WhatsApp */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {isInitialLoading ? (
                          <span className="bg-purple-900/60 text-purple-200 border border-purple-400/30 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-sm animate-pulse">
                            <Clock className="w-3.5 h-3.5 text-amber-300" />
                            <span>Verificando loja...</span>
                          </span>
                        ) : (
                          <span className={`text-xs px-3 py-1 rounded-full font-black flex items-center gap-1.5 shadow-sm ${
                            settings.isOpen 
                              ? 'bg-emerald-500 text-white' 
                              : 'bg-red-500 text-white'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${settings.isOpen ? 'bg-white animate-ping' : 'bg-white'}`} />
                            {settings.isOpen ? 'ABERTO AGORA' : 'FECHADO NO MOMENTO'}
                          </span>
                        )}

                        <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs px-2.5 py-1 rounded-full font-bold hidden sm:flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          100% Puro & Artesanal
                        </span>
                      </div>

                      <a
                        href={`https://wa.me/55${String(settings?.whatsapp || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full border border-white/10 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp da Loja</span>
                      </a>
                    </div>

                    {/* Logo + Headline */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-4 sm:gap-6 pt-1">
                      <div className="relative shrink-0 flex items-center justify-center">
                        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-white p-1 ring-4 ring-amber-400 shadow-2xl flex items-center justify-center overflow-hidden">
                          <img
                            src="/logo.png"
                            alt="Logo Açaí do Luky"
                            className="w-full h-full rounded-full object-contain"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-amber-300 font-black text-xs uppercase tracking-widest flex items-center justify-center sm:justify-start gap-1">
                          <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                          O Mais Gostoso da Região
                        </span>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-sm">
                          {settings.storeName}
                        </h1>
                        <p className="text-purple-200 text-xs sm:text-sm font-medium max-w-lg leading-relaxed">
                          Monte seu copo com os melhores acompanhamentos e peça direto pelo cardápio, sem intermediários!
                        </p>
                      </div>
                    </div>

                    {/* Quick Perks */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 pt-3 border-t border-purple-700/60 text-xs">
                      <div className="bg-purple-900/50 p-2.5 rounded-2xl border border-purple-700/50 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-purple-300 block font-semibold">Preparo Rápido</span>
                          <strong className="text-white text-xs">{settings.estimatedTime}</strong>
                        </div>
                      </div>

                      <div className="bg-purple-900/50 p-2.5 rounded-2xl border border-purple-700/50 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-purple-300 block font-semibold">Entrega & Retirada</span>
                          <strong className="text-white text-xs">Praia Grande</strong>
                        </div>
                      </div>

                      <div className="bg-purple-900/50 p-2.5 rounded-2xl border border-purple-700/50 col-span-2 sm:col-span-1 flex items-center gap-2">
                        <Heart className="w-4 h-4 text-pink-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-purple-300 block font-semibold">Pagamento Fácil</span>
                          <strong className="text-white text-xs">Pix e Cartões Online</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Banner: Como pedir */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-purple-200/80 dark:border-purple-900/40 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-700 text-amber-300 flex items-center justify-center shrink-0 shadow-sm">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white text-sm">Monte o seu Açaí em 4 Passos:</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        1. Escolha o tamanho ➔ 2. Selecione a base ➔ 3. Escolha os acompanhamentos ➔ 4. Receba em casa!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Lista de Tamanhos */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <Flame className="w-6 h-6 text-amber-500 fill-amber-500" />
                        Escolha o Tamanho Perfeito
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Todos os copos acompanham recheio grátis</p>
                    </div>
                    <span className="text-xs font-black text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-3 py-1 rounded-full border border-purple-200 dark:border-purple-900/50">
                      A partir de R$ 14,00
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(Array.isArray(menu?.sizes) && menu.sizes.length > 0 ? menu.sizes : INITIAL_MENU.sizes).map(size => {
                      const badge = getSizeBadge(size.id, size.name);
                      const isTopSeller = size.id === 'size-500';
                      const basePrice = size.originalPrice ?? size.price;
                      const isPromo = isDiscountActive(size);
                      const remainingText = isPromo ? getRemainingHoursText(size.discountExpiresAt) : null;
                      const activePrice = isPromo ? size.price : basePrice;
                      const savings = basePrice - activePrice;

                      return (
                        <div
                          key={size.id}
                          className={`relative bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 transition-all flex flex-col justify-between ${
                            !size.available
                              ? 'border-slate-200 dark:border-slate-800 opacity-60'
                              : isPromo
                                ? 'border-amber-400 shadow-xl shadow-amber-500/10 ring-2 ring-amber-400/30'
                                : isTopSeller
                                  ? 'border-amber-400 shadow-xl shadow-amber-500/10 ring-2 ring-amber-400/20'
                                  : 'border-slate-200 dark:border-slate-800 hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-lg'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold border ${badge.bg}`}>
                                {badge.text}
                              </span>

                              {isPromo && (
                                <>
                                  <span className="bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                    <Flame className="w-3 h-3 fill-white" />
                                    {size.discountPercent}% OFF
                                  </span>
                                  {remainingText && (
                                    <span className="bg-purple-900 text-amber-300 border border-purple-700/60 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                      <Clock className="w-3 h-3 text-amber-400" />
                                      {remainingText}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            <span className="text-xs font-bold text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-100 dark:border-purple-900/50">
                              {(() => {
                                const limits = getSizeLimits(size);
                                return `1 Calda • ${limits.maxComplements} Comp. • ${limits.maxFruits} Fruta${limits.maxFruits > 1 ? 's' : ''}`;
                              })()}
                            </span>
                          </div>

                          <div className="space-y-2 mb-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight">{size.name}</h3>
                                {isPromo && (
                                  <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 inline-block mt-0.5">
                                    Economize {formatCurrency(savings)}
                                  </span>
                                )}
                              </div>

                              <div className="text-right flex flex-col items-end">
                                {isPromo && (
                                  <span className="line-through text-xs font-bold text-slate-400 dark:text-slate-500">
                                    {formatCurrency(basePrice)}
                                  </span>
                                )}
                                <div className="bg-amber-400 text-purple-950 font-black text-lg px-3 py-0.5 rounded-xl shadow-xs">
                                  {formatCurrency(activePrice)}
                                </div>
                              </div>
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{size.description}</p>
                          </div>

                          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                              Customizável
                            </span>

                            <button
                              disabled={!size.available}
                              onClick={() => setSelectedSizeToBuild({ ...size, price: activePrice })}
                              className={`py-3 px-5 rounded-2xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                                size.available
                                  ? isPromo || isTopSeller
                                    ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-purple-950 shadow-md shadow-amber-500/20 active:scale-98'
                                    : 'bg-purple-700 hover:bg-purple-800 text-white shadow-md shadow-purple-900/20 active:scale-98'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              <Plus className="w-4 h-4 stroke-[3]" />
                              <span>{size.available ? 'Montar Copo' : 'Esgotado'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Badges de Confiança */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-purple-200/80 dark:border-purple-900/40 shadow-xs flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                      <Store className="w-7 h-7 text-purple-900 dark:text-amber-300" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white text-sm">Direto com o Luky</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Sem intermediários ou taxas abusivas. Açaí mais barato, com mais fartura e preparado na hora!
                      </p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-purple-200/80 dark:border-purple-900/40 shadow-xs flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles className="w-7 h-7 text-purple-800 dark:text-purple-300" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white text-sm">Ingredientes Selecionados</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Frutas frescas do dia, Leite Ninho original, Nutella pura e caldas irresistíveis.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <footer className="pt-8 pb-10 text-center border-t border-purple-200/60 dark:border-purple-900/40 space-y-3">
                  <div className="flex items-center justify-center gap-4 text-xs font-semibold flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        if (activeOrder) {
                          setIsTrackingModalOpen(true);
                        } else {
                          setIsSearchOrderOpen(true);
                        }
                      }}
                      className="text-purple-700 dark:text-purple-300 hover:text-purple-950 dark:hover:text-white flex items-center gap-1.5 cursor-pointer bg-purple-50 dark:bg-purple-950/60 px-3 py-1.5 rounded-full border border-purple-200/60 dark:border-purple-800/40 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>{activeOrder ? 'Acompanhar Pedido em Andamento' : 'Rastrear Meu Pedido'}</span>
                    </button>
                    <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
                    <a
                      href="/admin"
                      className="text-slate-500 dark:text-slate-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors text-xs py-1.5"
                    >
                      Área do Lojista (Painel de Pedidos)
                    </a>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    © {new Date().getFullYear()} {settings.storeName} - Todos os direitos reservados.
                  </p>
                </footer>
              </main>

              {/* Floating Bottom Cart Bar */}
              {totalCartCount > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-slate-950 dark:via-slate-950/95 dark:to-transparent flex justify-center">
                  <div className="max-w-md w-full">
                    <button
                      onClick={() => setIsCartOpen(true)}
                      className="w-full bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-950 hover:from-purple-950 hover:to-indigo-900 text-white font-black p-4 rounded-3xl shadow-2xl shadow-purple-950/40 flex items-center justify-between active:scale-98 transition-all cursor-pointer border border-purple-700/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-amber-400 text-purple-950 flex items-center justify-center font-black text-sm shadow-md">
                          {totalCartCount}
                        </div>
                        <div className="text-left">
                          <span className="text-[11px] text-purple-200 block font-semibold uppercase tracking-wider">Ver Sacola</span>
                          <span className="text-base font-black text-amber-300">{formatCurrency(totalCartPrice)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-black text-white bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-2xl transition-colors">
                        <ShoppingBag className="w-4 h-4 text-amber-300" />
                        <span>Finalizar Pedido</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Modais */}
              {selectedSizeToBuild && (
                <MonteAcaiModal
                  size={selectedSizeToBuild}
                  menu={menu}
                  onClose={() => setSelectedSizeToBuild(null)}
                  onAddToCart={handleAddToCart}
                />
              )}

              <CartDrawer
                isOpen={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                items={cartItems}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onProceedToCheckout={() => {
                  setIsCartOpen(false);
                  setIsCheckoutOpen(true);
                }}
              />

              {isCheckoutOpen && (
                <CheckoutModal
                  items={cartItems}
                  settings={settings}
                  onClose={() => setIsCheckoutOpen(false)}
                  onBackToCart={() => {
                    setIsCheckoutOpen(false);
                    setIsCartOpen(true);
                  }}
                  onOrderSuccess={handleOrderSuccess}
                  customer={customer}
                />
              )}

              {activeOrder && isTrackingModalOpen && (
                <ErrorBoundary
                  fallback={
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full text-center space-y-4">
                        <p className="font-black text-sm text-slate-800 dark:text-white">Não foi possível carregar os detalhes do pedido no momento.</p>
                        <button
                          type="button"
                          onClick={() => setIsTrackingModalOpen(false)}
                          className="w-full py-2.5 bg-purple-900 hover:bg-purple-950 text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  }
                >
                  <OrderTrackingModal
                    order={activeOrder}
                    settings={settings}
                    onClose={handleCloseTracking}
                    onNewOrder={handleNewOrder}
                  />
                </ErrorBoundary>
              )}

              <CustomerDrawer
                isOpen={isCustomerDrawerOpen}
                onClose={() => setIsCustomerDrawerOpen(false)}
                customer={customer}
                onCustomerChange={setCustomer}
                onReorder={handleReorder}
                onTrackOrder={handleTrackCustomerOrder}
              />

              {/* Modal de Busca / Rastreamento Rápido de Pedido */}
              {isSearchOrderOpen && (
                <div 
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setIsSearchOrderOpen(false);
                  }}
                  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
                >
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-purple-100 dark:border-slate-800 space-y-4 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-400/20 text-amber-500 flex items-center justify-center">
                          <Search className="w-4 h-4" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white text-base">Rastrear Pedido</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearchOrderOpen(false);
                          setSearchOrderError('');
                        }}
                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Fechar"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Digite o código do seu pedido (ex: <span className="font-mono font-bold text-purple-700 dark:text-purple-300">PED-12345</span>) para acompanhar o preparo e a entrega em tempo real.
                    </p>

                    <form onSubmit={handleSearchOrder} className="space-y-3">
                      <div>
                        <input
                          type="text"
                          value={searchOrderCode}
                          onChange={e => setSearchOrderCode(e.target.value)}
                          placeholder="Ex: PED-12345"
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider focus:outline-hidden focus:ring-2 focus:ring-purple-600"
                          autoFocus
                        />
                      </div>

                      {searchOrderError && (
                        <p className="text-xs text-red-500 font-semibold bg-red-50 dark:bg-red-950/40 p-2.5 rounded-xl border border-red-200 dark:border-red-900/60">
                          {searchOrderError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={searchOrderLoading || !searchOrderCode.trim()}
                        className="w-full py-3 bg-gradient-to-r from-purple-800 to-indigo-900 hover:from-purple-900 hover:to-indigo-950 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 transition-all"
                      >
                        {searchOrderLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                            <span>Buscando...</span>
                          </>
                        ) : (
                          <>
                            <span>Consultar Status</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearchOrderOpen(false);
                          setIsCustomerDrawerOpen(true);
                        }}
                        className="text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline cursor-pointer"
                      >
                        Ver histórico de pedidos na minha conta
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* ========================================================= */}
        {/* ROTA 2: PAINEL ADMINISTRATIVO COM LOGIN (/admin)          */}
        {/* ========================================================= */}
        <Route
          path="/admin"
          element={
            isAdminAuthenticated ? (
              <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
                <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-20">
                  <AdminPanel
                    settings={settings}
                    menu={menu}
                    onUpdateSettings={handleUpdateSettings}
                    onUpdateMenu={handleUpdateMenu}
                    onLogout={handleAdminLogout}
                    isDark={isDark}
                    onToggleTheme={toggleTheme}
                  />
                </main>
              </div>
            ) : (
              <AdminLogin
                expectedPin={settings.adminPin || '1234'}
                onLoginSuccess={() => setIsAdminAuthenticated(true)}
                isDark={isDark}
                onToggleTheme={toggleTheme}
              />
            )
          }
        />

        {/* Rota padrão: redireciona qualquer outra URL para a home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
  );
}
