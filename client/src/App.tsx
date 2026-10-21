import { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { SizeItem, CartItem, Order, MenuData, StoreSettings } from './types';
import { formatCurrency } from './utils/format';
import { isDiscountActive, getRemainingHoursText } from './utils/promo';
import { getSocket } from './utils/socket';
import { useTheme } from './utils/theme';
import { ThemeToggle } from './components/ThemeToggle';
import { MonteAcaiModal } from './components/MonteAcaiModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { AdminPanel } from './components/AdminPanel';
import { AdminLogin } from './components/AdminLogin';
import { isSupabaseConfigured } from './utils/supabase';
import { 
  fetchStoreSettings, 
  fetchMenuData, 
  saveStoreSettings, 
  saveMenuData,
  subscribeToStoreSettings,
  subscribeToMenuData
} from './services/supabaseService';
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
  ShoppingBag
} from 'lucide-react';

const INITIAL_SETTINGS: StoreSettings = {
  storeName: "Açaí do Luky",
  isOpen: true,
  whatsapp: "5511999999999",
  pixKey: "lukyacai@exemplo.com",
  pixKeyType: "Chave E-mail",
  deliveryFee: 5.00,
  estimatedTime: "30 - 45 min",
  address: "Rua do Açaí, 123 - Centro",
  minOrderValue: 12.00,
  adminPin: "1234"
};

const INITIAL_MENU: MenuData = {
  sizes: [
    { id: "size-300", name: "Copo 300ml", description: "Perfeito para matar aquela vontade de forma rápida e refrescante.", price: 14.00, originalPrice: 14.00, discountPercent: 0, maxFreeToppings: 3, available: true },
    { id: "size-500", name: "Copo 500ml", description: "O queridinho da galera! Equilíbrio ideal entre açaí e acompanhamentos.", price: 17.00, originalPrice: 20.00, discountPercent: 15, maxFreeToppings: 3, available: true },
    { id: "size-700", name: "Copo 700ml", description: "Tamanho caprichado para quem ama açaí de verdade.", price: 26.00, originalPrice: 26.00, discountPercent: 0, maxFreeToppings: 4, available: true },
    { id: "size-1000", name: "Barca Especial 1 Litro", description: "Serve até 3 pessoas com muita fartura, amor e recheio!", price: 45.00, originalPrice: 45.00, discountPercent: 0, maxFreeToppings: 5, available: true }
  ],
  bases: [
    { id: "base-tradicional", name: "Açaí Tradicional Cremoso", available: true },
    { id: "base-banana", name: "Açaí Batido com Banana", available: true },
    { id: "base-cupuacu", name: "Cupuaçu Puro Cremoso", available: true },
    { id: "base-misto", name: "Meio a Meio (Açaí + Cupuaçu)", available: true }
  ],
  freeToppings: [
    { id: "free-ninho", name: "Leite Ninho em Pó", available: true },
    { id: "free-granola", name: "Granola Crocante", available: true },
    { id: "free-pacoca", name: "Paçoca de Amendoim", available: true },
    { id: "free-banana", name: "Banana Fresca Fatiada", available: true },
    { id: "free-aveia", name: "Aveia em Flocos", available: true },
    { id: "free-sucrilhos", name: "Sucrilhos de Milho", available: true }
  ],
  premiumToppings: [
    { id: "prem-morango", name: "Morango Fresco Fatiado", price: 4.50, available: true },
    { id: "prem-nutella", name: "Nutella Pura Original", price: 5.00, available: true },
    { id: "prem-kitkat", name: "KitKat Picadinho", price: 3.50, available: true },
    { id: "prem-confete", name: "Confetes de Chocolate", price: 3.00, available: true },
    { id: "prem-doce-leite", name: "Doce de Leite Cremoso", price: 3.00, available: true },
    { id: "prem-ninho-extra", name: "Leite Ninho Extra", price: 2.50, available: true },
    { id: "prem-whey", name: "Dose Whey Protein (30g)", price: 6.00, available: true }
  ],
  syrups: [
    { id: "syrup-condensado", name: "Leite Condensado", available: true },
    { id: "syrup-chocolate", name: "Calda de Chocolate", available: true },
    { id: "syrup-morango", name: "Calda de Morango", available: true },
    { id: "syrup-mel", name: "Mel de Abelha Puro", available: true }
  ]
};

const CACHED_SETTINGS_KEY = 'luky_cached_settings';
const CACHED_MENU_KEY = 'luky_cached_menu';

function getInitialStoreSettings(): StoreSettings {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(CACHED_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
  }
  return INITIAL_SETTINGS;
}

