import { supabase, isSupabaseConfigured } from '../utils/supabase';
import type { StoreSettings, MenuData, Order, OrderStatus, InventoryItem, CustomerProfile, PaymentMethod } from '../types';

// ==============================================================================
// SEGURANÇA: Todas as operações sensíveis passam por funções RPC no banco
// (SECURITY DEFINER) que validam sessão, entrada e recalculam preços.
// Nenhuma tabela sensível (pedidos, clientes, estoque) é acessada diretamente.
// ==============================================================================

const ADMIN_SESSION_KEY = 'luky_admin_session';
const CUSTOMER_TOKEN_KEY = 'luky_customer_token';
const POLL_INTERVAL_MS = 20000;

// ------------------------------------------------------------------------------
// SESSÃO DO ADMINISTRADOR
// ------------------------------------------------------------------------------

export function getAdminSessionToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminSessionToken(token: string) {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, token);
    // Limpa resquícios do modelo antigo (PIN em texto puro no navegador)
    sessionStorage.removeItem('luky_admin_pin');
    sessionStorage.removeItem('luky_admin_unlocked');
  } catch {
    // ignore
  }
}

export function clearAdminSession() {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem('luky_admin_pin');
    sessionStorage.removeItem('luky_admin_unlocked');
  } catch {
    // ignore
  }
}

/** Dispara quando o banco informa que a sessão do admin expirou. */
function handleAdminUnauthorized() {
  clearAdminSession();
  window.dispatchEvent(new CustomEvent('luky-admin-unauthorized'));
}

function isUnauthorizedResult(data: unknown, error: { code?: string; message?: string } | null): boolean {
  if (error && (error.code === '42501' || /unauthorized/i.test(error.message || ''))) return true;
  return Boolean(data && typeof data === 'object' && (data as any).unauthorized);
}

export async function checkAdminSession(): Promise<boolean> {
  const token = getAdminSessionToken();
  if (!token || !isSupabaseConfigured || !supabase) return false;
  try {
    const { data, error } = await supabase.rpc('rpc_admin_check_session', { p_session_token: token });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function adminLogout(): Promise<void> {
  const token = getAdminSessionToken();
  clearAdminSession();
  if (token && isSupabaseConfigured && supabase) {
    try {
      await supabase.rpc('rpc_admin_logout', { p_session_token: token });
    } catch {
      // ignore
    }
  }
}

export async function adminLoginRPC(pin: string, deviceToken = '') {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_login', {
      p_pin: pin.trim(),
      p_device_token: deviceToken.trim()
    });

    if (error) {
      console.warn('Erro ao executar rpc_admin_login:', error.message);
      return null;
    }
    if (data?.success && data.sessionToken) {
      setAdminSessionToken(data.sessionToken);
    }
    return data;
  } catch (err) {
    console.error('Exceção ao chamar rpc_admin_login:', err);
    return null;
  }
}

// ------------------------------------------------------------------------------
// SINAL DE TEMPO REAL (sem dados pessoais) + polling de segurança
// ------------------------------------------------------------------------------

type SignalField = 'orders_version' | 'inventory_version';

function subscribeToSignal(field: SignalField, onChange: () => void, channelName: string) {
  const client = supabase;
  if (!isSupabaseConfigured || !client) return () => {};

  let lastVersion: number | null = null;
  let channel: any = null;

  try {
    channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'realtime_signal' },
        (payload) => {
          try {
            const row = payload.new as Record<string, unknown>;
            const v = Number(row?.[field]);
            if (lastVersion === null || v !== lastVersion) {
              lastVersion = v;
              onChange();
            }
          } catch (e) {
            console.warn('Erro ao processar payload realtime:', e);
          }
        }
      )
      .subscribe();
  } catch (err) {
    console.warn(`Aviso: Realtime indisponível para ${channelName}, usando polling:`, err);
  }

  // Polling de segurança caso o Realtime caia
  const interval = window.setInterval(() => {
    try {
      onChange();
    } catch (e) {
      console.warn('Erro no ciclo de polling:', e);
    }
  }, POLL_INTERVAL_MS);

  return () => {
    window.clearInterval(interval);
    if (channel) {
      try {
        client.removeChannel(channel);
      } catch {}
    }
  };
}

// ==============================================================================
// CONFIGURAÇÕES DA LOJA (STORE SETTINGS)
// ==============================================================================

