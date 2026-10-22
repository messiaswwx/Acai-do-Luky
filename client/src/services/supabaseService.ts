import { supabase, isSupabaseConfigured } from '../utils/supabase';
import type { StoreSettings, MenuData, Order, OrderStatus, InventoryItem } from '../types';

// ==============================================================================
// CONFIGURAÇÕES DA LOJA (STORE SETTINGS)
// ==============================================================================

export async function fetchStoreSettings(): Promise<StoreSettings | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !data) {
      console.warn('Erro ao buscar store_settings do Supabase:', error);
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
      minOrderValue: Number(data.min_order_value),
      adminPin: data.admin_pin,
      twoFactorEnabled: data.two_factor_enabled,
      twoFactorBackupCode: data.two_factor_backup_code
    };
  } catch (err) {
    console.error('Exceção ao buscar configurações:', err);
    return null;
  }
}

export async function saveStoreSettings(settings: StoreSettings): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  const pinToUse = sessionStorage.getItem('luky_admin_pin') || settings.adminPin || '1234';

  try {
    const { data, error } = await supabase.rpc('rpc_admin_update_settings', {
      p_pin: pinToUse,
      p_store_name: settings.storeName,
      p_is_open: settings.isOpen,
      p_whatsapp: settings.whatsapp,
      p_pix_key: settings.pixKey,
      p_pix_key_type: settings.pixKeyType,
      p_delivery_fee: settings.deliveryFee,
      p_estimated_time: settings.estimatedTime,
      p_address: settings.address,
      p_min_order_value: settings.minOrderValue,
      p_new_pin: settings.adminPin && settings.adminPin !== 'PROTEGIDO' ? settings.adminPin : null,
      p_new_backup_code: settings.twoFactorBackupCode && settings.twoFactorBackupCode !== 'PROTEGIDO' ? settings.twoFactorBackupCode : null,
      p_2fa_enabled: settings.twoFactorEnabled !== false
    });

    if (error) {
      console.warn('RPC de atualização retornou erro:', error);
      // Fallback direto
      const { error: directError } = await supabase
        .from('store_settings')
        .update({
          store_name: settings.storeName,
          is_open: settings.isOpen,
          whatsapp: settings.whatsapp,
          pix_key: settings.pixKey,
          pix_key_type: settings.pixKeyType,
          delivery_fee: settings.deliveryFee,
          estimated_time: settings.estimatedTime,
          address: settings.address,
          min_order_value: settings.minOrderValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      return !directError;
    }

    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      console.warn('RPC negada:', data);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exceção ao salvar configurações:', err);
    return false;
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
    // Busca simultaneamente da tabela principal e da contingência em tempo real
    const [menuRes, syncRes] = await Promise.all([
      supabase.from('menu_data').select('data, updated_at').eq('id', 1).maybeSingle(),
      supabase.from('inventory').select('supplier, updated_at').eq('id', 'sys-menu-sync').maybeSingle()
    ]);

    const menuRow = menuRes.data;
    const syncRow = syncRes.data;

    const primaryMenu = (menuRow?.data as MenuData) || null;
    let backupMenu: MenuData | null = null;

    if (syncRow?.supplier) {
      try {
        backupMenu = JSON.parse(syncRow.supplier) as MenuData;
      } catch (e) {
        console.warn('Erro ao decodificar cardápio de contingência:', e);
      }
    }

    if (primaryMenu && backupMenu) {
      const primaryTime = menuRow?.updated_at ? new Date(menuRow.updated_at).getTime() : 0;
      const backupTime = syncRow?.updated_at ? new Date(syncRow.updated_at).getTime() : 0;

      // Se o backup de contingência for mais recente que o cardápio principal, usa o backup
      if (backupTime > primaryTime) {
        return backupMenu;
      }
      return primaryMenu;
    }

    return backupMenu || primaryMenu;
  } catch (err) {
    console.error('Exceção ao buscar menu:', err);
    return null;
  }
}

export async function saveMenuData(menu: MenuData): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  let directSuccess = false;
  let syncSuccess = false;

  // 1. Tenta atualizar na tabela oficial menu_data
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_admin_update_menu', {
      p_menu: menu
    });

    if (!rpcError && rpcData && typeof rpcData === 'object' && ('success' in rpcData) && (rpcData as any).success) {
      directSuccess = true;
    } else {
      const { data, error } = await supabase
        .from('menu_data')
        .update({
          data: menu,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
        .select();

      if (!error && data && data.length > 0) {
        directSuccess = true;
      }
    }
  } catch (err) {
    console.warn('Tentativa direta em menu_data falhou:', err);
  }

  // 2. Grava também no sincronizador de contingência (inventory sys-menu-sync)
  // Isso garante que descontos e preços funcionem instantaneamente em todos os clientes
  try {
    const { error: syncError } = await supabase
      .from('inventory')
      .upsert({
        id: 'sys-menu-sync',
        name: 'Cardápio em Nuvem',
        category: '_MENU_CONFIG_',
        quantity: 1,
        unit: 'sistema',
        min_alert_quantity: 0,
        cost_price: 0,
        supplier: JSON.stringify(menu),
        updated_at: new Date().toISOString()
      });

    if (!syncError) {
      syncSuccess = true;
    } else {
      console.warn('Erro ao sincronizar cardápio de contingência:', syncError);
    }
  } catch (err) {
    console.warn('Exceção ao salvar cardápio na contingência:', err);
  }

  return directSuccess || syncSuccess;
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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory' },
      (payload) => {
        const row = payload.new as any;
        if (row && row.id === 'sys-menu-sync') {
          fetchMenuData().then(m => {
            if (m) onUpdate(m);
          });
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ==============================================================================
// PEDIDOS (ORDERS)
// ==============================================================================

export function parseOrderRow(row: any): Order {
  const rawNotes = row.notes || '';
  let cancellationReason: string | undefined = undefined;
  let cleanNotes = rawNotes;

  const match = rawNotes.match(/\[(?:RECUSADO|CANCELADO):\s*([^\]]+)\]/i);
  if (match) {
    cancellationReason = match[1].trim();
    cleanNotes = rawNotes.replace(/\[(?:RECUSADO|CANCELADO):\s*[^\]]+\]\s*/i, '').trim();
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status as OrderStatus,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    orderType: row.delivery_type,
    address: row.address ? {
      street: row.address,
      number: row.number || '',
      neighborhood: row.neighborhood || '',
      complement: row.complement || '',
      reference: row.reference || ''
    } : undefined,
    paymentMethod: row.payment_method,
    paymentDetails: row.change_for ? { changeFor: Number(row.change_for) } : undefined,
    items: row.items || [],
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    notes: cleanNotes || undefined,
    cancellationReason
  };
}

export async function fetchOrders(): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.warn('Erro ao buscar orders do Supabase:', error);
      return [];
    }

    return data.map(parseOrderRow);
  } catch (err) {
    console.error('Exceção ao buscar pedidos:', err);
    return [];
  }
}

