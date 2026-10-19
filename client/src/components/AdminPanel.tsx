import React, { useState, useEffect } from 'react';
import type { Order, OrderStatus, StoreSettings, MenuData } from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import { playOrderAlert } from '../utils/audio';
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
  Power
} from 'lucide-react';
import { io } from 'socket.io-client';

interface AdminPanelProps {
  settings: StoreSettings;
  menu: MenuData;
  onUpdateSettings: (newSettings: StoreSettings) => Promise<void>;
  onUpdateMenu: (newMenu: MenuData) => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  settings,
  menu,
  onUpdateSettings,
  onUpdateMenu
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'PEDIDOS' | 'CARDAPIO' | 'CONFIGURACOES'>('PEDIDOS');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'TODOS'>('TODOS');
  const [savingSettings, setSavingSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<StoreSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const loadOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error('Erro ao buscar pedidos:', e);
    }
  };

  useEffect(() => {
    loadOrders();

    const socket = io();

    socket.on('new_order', (newOrder: Order) => {
      setOrders(prev => [newOrder, ...prev]);
      if (soundEnabled) {
        playOrderAlert();
      }
    });

    socket.on('order_status_updated', (updated: Order) => {
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
    });

    return () => {
      socket.disconnect();
    };
  }, [soundEnabled]);

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      }
    } catch (err) {
      console.error('Erro ao atualizar status do pedido:', err);
    }
  };

  const handleToggleItemAvailability = async (
    category: 'sizes' | 'bases' | 'freeToppings' | 'premiumToppings' | 'syrups',
    itemId: string
  ) => {
    const updatedMenu = { ...menu };
    // @ts-ignore
    updatedMenu[category] = updatedMenu[category].map((item: any) => 
      item.id === itemId ? { ...item, available: !item.available } : item
    );
    await onUpdateMenu(updatedMenu);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    await onUpdateSettings(localSettings);
    setSavingSettings(false);
  };

  // Metrics
  const todayOrders = orders;
  const totalRevenue = todayOrders
    .filter(o => o.status !== 'CANCELADO')
    .reduce((acc, o) => acc + o.total, 0);
  const pendingOrders = orders.filter(o => o.status === 'NOVO');
  const inPrepOrders = orders.filter(o => o.status === 'PREPARANDO');

  const filteredOrders = orders.filter(o => {
    if (filterStatus === 'TODOS') return true;
    return o.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Bar for Admin */}
      <div className="bg-white rounded-3xl p-5 border border-purple-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-12 h-12 rounded-full border-2 border-amber-400 bg-white object-cover shadow-sm"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">Painel do Luky</h1>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                settings.isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}>
                <Power className="w-3 h-3" />
                {settings.isOpen ? 'Loja Aberta' : 'Loja Fechada'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Cozinha e Gestão de Pedidos em Tempo Real</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              soundEnabled
                ? 'bg-amber-50 text-purple-950 border-amber-300 hover:bg-amber-100'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-purple-700" /> : <VolumeX className="w-4 h-4" />}
            <span>Som: {soundEnabled ? 'Ligado' : 'Mudo'}</span>
          </button>

          <button
            onClick={playOrderAlert}
            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-purple-200"
            title="Testar campainha"
          >
            <Bell className="w-4 h-4" />
          </button>

          <button
            onClick={loadOrders}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Faturamento</span>
            <div className="text-lg font-black text-purple-950">{formatCurrency(totalRevenue)}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Pedidos</span>
            <div className="text-lg font-black text-slate-900">{orders.length}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-300 bg-amber-50/40 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-purple-950 flex items-center justify-center shrink-0 font-black">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-600 uppercase">Novos Pedidos</span>
            <div className="text-lg font-black text-amber-700">{pendingOrders.length}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Em Preparo</span>
            <div className="text-lg font-black text-purple-700">{inPrepOrders.length}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-purple-200 gap-2">
        <button
          onClick={() => setActiveTab('PEDIDOS')}
          className={`pb-3 px-4 font-black text-sm flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'PEDIDOS'
              ? 'border-purple-800 text-purple-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Gestão de Pedidos ({orders.length})</span>
          {pendingOrders.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-bounce">
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('CARDAPIO')}
          className={`pb-3 px-4 font-black text-sm flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'CARDAPIO'
              ? 'border-purple-800 text-purple-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Cardápio & Estoque</span>
        </button>

        <button
          onClick={() => setActiveTab('CONFIGURACOES')}
          className={`pb-3 px-4 font-black text-sm flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'CONFIGURACOES'
              ? 'border-purple-800 text-purple-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Configurações</span>
        </button>
      </div>

      {/* TAB 1: GESTÃO DE PEDIDOS */}
      {activeTab === 'PEDIDOS' && (
        <div className="space-y-4">
          {/* Status Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(['TODOS', 'NOVO', 'PREPARANDO', 'A_CAMINHO', 'CONCLUIDO', 'CANCELADO'] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  filterStatus === st
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
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
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 text-slate-400">
              <ShoppingBag className="w-12 h-12 stroke-1 mx-auto mb-2 text-slate-300" />
              <p className="font-bold text-slate-600">Nenhum pedido com este filtro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map(order => (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border-2 flex flex-col justify-between overflow-hidden shadow-xs transition-shadow hover:shadow-md ${
                    order.status === 'NOVO'
                      ? 'border-amber-400 bg-amber-50/20 shadow-md ring-2 ring-amber-400/30'
                      : order.status === 'PREPARANDO'
                      ? 'border-purple-300'
                      : order.status === 'A_CAMINHO'
                      ? 'border-blue-300'
                      : 'border-slate-200 opacity-95'
                  }`}
                >
                  {/* Order Card Header */}
                  <div className="p-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-base">{order.id}</span>
                        <span className="text-xs text-slate-500 font-semibold">{formatDateTime(order.createdAt)}</span>
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm mt-0.5">{order.customerName}</h3>
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

                      <span className="text-[11px] font-bold text-slate-600">
                        {order.orderType === 'ENTREGA' ? '🛵 Entrega' : '🏪 Retirada'}
                      </span>
                    </div>
                  </div>

                  {/* Customer & Address Details */}
                  <div className="p-4 space-y-3 flex-1 text-xs">
                    {order.orderType === 'ENTREGA' && order.address ? (
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-0.5">
                        <p className="font-bold text-slate-800">
                          {order.address.street}, {order.address.number} - {order.address.neighborhood}
                        </p>
                        {order.address.complement && <p className="text-slate-500">Compl: {order.address.complement}</p>}
                        {order.address.reference && <p className="text-slate-500">Ref: {order.address.reference}</p>}
                      </div>
                    ) : (
                      <div className="bg-purple-50 p-2 rounded-xl text-purple-900 font-semibold text-[11px]">
                        Retirada presencial no balcão
                      </div>
                    )}

                    {/* Items Breakdown */}
                    <div className="space-y-2 border-t border-slate-100 pt-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="bg-slate-50/70 p-2 rounded-xl border border-slate-100">
                          <div className="flex justify-between font-bold text-slate-900">
                            <span>{item.quantity}x {item.size.name}</span>
                            <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                          </div>
                          <p className="text-purple-800 font-semibold">{item.base.name}</p>
                          {item.freeToppings.length > 0 && (
                            <p className="text-slate-600">
                              <span className="font-semibold text-slate-700">Acomp:</span> {item.freeToppings.map(t => t.name).join(', ')}
                            </p>
                          )}
                          {item.premiumToppings.length > 0 && (
                            <p className="text-amber-700">
                              <span className="font-semibold">Extras:</span> {item.premiumToppings.map(p => `${p.quantity > 1 ? `${p.quantity}x ` : ''}${p.item.name}`).join(', ')}
                            </p>
                          )}
                          {item.syrups.length > 0 && (
                            <p className="text-purple-700">
                              <span className="font-semibold">Caldas:</span> {item.syrups.map(s => s.name).join(', ')}
                            </p>
                          )}
                          {item.notes && (
                            <p className="italic text-purple-950 font-bold bg-amber-100/70 p-1 rounded mt-1">
                              Obs: {item.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Total & Payment */}
                    <div className="border-t border-slate-100 pt-2 space-y-1">
                      <div className="flex justify-between font-bold text-sm text-slate-900">
                        <span>Total:</span>
                        <span className="text-purple-950 font-black text-base">{formatCurrency(order.total)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex justify-between">
                        <span>Pagamento:</span>
                        <span className="font-bold text-slate-700">
                          {order.paymentMethod === 'PIX' && 'Pix'}
                          {order.paymentMethod === 'CARTAO_ENTREGA' && `Cartão (${order.paymentDetails?.cardType || 'Débito/Crédito'})`}
                          {order.paymentMethod === 'DINHEIRO' && (
                            order.paymentDetails?.needChange 
                              ? `Dinheiro (Troco p/ ${formatCurrency(order.paymentDetails.changeFor || 0)})`
                              : 'Dinheiro (Sem troco)'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 space-y-2">
                    {order.status === 'NOVO' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'PREPARANDO')}
                        className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-purple-950 font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <ChefHat className="w-4 h-4" />
                        <span>Aceitar e Iniciar Preparo</span>
                      </button>
                    )}

                    {order.status === 'PREPARANDO' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'A_CAMINHO')}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <Bike className="w-4 h-4" />
                        <span>{order.orderType === 'ENTREGA' ? 'Despachar Entrega' : 'Pronto p/ Retirada'}</span>
                      </button>
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

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://wa.me/55${order.customerPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold py-2 px-2.5 rounded-xl flex items-center justify-center gap-1 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>WhatsApp</span>
                      </a>

                      <button
                        onClick={() => setSelectedOrderForPrint(order)}
                        className="flex-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold py-2 px-2.5 rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-600" />
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

      {/* TAB 2: CONTROLE DE CARDÁPIO E ESTOQUE */}
      {activeTab === 'CARDAPIO' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Controle de Itens e Disponibilidade</h2>
            <p className="text-xs text-slate-500">
              Acabou o morango ou o copo de 700ml? Pause o item com 1 clique para não receber pedidos indisponíveis.
            </p>
          </div>

          {/* Sizes */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-purple-900 uppercase tracking-wider">Tamanhos e Copos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {menu.sizes.map(size => (
                <div key={size.id} className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm block text-slate-800">{size.name}</span>
                    <span className="text-xs text-amber-600 font-bold">{formatCurrency(size.price)}</span>
                  </div>
                  <button
                    onClick={() => handleToggleItemAvailability('sizes', size.id)}
                    className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                      size.available ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {size.available ? 'Ativo' : 'Pausado'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Bases */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-purple-900 uppercase tracking-wider">Bases de Açaí / Cupuaçu</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {menu.bases.map(base => (
                <div key={base.id} className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-800">{base.name}</span>
                  <button
                    onClick={() => handleToggleItemAvailability('bases', base.id)}
                    className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                      base.available ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {base.available ? 'Ativo' : 'Pausado'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Free Toppings */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-purple-900 uppercase tracking-wider">Acompanhamentos Grátis</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {menu.freeToppings.map(item => (
                <div key={item.id} className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 truncate mr-2">{item.name}</span>
                  <button
                    onClick={() => handleToggleItemAvailability('freeToppings', item.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors cursor-pointer ${
                      item.available ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {item.available ? 'OK' : 'Falta'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Premium Toppings */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-amber-700 uppercase tracking-wider">Adicionais Especiais (Pagos)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {menu.premiumToppings.map(item => (
                <div key={item.id} className="p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs block text-slate-800">{item.name}</span>
                    <span className="text-[11px] text-amber-600 font-bold">{formatCurrency(item.price)}</span>
                  </div>
                  <button
                    onClick={() => handleToggleItemAvailability('premiumToppings', item.id)}
                    className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                      item.available ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {item.available ? 'Ativo' : 'Pausado'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Syrups */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-purple-900 uppercase tracking-wider">Caldas & Coberturas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {menu.syrups.map(item => (
                <div key={item.id} className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 truncate mr-2">{item.name}</span>
                  <button
                    onClick={() => handleToggleItemAvailability('syrups', item.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors cursor-pointer ${
                      item.available ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {item.available ? 'OK' : 'Falta'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CONFIGURAÇÕES DA LOJA */}
      {activeTab === 'CONFIGURACOES' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200">
          <form onSubmit={handleSaveSettings} className="max-w-xl space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Configurações Gerais da Loja</h2>
              <p className="text-xs text-slate-500">Ajuste os dados de pagamento, entrega e horário.</p>
            </div>

            {/* Status da Loja Aberta/Fechada */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-900 block">Status de Atendimento</span>
                <span className="text-xs text-slate-500">
                  {localSettings.isOpen ? 'Os clientes podem fazer pedidos normalmente.' : 'Loja fechada temporariamente.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, isOpen: !localSettings.isOpen })}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  localSettings.isOpen ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {localSettings.isOpen ? 'Loja Aberta' : 'Loja Fechada'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Empresa</label>
                <input
                  type="text"
                  value={localSettings.storeName}
                  onChange={e => setLocalSettings({ ...localSettings, storeName: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp da Loja</label>
                <input
                  type="text"
                  value={localSettings.whatsapp}
                  onChange={e => setLocalSettings({ ...localSettings, whatsapp: e.target.value })}
                  placeholder="5511999999999"
                  className="w-full text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chave Pix</label>
                <input
                  type="text"
                  value={localSettings.pixKey}
                  onChange={e => setLocalSettings({ ...localSettings, pixKey: e.target.value })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo da Chave Pix</label>
                <input
                  type="text"
                  value={localSettings.pixKeyType}
                  onChange={e => setLocalSettings({ ...localSettings, pixKeyType: e.target.value })}
                  placeholder="Ex: CPF, Telefone, E-mail"
                  className="w-full text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Taxa de Entrega Padrão (R$)</label>
                <input
                  type="number"
                  step="0.5"
                  value={localSettings.deliveryFee}
                  onChange={e => setLocalSettings({ ...localSettings, deliveryFee: parseFloat(e.target.value) || 0 })}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tempo Estimado de Espera</label>
                <input
                  type="text"
                  value={localSettings.estimatedTime}
                  onChange={e => setLocalSettings({ ...localSettings, estimatedTime: e.target.value })}
                  placeholder="Ex: 30 - 45 min"
                  className="w-full text-xs p-3 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Endereço de Retirada</label>
              <input
                type="text"
                value={localSettings.address}
                onChange={e => setLocalSettings({ ...localSettings, address: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-200"
              />
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
    </div>
  );
};
