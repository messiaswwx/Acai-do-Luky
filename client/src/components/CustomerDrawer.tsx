import React, { useState, useEffect, useCallback } from 'react';
import type { CustomerProfile, Order, CartItem } from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import { 
  findCustomerByPhone, 
  createCustomer, 
  updateCustomer, 
  fetchCustomerOrders, 
  subscribeToCustomerOrders 
} from '../services/supabaseService';
import { 
  User, 
  ShoppingBag, 
  Clock, 
  MapPin, 
  Phone, 
  LogOut, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Edit3, 
  Save, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface CustomerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerProfile | null;
  onCustomerChange: (customer: CustomerProfile | null) => void;
  onReorder?: (items: CartItem[]) => void;
  onTrackOrder?: (order: Order) => void;
}

const CUSTOMER_SESSION_KEY = 'luky_active_customer';

export const CustomerDrawer: React.FC<CustomerDrawerProps> = ({
  isOpen,
  onClose,
  customer,
  onCustomerChange,
  onReorder,
  onTrackOrder
}) => {
  // Navigation when logged out: 'LOGIN' | 'REGISTER'
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Navigation when logged in: 'ORDERS' | 'PROFILE'
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'PROFILE'>('ORDERS');

  // Login form state
  const [loginPhone, setLoginPhone] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Register form state
  const [registerForm, setRegisterForm] = useState({
    name: '',
    phone: '',
    street: '',
    number: '',
    neighborhood: '',
    complement: '',
    reference: ''
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // Profile editing form state
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    street: '',
    number: '',
    neighborhood: '',
    complement: '',
    reference: ''
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Sync edit form when customer changes
  useEffect(() => {
    if (customer) {
      setEditForm({
        name: customer.name || '',
        phone: formatPhone(customer.phone || ''),
        street: customer.address?.street || '',
        number: customer.address?.number || '',
        neighborhood: customer.address?.neighborhood || '',
        complement: customer.address?.complement || '',
        reference: customer.address?.reference || ''
      });
      loadOrders(customer.phone);
    } else {
      setOrders([]);
    }
  }, [customer]);

  // Load orders for customer
  const loadOrders = useCallback(async (phone: string) => {
    if (!phone) return;
    setLoadingOrders(true);
    try {
      const fetched = await fetchCustomerOrders(phone);
      setOrders(fetched);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // Realtime subscription for customer orders
  useEffect(() => {
    if (!isOpen || !customer?.phone) return;
    const unsub = subscribeToCustomerOrders(() => {
      loadOrders(customer.phone);
    });
    return () => unsub();
  }, [isOpen, customer?.phone, loadOrders]);

  // Helper format phone: (11) 99999-9999
  function formatPhone(val: string): string {
    const clean = val.replace(/\D/g, '').slice(0, 11);
    if (clean.length <= 2) return clean;
    if (clean.length <= 7) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }

  // Handle Login Submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const clean = loginPhone.replace(/\D/g, '');

    if (clean.length < 10) {
      setLoginError('Por favor, informe seu celular com DDD (ex: 11 99999-9999).');
      return;
    }

    setLoginLoading(true);
    try {
      const found = await findCustomerByPhone(clean);
      if (found) {
        localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(found));
        onCustomerChange(found);
        setActiveTab('ORDERS');
        setLoginPhone('');
      } else {
        setLoginError('Nenhum cadastro encontrado com este celular. Crie sua conta grátis na aba "Cadastrar"!');
      }
    } catch {
      setLoginError('Erro ao consultar cadastro. Tente novamente.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Register Submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (!registerForm.name.trim()) {
      setRegisterError('Por favor, informe seu nome completo.');
      return;
    }

    const clean = registerForm.phone.replace(/\D/g, '');
    if (clean.length < 10) {
      setRegisterError('Por favor, informe um WhatsApp válido com DDD (mínimo 10 dígitos).');
      return;
    }

    setRegisterLoading(true);
    try {
      const res = await createCustomer({
        name: registerForm.name.trim(),
        phone: clean,
        address: registerForm.street.trim() ? {
          street: registerForm.street.trim(),
          number: registerForm.number.trim(),
          neighborhood: registerForm.neighborhood.trim(),
          complement: registerForm.complement.trim() || undefined,
          reference: registerForm.reference.trim() || undefined
        } : undefined
      });

      if (!res.success || !res.customer) {
        setRegisterError(res.error || 'Não foi possível cadastrar. Tente novamente.');
        return;
      }

      // Sucesso! Loga o usuário imediatamente
      localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(res.customer));
      onCustomerChange(res.customer);
      setActiveTab('ORDERS');
      setRegisterForm({
        name: '',
        phone: '',
        street: '',
        number: '',
        neighborhood: '',
        complement: '',
        reference: ''
      });
    } catch {
      setRegisterError('Erro ao salvar cadastro. Verifique a conexão.');
    } finally {
      setRegisterLoading(false);
    }
  };

  // Handle Profile Update Submission
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer?.id) return;
    setProfileError('');

    if (!editForm.name.trim()) {
      setProfileError('O nome não pode ficar em branco.');
      return;
    }

    const cleanPhone = editForm.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setProfileError('Número de celular inválido.');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await updateCustomer(customer.id, {
        name: editForm.name.trim(),
        phone: cleanPhone,
        address: {
          street: editForm.street.trim(),
          number: editForm.number.trim(),
          neighborhood: editForm.neighborhood.trim(),
          complement: editForm.complement.trim() || undefined,
          reference: editForm.reference.trim() || undefined
        }
      });

      if (!res.success || !res.customer) {
        setProfileError(res.error || 'Erro ao salvar alterações.');
        return;
      }

      localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(res.customer));
      onCustomerChange(res.customer);
      setProfileFeedback(true);
      setTimeout(() => setProfileFeedback(false), 3000);
    } catch {
      setProfileError('Erro ao atualizar perfil.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    onCustomerChange(null);
    setAuthMode('LOGIN');
    setOrders([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-purple-200/50 dark:border-purple-900/40 text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-300">
          
          {/* Header do Drawer */}
          <div className="bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 text-white p-4.5 flex items-center justify-between border-b border-purple-800/60 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-400 text-purple-950 flex items-center justify-center font-black text-base shadow-md">
                {customer ? customer.name.charAt(0).toUpperCase() : <User className="w-5 h-5 text-purple-950" />}
              </div>
              <div>
                <h2 className="font-black text-sm text-white">
                  {customer ? `Olá, ${customer.name.split(' ')[0]}!` : 'Área do Cliente'}
                </h2>
                <p className="text-[11px] text-purple-200">
                  {customer ? formatPhone(customer.phone) : 'Faça login para ver seus pedidos e salvar endereço'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ============================================================== */}
          {/* SE NÃO ESTIVER LOGADO: TABS ENTRAR OU CADASTRAR               */}
          {/* ============================================================== */}
          {!customer ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Toggle de Modo: Login vs Cadastro */}
              <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl flex border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => { setAuthMode('LOGIN'); setLoginError(''); setRegisterError(''); }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                    authMode === 'LOGIN'
                      ? 'bg-purple-900 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-purple-900'
                  }`}
                >
                  Já tenho Cadastro
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('REGISTER'); setLoginError(''); setRegisterError(''); }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                    authMode === 'REGISTER'
                      ? 'bg-purple-900 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-purple-900'
                  }`}
                >
                  Criar Nova Conta
                </button>
              </div>

              {/* 1. ABA DE LOGIN */}
              {authMode === 'LOGIN' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="bg-purple-50 dark:bg-purple-950/40 p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 text-xs text-purple-900 dark:text-purple-200 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Acesso Rápido com seu Celular</span>
                    </p>
                    <p className="text-[11px] text-purple-700 dark:text-purple-300">
                      Digite o número de WhatsApp usado nos seus pedidos para ver seu histórico e agilizar a compra.
                    </p>
                  </div>

                  {loginError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold rounded-xl flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Número do seu WhatsApp (com DDD)
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="(11) 99999-9999"
                        required
                        value={loginPhone}
                        onChange={e => setLoginPhone(formatPhone(e.target.value))}
                        className="w-full text-base font-bold py-3 pl-10 pr-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-purple-700 dark:focus:border-purple-500 focus:outline-hidden transition-colors"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading || loginPhone.replace(/\D/g, '').length < 10}
                    className="w-full bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 hover:from-purple-900 hover:to-indigo-900 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-purple-950/20 active:scale-98 transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loginLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Buscando conta...</span>
                      </span>
                    ) : (
                      <>
                        <span>Acessar Minha Conta</span>
                        <ArrowRight className="w-4 h-4 text-amber-400" />
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => { setAuthMode('REGISTER'); setLoginError(''); }}
                      className="text-xs text-purple-700 dark:text-purple-400 font-bold hover:underline cursor-pointer"
                    >
                      Ainda não tem cadastro? Clique para criar agora!
                    </button>
                  </div>
                </form>
              )}

              {/* 2. ABA DE CADASTRO */}
              {authMode === 'REGISTER' && (
                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div className="bg-purple-50 dark:bg-purple-950/40 p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 text-xs text-purple-900 dark:text-purple-200 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Cadastro em Menos de 1 Minuto</span>
                    </p>
                    <p className="text-[11px] text-purple-700 dark:text-purple-300">
                      Salve seu endereço e agilize seus próximos pedidos no Açaí do Luky!
                    </p>
                  </div>

                  {registerError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/80 border-2 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold rounded-xl flex items-start gap-2 animate-in shake">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{registerError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Seu Nome Completo *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Gabriel Silva"
                      required
                      value={registerForm.name}
                      onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className="w-full text-sm font-bold p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-purple-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Celular / WhatsApp (com DDD) *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="(11) 99999-9999"
                      required
                      value={registerForm.phone}
                      onChange={e => setRegisterForm({ ...registerForm, phone: formatPhone(e.target.value) })}
                      className="w-full text-sm font-bold p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-purple-700"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                      Não pode haver números repetidos no sistema.
                    </span>
                  </div>

                  {/* Endereço Padrão (Opcional no cadastro) */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                      <span>Endereço de Entrega Padrão (Opcional)</span>
                    </span>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Rua</label>
                        <input
                          type="text"
                          placeholder="Nome da rua/avenida"
                          value={registerForm.street}
                          onChange={e => setRegisterForm({ ...registerForm, street: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Número</label>
                        <input
                          type="text"
                          placeholder="123"
                          value={registerForm.number}
                          onChange={e => setRegisterForm({ ...registerForm, number: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Bairro</label>
                        <input
                          type="text"
                          placeholder="Bairro"
                          value={registerForm.neighborhood}
                          onChange={e => setRegisterForm({ ...registerForm, neighborhood: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Complemento</label>
                        <input
                          type="text"
                          placeholder="Apto, Bloco..."
                          value={registerForm.complement}
                          onChange={e => setRegisterForm({ ...registerForm, complement: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={registerLoading || !registerForm.name.trim() || registerForm.phone.replace(/\D/g, '').length < 10}
                    className="w-full bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 hover:from-purple-900 hover:to-indigo-900 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-purple-950/20 active:scale-98 transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {registerLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Cadastrando...</span>
                      </span>
                    ) : (
                      <>
                        <span>Criar Minha Conta & Salvar</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* SE ESTIVER LOGADO: HISTÓRICO DE COMPRAS & EDIÇÃO DE PERFIL     */
            /* ============================================================== */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Barra de Sub-abas */}
              <div className="bg-slate-100 dark:bg-slate-800/80 p-1 m-4 mb-2 rounded-2xl flex border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('ORDERS')}
                  className={`flex-1 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'ORDERS'
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-purple-900'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Meus Pedidos ({orders.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('PROFILE')}
                  className={`flex-1 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'PROFILE'
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-purple-900'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Meu Perfil</span>
                </button>
              </div>

              {/* CONTEÚDO DA ABA PEDIDOS */}
              {activeTab === 'ORDERS' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Histórico de Compras
                    </span>
                    <button
                      type="button"
                      onClick={() => loadOrders(customer.phone)}
                      disabled={loadingOrders}
                      className="text-[11px] font-bold text-purple-800 dark:text-purple-400 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingOrders ? 'animate-spin' : ''}`} />
                      <span>Atualizar</span>
                    </button>
                  </div>

                  {loadingOrders && orders.length === 0 ? (
                    <div className="py-12 text-center space-y-2 text-slate-400">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-700" />
                      <p className="text-xs font-bold">Carregando seus pedidos...</p>
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="py-12 text-center space-y-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-3xl p-6 border border-purple-100 dark:border-purple-900/40">
                      <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center mx-auto text-purple-800 dark:text-purple-300">
                        <ShoppingBag className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">Nenhum pedido realizado ainda</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Seus pedidos feitos com este número de celular aparecerão aqui com status em tempo real!
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="py-2.5 px-5 bg-purple-900 hover:bg-purple-800 text-white font-black text-xs rounded-xl shadow-md cursor-pointer"
                      >
                        Ver Cardápio & Fazer Pedido
                      </button>
                    </div>
                  ) : (
                    orders.map(order => {
                      const isCancelled = order.status === 'CANCELADO';
                      const isDelivered = order.status === 'CONCLUIDO';
                      const isActive = !isCancelled && !isDelivered;

                      const statusConfig: Record<string, { label: string; color: string }> = {
                        NOVO: { label: 'Aguardando Confirmação', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300' },
                        PREPARANDO: { label: 'Preparando seu Açaí', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 animate-pulse' },
                        A_CAMINHO: { label: 'Saiu para Entrega', color: 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 animate-bounce' },
                        CONCLUIDO: { label: 'Pedido Entregue', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' },
                        CANCELADO: { label: 'Pedido Não Aceito', color: 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300' }
                      };

                      const currentStatus = statusConfig[order.status] || { label: order.status, color: 'bg-slate-100 text-slate-800' };

                      return (
                        <div
                          key={order.id}
                          className="bg-white dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-mono text-xs font-black text-purple-950 dark:text-purple-300">
                                Pedido #{order.id.slice(-6).toUpperCase()}
                              </span>
                              <span className="text-[11px] text-slate-400 block">
                                {formatDateTime(order.createdAt)}
                              </span>
                            </div>

                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${currentStatus.color}`}>
                              {currentStatus.label}
                            </span>
                          </div>

                          {/* Itens do Pedido */}
                          <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl space-y-1.5 text-xs">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-2 text-[11px]">
                                <div>
                                  <span className="font-black text-purple-950 dark:text-white">
                                    {item.quantity}x {item.size?.name || 'Açaí'}
                                  </span>
                                  {item.base && (
                                    <span className="text-slate-500 block text-[10px]">
                                      Base: {item.base.name}
                                    </span>
                                  )}
                                  {item.freeToppings && item.freeToppings.length > 0 && (
                                    <span className="text-slate-500 block text-[10px]">
                                      Acomp: {item.freeToppings.map(t => t.name).join(', ')}
                                    </span>
                                  )}
                                </div>
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  {formatCurrency(item.unitPrice * item.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Motivo de recusa se houver */}
                          {isCancelled && order.cancellationReason && (
                            <div className="p-2.5 bg-red-50 dark:bg-red-950/60 rounded-xl border border-red-200 dark:border-red-800 text-[11px] text-red-800 dark:text-red-300">
                              <span className="font-black block">Motivo informado pela loja:</span>
                              <span>{order.cancellationReason}</span>
                            </div>
                          )}

                          {/* Rodapé do Card */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/60">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Total</span>
                              <span className="font-black text-sm text-purple-950 dark:text-amber-400">
                                {formatCurrency(order.total)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isActive && onTrackOrder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onTrackOrder(order);
                                    onClose();
                                  }}
                                  className="py-1.5 px-3 bg-amber-400 hover:bg-amber-300 text-purple-950 font-black text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>Rastrear</span>
                                </button>
                              )}

                              {onReorder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onReorder(order.items);
                                    onClose();
                                  }}
                                  className="py-1.5 px-3 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/60 dark:hover:bg-purple-900 text-purple-950 dark:text-purple-200 font-bold text-xs rounded-xl cursor-pointer"
                                  title="Adiciona estes itens novamente à sacola"
                                >
                                  Repetir Pedido
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* CONTEÚDO DA ABA PERFIL */}
              {activeTab === 'PROFILE' && (
                <form onSubmit={handleProfileSave} className="flex-1 overflow-y-auto p-4 space-y-4">
                  {profileFeedback && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Perfil atualizado com sucesso!</span>
                    </div>
                  )}

                  {profileError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 text-xs font-bold rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{profileError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full text-sm font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Celular / WhatsApp
                    </label>
                    <input
                      type="tel"
                      required
                      value={editForm.phone}
                      onChange={e => setEditForm({ ...editForm, phone: formatPhone(e.target.value) })}
                      className="w-full text-sm font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Não é permitido cadastrar um número já usado por outro cliente.
                    </span>
                  </div>

                  {/* Endereço de Entrega */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                      <span>Endereço de Entrega Padrão</span>
                    </span>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Rua</label>
                        <input
                          type="text"
                          placeholder="Rua / Avenida"
                          value={editForm.street}
                          onChange={e => setEditForm({ ...editForm, street: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Número</label>
                        <input
                          type="text"
                          placeholder="123"
                          value={editForm.number}
                          onChange={e => setEditForm({ ...editForm, number: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Bairro</label>
                        <input
                          type="text"
                          placeholder="Bairro"
                          value={editForm.neighborhood}
                          onChange={e => setEditForm({ ...editForm, neighborhood: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Complemento</label>
                        <input
                          type="text"
                          placeholder="Apto, Bloco..."
                          value={editForm.complement}
                          onChange={e => setEditForm({ ...editForm, complement: e.target.value })}
                          className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Ponto de Referência</label>
                      <input
                        type="text"
                        placeholder="Ex: Próximo à padaria"
                        value={editForm.reference}
                        onChange={e => setEditForm({ ...editForm, reference: e.target.value })}
                        className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="w-full bg-purple-900 hover:bg-purple-800 text-white font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>{profileSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
                  </button>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full py-2.5 px-4 text-xs font-bold text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 border border-red-200 dark:border-red-900/60"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair desta Conta / Trocar de Celular</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
