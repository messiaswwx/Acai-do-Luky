export interface SizeItem {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  discountHours?: number;
  discountExpiresAt?: string;
  maxFreeToppings?: number;
  maxComplements?: number;
  maxFruits?: number;
  maxSyrups?: number;
  available: boolean;
}

export interface BaseItem {
  id: string;
  name: string;
  available: boolean;
}

export interface FreeToppingItem {
  id: string;
  name: string;
  available: boolean;
}

export interface FruitItem {
  id: string;
  name: string;
  available: boolean;
}

export interface PremiumToppingItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface SyrupItem {
  id: string;
  name: string;
  available: boolean;
}

export interface MenuData {
  sizes: SizeItem[];
  bases: BaseItem[];
  freeToppings: FreeToppingItem[];
  fruits?: FruitItem[];
  premiumToppings: PremiumToppingItem[];
  syrups: SyrupItem[];
}

export interface StoreSettings {
  storeName: string;
  isOpen: boolean;
  whatsapp: string;
  pixKey: string;
  pixKeyType: string;
  deliveryFee: number;
  estimatedTime: string;
  address: string;
  minOrderValue: number;
  adminPin?: string;
  twoFactorEnabled?: boolean;
  twoFactorBackupCode?: string;
}

export interface CartItem {
  id: string;
  size: SizeItem;
  base: BaseItem;
  freeToppings: FreeToppingItem[];
  fruits?: FruitItem[];
  premiumToppings: { item: PremiumToppingItem; quantity: number }[];
  syrups: SyrupItem[];
  notes: string;
  unitPrice: number;
  quantity: number;
  needSpoon?: boolean;
}

export type OrderStatus = 'NOVO' | 'PREPARANDO' | 'A_CAMINHO' | 'CONCLUIDO' | 'CANCELADO';

export type PaymentMethod = 'PIX' | 'CARTAO_ONLINE' | 'MERCADO_PAGO_PIX' | 'MERCADO_PAGO_CARTAO' | 'CARTAO_ENTREGA' | 'DINHEIRO';

export interface Order {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  orderType: 'ENTREGA' | 'RETIRADA';
  address?: {
    street: string;
    number: string;
    neighborhood: string;
    complement?: string;
    reference?: string;
  };
  items: CartItem[];
  paymentMethod: PaymentMethod;
  paymentDetails?: {
    needChange?: boolean;
    changeFor?: number;
    cardType?: 'DEBITO' | 'CREDITO';
    gateway?: string;
  };
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes?: string;
  needCutlery?: boolean;
  cancellationReason?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'AÇAÍ' | 'FRUTAS' | 'COMPLEMENTOS' | 'EMBALAGENS' | 'CALDAS' | string;
  quantity: number;
  unit: string;
  min_alert_quantity: number;
  cost_price?: number;
  supplier?: string;
  updated_at?: string;
}

export interface CustomerProfile {
  id?: string;
  name: string;
  phone: string;
  address?: {
    street: string;
    number: string;
    neighborhood: string;
    complement?: string;
    reference?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}