export async function fetchOrderById(orderId: string): Promise<Order | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !data) return null;

    return parseOrderRow(data);
  } catch (err) {
    console.error('Exceção ao buscar pedido por id:', err);
    return null;
  }
}

export async function createOrder(order: Partial<Order>): Promise<Order | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const orderId = order.id || `PED-${Date.now().toString().slice(-6)}`;
    const row = {
      id: orderId,
      status: 'NOVO',
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      delivery_type: order.orderType,
      address: order.address?.street,
      neighborhood: order.address?.neighborhood,
      number: order.address?.number,
      complement: order.address?.complement,
      reference: order.address?.reference,
      payment_method: order.paymentMethod,
      change_for: order.paymentDetails?.changeFor,
      items: order.items || [],
      subtotal: order.subtotal,
      delivery_fee: order.deliveryFee,
      total: order.total,
      notes: order.notes
    };

    const { data, error } = await supabase
      .from('orders')
      .insert(row)
      .select()
      .single();

    if (error || !data) {
      console.error('Erro ao inserir pedido no Supabase:', error);
      return null;
    }

    // Sincroniza estoque: deduz 1 unidade de embalagem para cada copo/barca comprado
    if (order.items && order.items.length > 0) {
      await adjustPackagingStockForOrder(order.items, 'DECREMENT');
    }

    return parseOrderRow(data);
  } catch (err) {
    console.error('Exceção ao criar pedido:', err);
    return null;
  }
}