export async function fetchStoreSettings(): Promise<StoreSettings | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('store_name, is_open, whatsapp, pix_key, pix_key_type, delivery_fee, estimated_time, address, min_order_value')
      .eq('id', 1)
      .single();

    if (error || !data) {
      console.warn('Erro ao buscar store_settings do Supabase:', error?.message);
      return null;
    }

    return {
      storeName: data.store_name,
      isOpen: data.is_open,
      whatsapp: data.whatsapp,
      pixKey: data.pix_key,
      pixKeyType: data.pix_key_type,
      deliveryFee: Number(data.delivery_fee),
      estimatedTime: data.estimated_time,
      address: data.address,
      minOrderValue: Number(data.min_order_value)
    };
  } catch (err) {
    console.error('Exceção ao buscar configurações:', err);
    return null;
  }
}

export async function saveStoreSettings(settings: StoreSettings): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'Banco de dados não configurado.' };

  const newPin = settings.adminPin && /^\d+$/.test(settings.adminPin) ? settings.adminPin : null;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_update_settings', {
      p_session_token: getAdminSessionToken(),
      p_store_name: settings.storeName,
      p_is_open: settings.isOpen,
      p_whatsapp: settings.whatsapp,
      p_pix_key: settings.pixKey,
      p_pix_key_type: settings.pixKeyType,
      p_delivery_fee: settings.deliveryFee,
      p_estimated_time: settings.estimatedTime,
      p_address: settings.address,
      p_min_order_value: settings.minOrderValue,
      p_new_pin: newPin
    });

    if (isUnauthorizedResult(data, error)) {
      handleAdminUnauthorized();
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }
    if (error) {
      console.warn('RPC de atualização retornou erro:', error.message);
      return { success: false, error: 'Não foi possível salvar as configurações.' };
    }
    if (!data?.success) {
      return { success: false, error: data?.error || 'Alteração negada.' };
    }
    return { success: true };
  } catch (err) {
    console.error('Exceção ao salvar configurações:', err);
    return { success: false, error: 'Erro de conexão ao salvar configurações.' };
  }
}

export function subscribeToStoreSettings(onUpdate: (settings: StoreSettings) => void) {
  const client = supabase;
  if (!isSupabaseConfigured || !client) return () => {};

  const channel = client
    .channel('realtime_store_settings')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'store_settings' },
      () => {
        fetchStoreSettings().then(st => {
          if (st) onUpdate(st);
        });
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ==============================================================================
// CARDÁPIO (MENU DATA)
// ==============================================================================

export async function fetchMenuData(): Promise<MenuData | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('menu_data')
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data?.data) return null;
    return data.data as MenuData;
  } catch (err) {
    console.error('Exceção ao buscar menu:', err);
    return null;
  }
}

export async function saveMenuData(menu: MenuData): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_update_menu', {
      p_session_token: getAdminSessionToken(),
      p_menu: menu
    });

    if (isUnauthorizedResult(data, error)) {
      handleAdminUnauthorized();
      return false;
    }
    if (error || !data?.success) {
      console.warn('Falha ao salvar cardápio:', error?.message || data?.error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Exceção ao salvar cardápio:', err);
    return false;
  }
}

