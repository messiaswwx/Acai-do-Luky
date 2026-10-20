export interface SizeItem {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  maxFreeToppings: number;
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
}

export interface CartItem {
  id: string;
  size: SizeItem;
  base: BaseItem;
  freeToppings: FreeToppingItem[];
  premiumToppings: { item: PremiumToppingItem; quantity: number }[];
  syrups: SyrupItem[];
  notes: string;
  unitPrice: number;
  quantity: number;
}

export type OrderStatus = 'NOVO' | 'PREPARANDO' | 'A_CAMINHO' | 'CONCLUIDO' | 'CANCELADO';

export type PaymentMethod = 'PIX' | 'CARTAO_ENTREGA' | 'DINHEIRO';

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
  };
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes?: string;
}