function getInitialMenuData(): MenuData {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(CACHED_MENU_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
  }
  return INITIAL_MENU;
}

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [settings, setSettings] = useState<StoreSettings>(getInitialStoreSettings);
  const [menu, setMenu] = useState<MenuData>(getInitialMenuData);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem(CACHED_SETTINGS_KEY);
    }
    return true;
  });

  // Admin Auth State: Exige o PIN toda vez que entra na aba de admin (desbloqueio por sessão/aba)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('luky_admin_unlocked') === 'true';
  });

  // Customer State
  const [selectedSizeToBuild, setSelectedSizeToBuild] = useState<SizeItem | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(null);

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
    const savedOrderId = localStorage.getItem('luky_active_order_id');
    if (savedOrderId) {
      fetch(`/api/orders/${savedOrderId}`)
        .then(res => res.ok ? res.json() : null)
        .then(order => {
          if (order && order.status !== 'CANCELADO') {
            setActiveTrackingOrder(order);
          } else {
            localStorage.removeItem('luky_active_order_id');
          }
        })
        .catch(() => {});
    }
  }, []);

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

  const handleUpdateSettings = async (newSettings: StoreSettings) => {
    setSettings(newSettings);
    localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(newSettings));
    if (isSupabaseConfigured) {
      await saveStoreSettings(newSettings);
    }
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch {
      // Servidor local offline, Supabase já persistiu
    }
  };

  const handleUpdateMenu = async (newMenu: MenuData) => {
    setMenu(newMenu);
    localStorage.setItem(CACHED_MENU_KEY, JSON.stringify(newMenu));
    if (isSupabaseConfigured) {
      await saveMenuData(newMenu);
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

  const handleOrderSuccess = useCallback((order: Order) => {
    setCartItems([]);
    setIsCheckoutOpen(false);
    setIsCartOpen(false);
    setActiveTrackingOrder(order);
    localStorage.setItem('luky_active_order_id', order.id);
  }, []);

  const handleCloseTracking = useCallback(() => {
    setActiveTrackingOrder(null);
  }, []);

  const handleNewOrder = useCallback(() => {
    setActiveTrackingOrder(null);
    setCartItems([]);
    localStorage.removeItem('luky_active_order_id');
  }, []);

  const handleAdminLogout = useCallback(() => {
    sessionStorage.removeItem('luky_admin_unlocked');
    setIsAdminAuthenticated(false);
  }, []);

  const totalCartCount = useMemo(() => cartItems.reduce((acc, i) => acc + i.quantity, 0), [cartItems]);
  const totalCartPrice = useMemo(() => cartItems.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0), [cartItems]);

  const getSizeBadge = (sizeId: string) => {
    switch (sizeId) {
      case 'size-300':
        return { text: 'Pausa Rápida ⚡', bg: 'bg-purple-100 text-purple-900 border-purple-200' };
      case 'size-500':
        return { text: 'Mais Pedido ⭐', bg: 'bg-amber-400 text-purple-950 font-black border-amber-300 shadow-xs' };
      case 'size-700':
        return { text: 'Caprichado 🔥', bg: 'bg-orange-100 text-orange-900 border-orange-200' };
      case 'size-1000':
        return { text: 'Super Fartura 🏆', bg: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
      default:
        return { text: 'Especial', bg: 'bg-purple-100 text-purple-900 border-purple-200' };
    }
  };

  return (
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

                    {/* Botão para rastrear pedido ativo caso o cliente já tenha feito um */}
                    {activeTrackingOrder && (
                      <button
                        onClick={() => setActiveTrackingOrder(activeTrackingOrder)}
                        className="bg-amber-400 text-purple-950 px-3 py-1 rounded-full text-xs font-black shadow-xs flex items-center gap-1 cursor-pointer animate-pulse"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Acompanhar Pedido</span>
                      </button>
                    )}

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
                        href={`https://wa.me/55${settings.whatsapp.replace(/\D/g, '')}`}
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
                          <strong className="text-white text-xs">Taxa: {formatCurrency(settings.deliveryFee)}</strong>
                        </div>
                      </div>

                      <div className="bg-purple-900/50 p-2.5 rounded-2xl border border-purple-700/50 col-span-2 sm:col-span-1 flex items-center gap-2">
                        <Heart className="w-4 h-4 text-pink-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-purple-300 block font-semibold">Pagamento Fácil</span>
                          <strong className="text-white text-xs">Pix, Cartão ou Dinheiro</strong>
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
                    {menu.sizes.map(size => {
                      const badge = getSizeBadge(size.id);
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

                            <span className="text-xs font-bold text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-100 dark:border-purple-900/50">
                              {size.maxFreeToppings} acomp. inclusos
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
                <footer className="pt-8 pb-4 text-center border-t border-purple-200/60 dark:border-purple-900/40">
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
                />
              )}

              {activeTrackingOrder && (
                <OrderTrackingModal
                  order={activeTrackingOrder}
                  settings={settings}
                  onClose={handleCloseTracking}
                  onNewOrder={handleNewOrder}
                />
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
  );
}
