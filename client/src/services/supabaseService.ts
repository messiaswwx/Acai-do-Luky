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

  try {
    const { error } = await supabase
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
        admin_pin: settings.adminPin,
        two_factor_enabled: settings.twoFactorEnabled,
        two_factor_backup_code: settings.twoFactorBackupCode,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) {
      console.error('Erro ao atualizar store_settings:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exceção ao salvar configurações:', err);
    return false;
  }
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
      .single();

    if (error || !data) {
      console.warn('Erro ao buscar menu_data do Supabase:', error);
      return null;
    }

    return data.data as MenuData;
  } catch (err) {
    console.error('Exceção ao buscar menu:', err);
    return null;
  }
}

export async function saveMenuData(menu: MenuData): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { error } = await supabase
      .from('menu_data')
      .update({
        data: menu,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) {
      console.error('Erro ao atualizar menu_data:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exceção ao salvar menu:', err);
    return false;
  }
}

// ==============================================================================
// PEDIDOS (ORDERS)
// ==============================================================================

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

    return data.map((row: any) => ({
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
      notes: row.notes
    }));
  } catch (err) {
    console.error('Exceção ao buscar pedidos:', err);
    return [];
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

    return {
      ...order,
      id: data.id,
      createdAt: data.created_at,
      status: data.status
    } as Order;
  } catch (err) {
    console.error('Exceção ao criar pedido:', err);
    return null;
  }
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
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
// CONTROLE DE ESTOQUE (INVENTORY)
// ==============================================================================

export async function fetchInventory(): Promise<InventoryItem[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error || !data) {
      console.warn('Erro ao buscar estoque:', error);
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
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        min_alert_quantity: item.min_alert_quantity,
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
        const row = payload.new;
        const newOrder: Order = {
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
          notes: row.notes
        };
        onNewOrder(newOrder);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        const row = payload.new;
        const updatedOrder: Order = {
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
          notes: row.notes
        };
        onUpdateOrder(updatedOrder);
      }
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}