export async function updateOrderStatus(
  orderId: string, 
  newStatus: OrderStatus, 
  cancellationReason?: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    if (cancellationReason) {
      const { data: current } = await supabase
        .from('orders')
        .select('notes')
        .eq('id', orderId)
        .single();

      const existingNotes = current?.notes ? current.notes.replace(/\[(?:RECUSADO|CANCELADO):\s*[^\]]+\]\s*/i, '').trim() : '';
      updatePayload.notes = `[RECUSADO: ${cancellationReason.trim()}]${existingNotes ? ` | ${existingNotes}` : ''}`;
    }

    if (newStatus === 'CANCELADO') {
      // Estorna a embalagem que havia sido reservada para o pedido
      const { data: orderData } = await supabase
        .from('orders')
        .select('items')
        .eq('id', orderId)
        .single();

      if (orderData?.items && Array.isArray(orderData.items)) {
        await adjustPackagingStockForOrder(orderData.items, 'RESTORE');
      }
    }

    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);

    if (error) {
      console.error('Erro ao atualizar status do pedido:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exceção ao atualizar status:', err);
    return false;
  }
}

// ==============================================================================
// CONTROLE DE ESTOQUE (INVENTORY - FOCO EXCLUSIVO EM EMBALAGENS)
// ==============================================================================

/**
 * Mapeia o item do pedido (tamanho do copo ou barca) para o id da embalagem no estoque.
 */
export function getPackagingInventoryId(sizeIdOrName: string): string | null {
  const s = String(sizeIdOrName || '').toLowerCase();
  if (s.includes('300')) return 'est-copo-300';
  if (s.includes('500')) return 'est-copo-500';
  if (s.includes('700')) return 'est-copo-700';
  if (s.includes('1000') || s.includes('litro') || s.includes('barca')) return 'est-copo-1000';
  return null;
}

/**
 * Deduz ou estorna as embalagens no estoque de acordo com os copos comprados no pedido.
 * Exemplo: 1 copo 300ml -> tira 1 unidade do estoque de Copos 300ml.
 */
export async function adjustPackagingStockForOrder(
  items: any[],
  direction: 'DECREMENT' | 'RESTORE' = 'DECREMENT'
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !items || !Array.isArray(items) || items.length === 0) return;

  try {
    const countsByPackagingId: Record<string, number> = {};

    for (const item of items) {
      const sizeId = item.size?.id || '';
      const sizeName = item.size?.name || '';
      const packagingId = getPackagingInventoryId(sizeId) || getPackagingInventoryId(sizeName);

      if (packagingId) {
        const qty = Number(item.quantity) || 1;
        countsByPackagingId[packagingId] = (countsByPackagingId[packagingId] || 0) + qty;
      }
    }

    const packagingIds = Object.keys(countsByPackagingId);
    if (packagingIds.length === 0) return;

    // Busca o estoque atual dessas embalagens
    const { data: currentRows, error } = await supabase
      .from('inventory')
      .select('id, quantity')
      .in('id', packagingIds);

    if (error || !currentRows) return;

    for (const row of currentRows) {
      const change = countsByPackagingId[row.id] || 0;
      if (change === 0) continue;

      const currentQty = Number(row.quantity) || 0;
      const newQty = direction === 'DECREMENT'
        ? Math.max(0, currentQty - change)
        : currentQty + change;

      await supabase
        .from('inventory')
        .update({
          quantity: newQty,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id);
    }
  } catch (err) {
    console.error('Erro ao ajustar estoque de embalagens do pedido:', err);
  }
}

export async function fetchInventory(): Promise<InventoryItem[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('category', 'EMBALAGENS')
      .order('name', { ascending: true });

    if (error || !data) {
      console.warn('Erro ao buscar estoque de embalagens:', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: Number(row.quantity),
      unit: row.unit,
      min_alert_quantity: Number(row.min_alert_quantity),
      cost_price: row.cost_price ? Number(row.cost_price) : 0,
      supplier: row.supplier,
      updated_at: row.updated_at
    }));
  } catch (err) {
    console.error('Exceção ao buscar estoque:', err);
    return [];
  }
}