export function subscribeToMenuData(onUpdate: (menu: MenuData) => void) {
  const client = supabase;
  if (!isSupabaseConfigured || !client) return () => {};

  const channel = client
    .channel('realtime_menu_data_sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menu_data' },
      () => {
        fetchMenuData().then(m => {
          if (m) onUpdate(m);
        });
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ==============================================================================
// PEDIDOS (ORDERS) & SINCRONIZAÇÃO DE PAGAMENTO / CANCELAMENTO
// ==============================================================================

const PAID_ORDERS_CACHE_KEY = 'luky_paid_orders_cache';
const CANCELLED_ORDERS_CACHE_KEY = 'luky_cancelled_orders_cache';

export function markOrderPaidLocally(orderId: string) {
  if (!orderId) return;
  try {
    const raw = localStorage.getItem(PAID_ORDERS_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[orderId] = true;
    localStorage.setItem(PAID_ORDERS_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function isOrderPaidLocally(orderId: string): boolean {
  if (!orderId) return false;
  try {
    const raw = localStorage.getItem(PAID_ORDERS_CACHE_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw);
    return Boolean(map && map[orderId]);
  } catch {
    return false;
  }
}

export function markOrderCancelledLocally(orderId: string, reason: string) {
  if (!orderId) return;
  try {
    const raw = localStorage.getItem(CANCELLED_ORDERS_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[orderId] = reason || 'Cancelado pelo cliente antes do preparo';
    localStorage.setItem(CANCELLED_ORDERS_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getLocalOrderCancellation(orderId: string): string | undefined {
  if (!orderId) return undefined;
  try {
    const raw = localStorage.getItem(CANCELLED_ORDERS_CACHE_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw);
    return map?.[orderId] || undefined;
  } catch {
    return undefined;
  }
}

export function parseOrderRow(row: any): Order {
  const rawNotes = String(row.notes || '');

  // 1. Detecta confirmação de pagamento (via coluna, tag em notes ou cache local)
  const hasPaidTag = /PAGO_CONFIRMADO|MP_PAGO|PAGAMENTO_APROVADO/i.test(rawNotes);
  const isPaid = Boolean(
    row.is_paid ||
    row.paymentDetails?.isPaid ||
    hasPaidTag ||
    isOrderPaidLocally(row.id)
  );
  if (hasPaidTag || row.is_paid) {
    markOrderPaidLocally(row.id);
  }

  // Remove marcadores de pagamento das notes antes de procurar motivo de cancelamento
  let workingNotes = rawNotes
    .replace(/[[(](?:RECUSADO|CANCELADO):\s*PAGO_CONFIRMADO[^\])]*[\])]\s*(\|\s*)?/gi, '')
    .replace(/[[(]?(?:PAGO_CONFIRMADO|MP_PAGO|PAGAMENTO_APROVADO)(?::\s*[^\])|]+)?[\])]?\s*(\|\s*)?/gi, '')
    .trim();

  // 2. Detecta motivo de recusa ou cancelamento (tanto com [ ] quanto com ( ))
  let cancellationReason: string | undefined = undefined;
  const cancelMatch = workingNotes.match(/[[(](?:RECUSADO|CANCELADO(?:\s+PELO\s+CLIENTE)?):\s*([^\])]+)[\])]/i);
  if (cancelMatch) {
    cancellationReason = cancelMatch[1].trim();
    workingNotes = workingNotes
      .replace(/[[(](?:RECUSADO|CANCELADO(?:\s+PELO\s+CLIENTE)?):\s*[^\])]+[\])]\s*(\|\s*)?/gi, '')
      .trim();
  }

  // 3. Detecta se o pedido é do Mercado Pago (pelo payment_method ou pela tag nas notes)
  const hasMpTag = /PAGAMENTO:\s*MERCADO[_\s]PAGO/i.test(rawNotes);
  const isMpMethod =
    row.payment_method === 'MERCADO_PAGO' ||
    row.payment_method === 'CARTAO_ONLINE' ||
    row.payment_method === 'MERCADO_PAGO_PIX' ||
    row.payment_method === 'MERCADO_PAGO_CARTAO';
  const isMercadoPago = Boolean(hasMpTag || isMpMethod || row.paymentDetails?.gateway === 'MERCADO_PAGO');

  // Limpa tags internas de pagamento das observações visíveis
  const cleanNotes = workingNotes
    .replace(/[[(]?PAGAMENTO:\s*MERCADO[_\s]PAGO[\])]?\s*(\|\s*)?/gi, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();

  // Verifica se houve cancelamento solicitado pelo cliente enquanto estava 'NOVO'
  const localCancelReason = getLocalOrderCancellation(row.id);
  const effectiveStatus = (
    row.status === 'NOVO' && localCancelReason ? 'CANCELADO' : (row.status || 'NOVO')
  ) as OrderStatus;
  if (effectiveStatus === 'CANCELADO' && !cancellationReason && localCancelReason) {
    cancellationReason = localCancelReason;
  }

  let parsedItems: any[] = [];
  if (Array.isArray(row.items)) {
    parsedItems = row.items;
  } else if (typeof row.items === 'string') {
    try {
      const parsed = JSON.parse(row.items);
      if (Array.isArray(parsed)) parsedItems = parsed;
    } catch {}
  }

  let parsedAddress = undefined;
  if (row.address && typeof row.address === 'object') {
    parsedAddress = {
      street: String(row.address.street || ''),
      number: String(row.address.number || ''),
      neighborhood: String(row.address.neighborhood || ''),
      complement: row.address.complement ? String(row.address.complement) : '',
      reference: row.address.reference ? String(row.address.reference) : ''
    };
  } else if (row.address && typeof row.address === 'string') {
    parsedAddress = {
      street: row.address,
      number: String(row.number || ''),
      neighborhood: String(row.neighborhood || ''),
      complement: String(row.complement || ''),
      reference: String(row.reference || '')
    };
  }

  return {
    id: row.id,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    status: effectiveStatus,
    customerName: row.customer_name || row.customerName || 'Cliente',
    customerPhone: row.customer_phone || row.customerPhone || '',
    orderType: row.delivery_type || row.orderType || 'ENTREGA',
    address: parsedAddress,
    paymentMethod: (isMercadoPago ? 'MERCADO_PAGO' : (row.payment_method || row.paymentMethod || 'PIX')) as PaymentMethod,
    paymentDetails: {
      ...(row.change_for ? { changeFor: Number(row.change_for), needChange: true } : {}),
      ...(row.paymentDetails || {}),
      ...(isMercadoPago ? { gateway: 'MERCADO_PAGO' } : {}),
      isPaid
    },
    items: parsedItems,
    subtotal: Number(row.subtotal) || 0,
    deliveryFee: Number(row.delivery_fee ?? row.deliveryFee) || 0,
    total: Number(row.total) || 0,
    notes: cleanNotes || undefined,
    needCutlery: row.need_cutlery ?? row.needCutlery ?? (/SEM COLHER/i.test(rawNotes) ? false : true),
    cancellationReason
  };
}

/** Lista de pedidos para o painel (exige sessão de admin). */
export async function fetchOrders(): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase.rpc('rpc_admin_list_orders', {
      p_session_token: getAdminSessionToken(),
      p_limit: 500
    });

    if (isUnauthorizedResult(data, error)) {
      handleAdminUnauthorized();
      return [];
    }
    if (error || !Array.isArray(data)) {
      console.warn('Erro ao buscar pedidos:', error?.message);
      return [];
    }
    return data.map(parseOrderRow);
  } catch (err) {
    console.error('Exceção ao buscar pedidos:', err);
    return [];
  }
}

/** Rastreamento público de um pedido pelo seu ID aleatório. */
export async function fetchOrderById(orderId: string): Promise<Order | null> {
  if (!isSupabaseConfigured || !supabase || !orderId) return null;

  try {
    const { data, error } = await supabase.rpc('rpc_get_order', { p_order_id: orderId });
    if (error || !data) return null;
    return parseOrderRow(data);
  } catch (err) {
    console.error('Exceção ao buscar pedido por id:', err);
    return null;
  }
}

/**
 * Cria o pedido. O banco ignora preços enviados pelo navegador e recalcula
 * tudo a partir do cardápio oficial. Lança Error com mensagem amigável.
 */
export async function createOrder(order: Partial<Order> & { notes?: string }): Promise<Order> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Banco de dados não configurado.');
  }

  const isMp =
    order.paymentMethod === 'MERCADO_PAGO' ||
    order.paymentMethod === 'CARTAO_ONLINE' ||
    order.paymentDetails?.gateway === 'MERCADO_PAGO';

  // 'CARTAO_ONLINE' já é aceito nativamente pela função rpc_create_order do Supabase V2
  const dbPaymentMethod: PaymentMethod = isMp ? 'CARTAO_ONLINE' : (order.paymentMethod || 'PIX');

  const payload = {
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    orderType: order.orderType,
    address: order.address,
    paymentMethod: dbPaymentMethod,
    paymentDetails: order.paymentDetails,
    notes: order.notes,
    items: (order.items || []).map(item => ({
      id: item.id,
      size: { id: item.size?.id },
      base: { id: item.base?.id },
      freeToppings: [
        ...(item.freeToppings || []),
        ...(item.fruits || [])
      ].map(t => ({ id: t.id })),
      fruits: (item.fruits || []).map(f => ({ id: f.id })),
      premiumToppings: (item.premiumToppings || []).map(p => ({ item: { id: p.item?.id }, quantity: p.quantity })),
      syrups: (item.syrups || []).map(s => ({ id: s.id })),
      notes: (item.notes || '').replace(/\[Frutas:[^\]]*\]\s*-?\s*/gi, '').trim(),
      needSpoon: item.needSpoon !== false,
      quantity: item.quantity
    }))
  };

  let { data, error } = await supabase.rpc('rpc_create_order', { p_order: payload });

  // Fallback seguro caso o banco tenha constraint antiga:
  const isPaymentError = Boolean(
    (error && (error.message?.includes('pagamento') || error.message?.includes('payment'))) ||
    (data && !data.success && data.error && (data.error.includes('pagamento') || data.error.includes('payment')))
  );

  if (isPaymentError && payload.paymentMethod !== 'PIX') {
    console.warn('Banco rejeitou forma de pagamento, aplicando fallback seguro para PIX:', error?.message || data?.error);
    payload.paymentMethod = 'PIX' as PaymentMethod;
    const retry = await supabase.rpc('rpc_create_order', { p_order: payload });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('Erro ao criar pedido:', error.message);
    throw new Error('Não foi possível registrar o pedido. Tente novamente.');
  }
  if (!data?.success || !data.order) {
    throw new Error(data?.error || 'Não foi possível registrar o pedido.');
  }
  return parseOrderRow(data.order);
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  cancellationReason?: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_update_order_status', {
      p_session_token: getAdminSessionToken(),
      p_order_id: orderId,
      p_status: newStatus,
      p_reason: cancellationReason || null
    });

    if (isUnauthorizedResult(data, error)) {
      handleAdminUnauthorized();
      return false;
    }
    if (error || !data?.success) {
      console.error('Erro ao atualizar status do pedido:', error?.message || data?.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exceção ao atualizar status:', err);
    return false;
  }
}

