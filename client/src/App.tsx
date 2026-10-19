import { useState, useEffect } from 'react';
import type { SizeItem, CartItem, Order, MenuData, StoreSettings } from './types';
import { formatCurrency } from './utils/format';
import { MonteAcaiModal } from './components/MonteAcaiModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { AdminPanel } from './components/AdminPanel';
import { 
  Clock, 
  MapPin, 
  Sparkles, 
  Plus, 
  MessageCircle, 
  ChefHat, 
  Store,
  Layers,
  ChevronRight
} from 'lucide-react';
import { io } from 'socket.io-client';

const INITIAL_SETTINGS: StoreSettings = {
  storeName: "Açaí do Kayky",
  isOpen: true,
  whatsapp: "5511999999999",
  pixKey: "kaykyacai@exemplo.com",
  pixKeyType: "E-mail",
  deliveryFee: 5.00,
  estimatedTime: "30 - 45 min",
  address: "Rua do Açaí, 123 - Centro",
  minOrderValue: 12.00
};

const INITIAL_MENU: MenuData = {
  sizes: [
    { id: "size-300", name: "Copo 300ml", description: "Perfeito para uma pausa refrescante e saborosa.", price: 14.00, maxFreeToppings: 3, available: true },
    { id: "size-500", name: "Copo 500ml", description: "O mais pedido! Equilíbrio ideal de açaí e recheio.", price: 20.00, maxFreeToppings: 3, available: true },
    { id: "size-700", name: "Copo 700ml", description: "Tamanho caprichado para quem ama açaí de verdade.", price: 26.00, maxFreeToppings: 4, available: true },
    { id: "size-1000", name: "Barca Especial 1 Litro", description: "Serve até 3 pessoas com muita fartura e doçura!", price: 45.00, maxFreeToppings: 5, available: true }
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

export default function App() {
  const [viewMode, setViewMode] = useState<'CLIENTE' | 'ADMIN'>('CLIENTE');
  const [settings, setSettings] = useState<StoreSettings>(INITIAL_SETTINGS);
  const [menu, setMenu] = useState<MenuData>(INITIAL_MENU);

  // Customer State
  const [selectedSizeToBuild, setSelectedSizeToBuild] = useState<SizeItem | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(null);

  // Fetch settings & menu from backend
  const fetchData = async () => {
    try {
      const [resSettings, resMenu] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/menu')
      ]);
      if (resSettings.ok) {
        const dataSettings = await resSettings.json();
        setSettings(dataSettings);
      }
      if (resMenu.ok) {
        const dataMenu = await resMenu.json();
        setMenu(dataMenu);
      }
    } catch (e) {
      console.warn('Backend ainda iniciando, usando dados locais temporários.');
    }
  };

  useEffect(() => {
    fetchData();

    // Socket.io for live updates of settings/menu
    const socket = io();
    socket.on('settings_updated', (newSettings: StoreSettings) => {
      setSettings(newSettings);
    });
    socket.on('menu_updated', (newMenu: MenuData) => {
      setMenu(newMenu);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Update Settings via API
  const handleUpdateSettings = async (newSettings: StoreSettings) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setSettings(newSettings);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Update Menu via API
  const handleUpdateMenu = async (newMenu: MenuData) => {
    try {
      const res = await fetch('/api/menu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMenu)
      });
      if (res.ok) {
        setMenu(newMenu);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Cart operations
  const handleAddToCart = (item: CartItem) => {
    setCartItems(prev => [...prev, item]);
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
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
  };

  const handleRemoveItem = (itemId: string) => {
    setCartItems(prev => prev.filter(i => i.id !== itemId));
  };

  const handleOrderSuccess = (order: Order) => {
    setCartItems([]);
    setIsCheckoutOpen(false);
    setIsCartOpen(false);
    setActiveTrackingOrder(order);
  };

  const totalCartCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  const totalCartPrice = cartItems.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Bar Switcher between Customer view and Kayky's Admin */}
      <div className="bg-slate-900 text-slate-300 text-xs py-2 px-4 border-b border-slate-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold text-white">Sistema Delivery Próprio</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('CLIENTE')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'CLIENTE'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📱 Ver Cardápio (Cliente)
            </button>
            <button
              onClick={() => setViewMode('ADMIN')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'ADMIN'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👨‍🍳 Painel do Kayky (Cozinha)
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-28">
        {viewMode === 'ADMIN' ? (
          <AdminPanel
            settings={settings}
            menu={menu}
            onUpdateSettings={handleUpdateSettings}
            onUpdateMenu={handleUpdateMenu}
          />
        ) : (
          /* CLIENT VIEW */
          <div className="space-y-6">
            {/* Header Card / Hero */}
            <div className="relative overflow-hidden bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="bg-purple-800/80 backdrop-blur-xs text-purple-200 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 border border-purple-700/50">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Açaí Artesanal & Cremoso
                  </span>

                  <span className={`text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1.5 ${
                    settings.isOpen 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${settings.isOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {settings.isOpen ? 'Aberto Agora' : 'Fechado no momento'}
                  </span>
                </div>

                <div>
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{settings.storeName}</h1>
                  <p className="text-purple-200 text-sm mt-1 max-w-md">
                    Monte seu copo ou barca do seu jeito com acompanhamentos frescos e fartura de verdade!
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-purple-200 pt-2 border-t border-purple-800/50">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-purple-400" />
                    <span>Preparo: <strong>{settings.estimatedTime}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-purple-400" />
                    <span>Entrega ou Retirada</span>
                  </div>
                  <a
                    href={`https://wa.me/55${settings.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-bold ml-auto"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Falar no WhatsApp</span>
                  </a>
                </div>
              </div>

              {/* Decorative background shapes */}
              <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute right-20 -top-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
            </div>

            {/* Step-by-Step Instructions Banner */}
            <div className="bg-purple-100/70 border border-purple-200 p-4 rounded-2xl flex items-center justify-between text-xs text-purple-950 font-medium">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold block text-sm">Como pedir:</span>
                  <span>1. Escolha o tamanho ➔ 2. Selecione a base ➔ 3. Escolha os acompanhamentos ➔ 4. Finalize!</span>
                </div>
              </div>
            </div>

            {/* Menu Sizes List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-purple-700" />
                  Escolha o Tamanho
                </h2>
                <span className="text-xs text-slate-500 font-semibold">Preços a partir de R$ 14,00</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {menu.sizes.map(size => (
                  <div
                    key={size.id}
                    className={`bg-white rounded-3xl p-5 border-2 transition-all flex flex-col justify-between ${
                      !size.available
                        ? 'border-slate-200 opacity-60'
                        : 'border-slate-200 hover:border-purple-500 hover:shadow-lg'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-black text-slate-900 text-lg">{size.name}</h3>
                          <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            Até {size.maxFreeToppings} acompanhamentos grátis
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-slate-900 text-xl">{formatCurrency(size.price)}</span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed">{size.description}</p>
                    </div>

                    <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monte do seu jeito</span>
                      <button
                        disabled={!size.available}
                        onClick={() => setSelectedSizeToBuild(size)}
                        className={`py-2.5 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                          size.available
                            ? 'bg-purple-700 hover:bg-purple-800 text-white shadow-md shadow-purple-900/10'
                            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>{size.available ? 'Montar Copo' : 'Esgotado'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Information Footer Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Direto com o Kayky</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sem intermediários ou taxas abusivas. Açaí mais barato e de melhor qualidade para você!
                  </p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Ingredientes de Primeira</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Frutas frescas selecionadas no dia, leite ninho original e nutella pura.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar for Customers */}
      {viewMode === 'CLIENTE' && totalCartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-white via-white/95 to-transparent backdrop-blur-xs flex justify-center">
          <div className="max-w-md w-full">
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full bg-gradient-to-r from-purple-800 to-indigo-800 hover:from-purple-900 hover:to-indigo-900 text-white font-bold p-4 rounded-2xl shadow-xl shadow-purple-900/30 flex items-center justify-between active:scale-98 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">
                  {totalCartCount}
                </div>
                <div className="text-left">
                  <span className="text-xs text-purple-200 block font-normal">Ver Sacola</span>
                  <span className="text-sm font-black">{formatCurrency(totalCartPrice)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-sm font-bold text-purple-200">
                <span>Continuar</span>
                <ChevronRight className="w-5 h-5" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
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
          onClose={() => setActiveTrackingOrder(null)}
          onNewOrder={() => {
            setActiveTrackingOrder(null);
            setCartItems([]);
          }}
        />
      )}
    </div>
  );
}