export async function updateInventoryQuantity(id: string, newQuantity: number): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { error } = await supabase
      .from('inventory')
      .update({
        quantity: Math.max(0, newQuantity),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    return !error;
  } catch {
    return false;
  }
}

export async function saveInventoryItem(item: InventoryItem): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { error } = await supabase
      .from('inventory')
      .upsert({
        id: item.id,
        name: item.name,
        category: 'EMBALAGENS',
        quantity: item.quantity,
        unit: item.unit || 'un',
        min_alert_quantity: item.min_alert_quantity || 10,
        cost_price: item.cost_price,
        supplier: item.supplier,
        updated_at: new Date().toISOString()
      });

    return !error;
  } catch {
    return false;
  }
}

// ==============================================================================
// REALTIME SUBSCRIPTIONS (TEMPO REAL SEM DEPENDER DE SERVIDOR LIGADO)
// ==============================================================================

export function subscribeToOrders(
  onNewOrder: (order: Order) => void,
  onUpdateOrder: (order: Order) => void
) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const channel = supabase
    .channel('orders-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        onNewOrder(parseOrderRow(payload.new));
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        onUpdateOrder(parseOrderRow(payload.new));
      }
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}

export function subscribeToOrder(
  orderId: string,
  onUpdate: (order: Order) => void
) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const channel = supabase
    .channel(`order-track-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`
      },
      (payload) => {
        onUpdate(parseOrderRow(payload.new));
      }
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}

export function subscribeToInventory(onUpdate: (item: InventoryItem) => void) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const channel = supabase
    .channel('inventory-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory' },
      (payload) => {
        const row = payload.new as any;
        if (row && row.category === 'EMBALAGENS') {
          onUpdate({
            id: row.id,
            name: row.name,
            category: row.category,
            quantity: Number(row.quantity),
            unit: row.unit,
            min_alert_quantity: Number(row.min_alert_quantity),
            cost_price: row.cost_price ? Number(row.cost_price) : 0,
            supplier: row.supplier,
            updated_at: row.updated_at
          });
        }
      }
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}

// ==============================================================================
// AUTENTICAÇÃO E ATUALIZAÇÃO SEGURA VIA RPC (POSTGRESQL SECURITY DEFINER)
// ==============================================================================

export async function adminLoginRPC(pin: string, deviceToken = '') {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_login', {
      p_pin: pin.trim(),
      p_device_token: deviceToken.trim()
    });

    if (error) {
      console.warn('Erro ao executar rpc_admin_login:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Exceção ao chamar rpc_admin_login:', err);
    return null;
  }
}

export async function adminVerify2FARPC(challengeToken: string, code: string, deviceName = 'Dispositivo Autorizado') {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_verify_2fa', {
      p_challenge_token: challengeToken.trim(),
      p_code: code.trim(),
      p_device_name: deviceName
    });

    if (error) {
      console.warn('Erro ao executar rpc_admin_verify_2fa:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Exceção ao chamar rpc_admin_verify_2fa:', err);
    return null;
  }
}

export async function adminUpdateSettingsRPC(pin: string, settings: StoreSettings) {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { data, error } = await supabase.rpc('rpc_admin_update_settings', {
      p_pin: pin.trim(),
      p_store_name: settings.storeName,
      p_is_open: settings.isOpen,
      p_whatsapp: settings.whatsapp,
      p_pix_key: settings.pixKey,
      p_pix_key_type: settings.pixKeyType,
      p_delivery_fee: settings.deliveryFee,
      p_estimated_time: settings.estimatedTime,
      p_address: settings.address,
      p_min_order_value: settings.minOrderValue,
      p_new_pin: settings.adminPin && settings.adminPin !== 'PROTEGIDO' ? settings.adminPin : null,
      p_new_backup_code: settings.twoFactorBackupCode && settings.twoFactorBackupCode !== 'PROTEGIDO' ? settings.twoFactorBackupCode : null,
      p_2fa_enabled: settings.twoFactorEnabled
    });

    if (error || !data?.success) {
      console.warn('Erro ao atualizar configurações via RPC segura:', error || data?.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exceção ao chamar rpc_admin_update_settings:', err);
    return false;
  }
}