/**
 * Registra e propaga em tempo real que o pagamento do pedido foi confirmado.
 * Funciona tanto com a RPC dedicada quanto com a RPC administrativa já instalada no banco.
 */
export async function confirmOrderPayment(
  orderId: string,
  currentStatus: OrderStatus = 'NOVO',
  paymentId?: string
): Promise<boolean> {
  if (!orderId) return false;
  markOrderPaidLocally(orderId);

  // 1. Tenta atualizar no backend local se estiver disponível
  try {
    fetch(`/api/orders/${encodeURIComponent(orderId)}/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId })
    }).catch(() => {});
  } catch {
    // ignore
  }

  if (!isSupabaseConfigured || !supabase) return true;

  // 2. Dispara broadcast em tempo real para todos os clientes/painel conectados
  try {
    const ch = supabase.channel('luky_order_events');
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({
          type: 'broadcast',
          event: 'order_paid',
          payload: { orderId, paymentId }
        }).finally(() => {
          setTimeout(() => supabase?.removeChannel(ch), 1500);
        });
      }
    });
  } catch {
    // ignore
  }

  // 3. Tenta RPC pública de confirmação de pagamento (se instalada no Supabase)
  try {
    const { data, error } = await supabase.rpc('rpc_confirm_order_payment', {
      p_order_id: orderId,
      p_payment_id: paymentId || null
    });
    if (!error && data?.success) {
      return true;
    }
  } catch {
    // fallback abaixo
  }

  // 4. Se houver sessão de admin ativa, grava 'PAGO_CONFIRMADO' diretamente no banco via rpc_admin_update_order_status
  const adminToken = getAdminSessionToken();
  if (adminToken) {
    try {
      const { data, error } = await supabase.rpc('rpc_admin_update_order_status', {
        p_session_token: adminToken,
        p_order_id: orderId,
        p_status: currentStatus,
        p_reason: 'PAGO_CONFIRMADO'
      });
      if (!error && data?.success) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return true;
}

/**
 * Permite ao cliente cancelar seu próprio pedido APENAS enquanto o status ainda for 'NOVO'
 * (antes de o Luky iniciar o preparo).
 */
export async function cancelOrderByCustomer(
  orderId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  if (!orderId) {
    return { success: false, error: 'Pedido inválido.' };
  }

  const finalReason = (reason || 'Cancelado pelo cliente antes do início do preparo').trim();

  // 1. Verifica status atual no Supabase para garantir que o preparo ainda não começou
  if (isSupabaseConfigured && supabase) {
    const latest = await fetchOrderById(orderId);
    if (latest && latest.status !== 'NOVO' && latest.status !== 'CANCELADO') {
      return {
        success: false,
        error: 'O Luky já iniciou o preparo do seu pedido! Não é mais possível cancelar automaticamente.'
      };
    }
  }

  // 2. Tenta cancelar no backend local (se em execução)
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: finalReason })
    });
    if (res.status === 400) {
      const errData = await res.json().catch(() => ({}));
      if (errData?.error) {
        return { success: false, error: errData.error };
      }
    }
  } catch {
    // Continua via Supabase
  }

  markOrderCancelledLocally(orderId, finalReason);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true };
  }

  // 3. Tenta RPC dedicada rpc_customer_cancel_order no Supabase
  let persistedInDb = false;
  try {
    const { data, error } = await supabase.rpc('rpc_customer_cancel_order', {
      p_order_id: orderId,
      p_reason: finalReason
    });
    if (!error && data?.success) {
      persistedInDb = true;
    } else if (data && data.success === false && data.error) {
      return { success: false, error: data.error };
    }
  } catch {
    // fallback abaixo
  }

  // 4. Se houver sessão de admin ativa no mesmo navegador, persiste diretamente no banco
  const adminToken = getAdminSessionToken();
  if (!persistedInDb && adminToken) {
    try {
      const { data, error } = await supabase.rpc('rpc_admin_update_order_status', {
        p_session_token: adminToken,
        p_order_id: orderId,
        p_status: 'CANCELADO',
        p_reason: `Cancelado pelo cliente: ${finalReason}`
      });
      if (!error && data?.success) {
        persistedInDb = true;
      }
    } catch {
      // ignore
    }
  }

  // 5. Envia evento em tempo real via Supabase Broadcast para o Painel do Luky atualizar imediatamente
  try {
    const ch = supabase.channel('luky_order_events');
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({
          type: 'broadcast',
          event: 'customer_cancelled_order',
          payload: { orderId, reason: `Cancelado pelo cliente: ${finalReason}` }
        }).finally(() => {
          setTimeout(() => supabase?.removeChannel(ch), 1500);
        });
      }
    });
  } catch {
    // ignore
  }

  return { success: true };
}

/**
 * Assina eventos instantâneos de pagamento e cancelamento de clientes via Supabase Broadcast.
 */
export function subscribeToOrderBroadcastEvents(handlers: {
  onOrderPaid?: (payload: { orderId: string; paymentId?: string }) => void;
  onCustomerCancelled?: (payload: { orderId: string; reason: string }) => void;
}) {
  const client = supabase;
  if (!isSupabaseConfigured || !client) return () => {};

  const channel = client
    .channel('luky_order_events')
    .on('broadcast', { event: 'order_paid' }, ({ payload }) => {
      if (payload?.orderId) {
        markOrderPaidLocally(payload.orderId);
        handlers.onOrderPaid?.(payload);
      }
    })
    .on('broadcast', { event: 'customer_cancelled_order' }, ({ payload }) => {
      if (payload?.orderId) {
        markOrderCancelledLocally(payload.orderId, payload.reason || 'Cancelado pelo cliente');
        handlers.onCustomerCancelled?.(payload);
      }
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ==============================================================================
// CONTROLE DE ESTOQUE (INVENTORY - FOCO EXCLUSIVO EM EMBALAGENS)
// A baixa/estorno de embalagens agora acontece no banco, junto com o pedido.
// ==============================================================================

function parseInventoryRow(row: any): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity),
    unit: row.unit,
    min_alert_quantity: Number(row.min_alert_quantity),
    cost_price: row.cost_price ? Number(row.cost_price) : 0,
    supplier: row.supplier,
    updated_at: row.updated_at
  };
}

export async function fetchInventory(): Promise<InventoryItem[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase.rpc('rpc_admin_list_inventory', {
      p_session_token: getAdminSessionToken()
    });

    if (isUnauthorizedResult(data, error)) {
      handleAdminUnauthorized();
      return [];
    }
    if (error || !Array.isArray(data)) {
      console.warn('Erro ao buscar estoque de embalagens:', error?.message);
      return [];
    }
    return data.map(parseInventoryRow);
  } catch (err) {
    console.error('Exceção ao buscar estoque:', err);
    return [];
  }
}

export async function updateInventoryQuantity(id: string, newQuantity: number): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_set_inventory_quantity', {
      p_session_token: getAdminSessionToken(),
      p_id: id,
      p_quantity: Math.max(0, newQuantity)
    });
    if (isUnauthorizedResult(data, error)) {
      handleAdminUnauthorized();
      return false;
    }
    return !error && Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function saveInventoryItem(item: InventoryItem): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_upsert_inventory_item', {
      p_session_token: getAdminSessionToken(),
      p_item: {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit || 'un',
        min_alert_quantity: item.min_alert_quantity || 10,
        cost_price: item.cost_price,
        supplier: item.supplier
      }
    });
    if (isUnauthorizedResult(data, error)) {
      handleAdminUnauthorized();
      return false;
    }
    return !error && Boolean(data?.success);
  } catch {
    return false;
  }
}

// ==============================================================================
// REALTIME SUBSCRIPTIONS
// Os dados nunca trafegam pelo canal público: o canal só avisa "mudou" e o
// painel/cliente busca os dados novamente via RPC autenticada.
// ==============================================================================

export function subscribeToOrders(
  onNewOrder: (order: Order) => void,
  onUpdateOrder: (order: Order) => void
) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const known = new Map<string, string>();
  let initialized = false;
  let running = false;

  const refresh = async () => {
    if (running) return;
    running = true;
    try {
      const orders = await fetchOrders();
      for (const order of orders.slice().reverse()) {
        const fingerprint = `${order.status}|${order.updatedAt || ''}|${Boolean(order.paymentDetails?.isPaid)}|${order.notes || ''}|${order.cancellationReason || ''}`;
        const previous = known.get(order.id);
        if (previous === undefined) {
          known.set(order.id, fingerprint);
          if (initialized) onNewOrder(order);
        } else if (previous !== fingerprint) {
          known.set(order.id, fingerprint);
          onUpdateOrder(order);
        }
      }
      initialized = true;
    } finally {
      running = false;
    }
  };

  refresh();
  return subscribeToSignal('orders_version', refresh, 'admin-orders-signal');
}

export function subscribeToOrder(
  orderId: string,
  onUpdate: (order: Order) => void
) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  let lastFingerprint = '';
  const refresh = async () => {
    const order = await fetchOrderById(orderId);
    if (!order) return;
    const fingerprint = `${order.status}|${order.updatedAt || ''}|${Boolean(order.paymentDetails?.isPaid)}|${order.cancellationReason || ''}`;
    if (fingerprint !== lastFingerprint) {
      const isFirst = lastFingerprint === '';
      lastFingerprint = fingerprint;
      if (!isFirst) onUpdate(order);
    }
  };

  refresh();
  const uniqueChannel = `order-track-${orderId}-${Math.random().toString(36).substring(2, 7)}`;
  return subscribeToSignal('orders_version', refresh, uniqueChannel);
}

export function subscribeToInventory(onUpdate: (item: InventoryItem) => void) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const refresh = async () => {
    const items = await fetchInventory();
    items.forEach(onUpdate);
  };

  return subscribeToSignal('inventory_version', refresh, 'admin-inventory-signal');
}

// ==============================================================================
// GESTÃO DE CLIENTES & HISTÓRICO DE COMPRAS
// Login exige celular + PIN pessoal. O token de sessão fica no navegador e
// é validado pelo banco a cada consulta.
// ==============================================================================

function getCustomerToken(): string {
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setCustomerToken(token: string) {
  try {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    // Remove o cache antigo que guardava dados de clientes no navegador
    localStorage.removeItem('luky_local_customers');
  } catch {
    // ignore
  }
}

export function hasCustomerSession(): boolean {
  return Boolean(getCustomerToken());
}

function parseCustomer(data: any): CustomerProfile {
  if (!data || typeof data !== 'object') {
    return { id: '', name: 'Cliente', phone: '' };
  }

  let address = undefined;
  if (data.address && typeof data.address === 'object') {
    address = {
      street: String(data.address.street || ''),
      number: String(data.address.number || ''),
      neighborhood: String(data.address.neighborhood || ''),
      complement: data.address.complement ? String(data.address.complement) : undefined,
      reference: data.address.reference ? String(data.address.reference) : undefined
    };
  } else if (data.street) {
    address = {
      street: String(data.street),
      number: String(data.number || ''),
      neighborhood: String(data.neighborhood || ''),
      complement: data.complement ? String(data.complement) : undefined,
      reference: data.reference ? String(data.reference) : undefined
    };
  }

  return {
    id: String(data.id || ''),
    name: String(data.name || 'Cliente'),
    phone: String(data.phone || ''),
    address,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

type CustomerResult = { success: boolean; customer?: CustomerProfile; error?: string; unauthorized?: boolean };

export async function loginCustomer(phone: string, pin: string): Promise<CustomerResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Serviço de contas indisponível no momento.' };
  }
  try {
    const { data, error } = await supabase.rpc('rpc_customer_login', {
      p_phone: phone.replace(/\D/g, ''),
      p_pin: pin.trim()
    });
    if (error) return { success: false, error: 'Erro ao consultar cadastro. Tente novamente.' };
    if (!data?.success) return { success: false, error: data?.error || 'Celular ou PIN incorretos.' };
    setCustomerToken(data.token);
    return { success: true, customer: parseCustomer(data.customer) };
  } catch {
    return { success: false, error: 'Erro ao consultar cadastro. Tente novamente.' };
  }
}

/**
 * Cadastra um novo cliente (o banco garante que não haja números duplicados).
 */
export async function createCustomer(profile: CustomerProfile, pin: string): Promise<CustomerResult> {
  const cleanPhone = profile.phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: 'Por favor, informe um número de celular válido com DDD (mínimo 10 dígitos).' };
  }
  if (!profile.name.trim()) {
    return { success: false, error: 'Por favor, informe seu nome completo.' };
  }
  if (!/^\d{4,8}$/.test(pin.trim())) {
    return { success: false, error: 'Crie um PIN de 4 a 8 números para proteger sua conta.' };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Serviço de contas indisponível no momento.' };
  }

  try {
    const { data, error } = await supabase.rpc('rpc_customer_register', {
      p_name: profile.name.trim(),
      p_phone: cleanPhone,
      p_pin: pin.trim(),
      p_address: profile.address || null
    });
    if (error) return { success: false, error: 'Erro ao salvar cadastro. Tente novamente.' };
    if (!data?.success) return { success: false, error: data?.error || 'Não foi possível cadastrar.' };
    setCustomerToken(data.token);
    return { success: true, customer: parseCustomer(data.customer) };
  } catch {
    return { success: false, error: 'Erro ao salvar cadastro. Verifique a conexão.' };
  }
}

/**
 * Atualiza o perfil do cliente logado (nome, endereço ou celular).
 */
export async function updateCustomer(_id: string, updates: Partial<CustomerProfile>): Promise<CustomerResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Serviço de contas indisponível no momento.' };
  }
  try {
    const { data, error } = await supabase.rpc('rpc_customer_update', {
      p_token: getCustomerToken(),
      p_profile: {
        name: updates.name,
        phone: updates.phone,
        address: updates.address || null
      }
    });
    if (error) return { success: false, error: 'Erro ao atualizar perfil.' };
    if (!data?.success) {
      return { success: false, error: data?.error || 'Erro ao salvar alterações.', unauthorized: Boolean(data?.unauthorized) };
    }
    return { success: true, customer: parseCustomer(data.customer) };
  } catch {
    return { success: false, error: 'Erro ao atualizar perfil.' };
  }
}

export async function logoutCustomer(): Promise<void> {
  const token = getCustomerToken();
  try {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  } catch {
    // ignore
  }
  if (token && isSupabaseConfigured && supabase) {
    try {
      await supabase.rpc('rpc_customer_logout', { p_token: token });
    } catch {
      // ignore
    }
  }
}

/**
 * Busca o histórico de compras do cliente logado (validado pelo token no banco).
 */
export async function fetchCustomerOrders(_phone?: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const token = getCustomerToken();
  if (!token) return [];

  try {
    const { data, error } = await supabase.rpc('rpc_customer_orders', { p_token: token });
    if (error || !Array.isArray(data)) return [];
    return data.map(parseOrderRow);
  } catch (err) {
    console.error('Erro ao buscar histórico de pedidos do cliente:', err);
    return [];
  }
}

/**
 * Observa em tempo real alterações nos pedidos do cliente logado.
 */
export function subscribeToCustomerOrders(onUpdate: () => void) {
  return subscribeToSignal('orders_version', onUpdate, 'customer-orders-signal');
}
