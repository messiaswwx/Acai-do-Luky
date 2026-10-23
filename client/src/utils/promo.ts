import type { SizeItem } from '../types';

export function isDiscountActive(size: SizeItem): boolean {
  if (!size.discountPercent || size.discountPercent <= 0) return false;
  if (!size.discountExpiresAt) return true; // Sem data de expiração, promoção contínua
  
  const expiryTime = new Date(size.discountExpiresAt).getTime();
  return !isNaN(expiryTime) && expiryTime > Date.now();
}

export function getRemainingHoursText(expiresAt?: string): string | null {
  if (!expiresAt) return null;
  const expiryTime = new Date(expiresAt).getTime();
  if (isNaN(expiryTime)) return null;

  const diffMs = expiryTime - Date.now();
  if (diffMs <= 0) return 'Expirado';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours >= 24) {
    const days = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;
    return `Resta ${days}d ${remHours > 0 ? `${remHours}h` : ''}`;
  }

  if (diffHours > 0) {
    return `Resta ${diffHours}h ${diffMinutes}m`;
  }

  return `Resta apenas ${diffMinutes}m!`;
}

export interface SizeLimits {
  maxSyrups: number;
  maxComplements: number;
  maxFruits: number;
  maxFreeToppings: number;
}

export function getSizeLimits(size: SizeItem): SizeLimits {
  const s = String(size.name || size.id || '').toLowerCase();
  if (s.includes('300')) {
    return {
      maxSyrups: size.maxSyrups ?? 1,
      maxComplements: size.maxComplements ?? 2,
      maxFruits: size.maxFruits ?? 1,
      maxFreeToppings: size.maxFreeToppings ?? 3
    };
  }
  if (s.includes('500')) {
    return {
      maxSyrups: size.maxSyrups ?? 1,
      maxComplements: size.maxComplements ?? 2,
      maxFruits: size.maxFruits ?? 2,
      maxFreeToppings: size.maxFreeToppings ?? 4
    };
  }
  if (s.includes('700')) {
    return {
      maxSyrups: size.maxSyrups ?? 1,
      maxComplements: size.maxComplements ?? 3,
      maxFruits: size.maxFruits ?? 2,
      maxFreeToppings: size.maxFreeToppings ?? 5
    };
  }
  // Marmita G 1100 / ExtraGrande / Barca
  return {
    maxSyrups: size.maxSyrups ?? 1,
    maxComplements: size.maxComplements ?? 3,
    maxFruits: size.maxFruits ?? 3,
    maxFreeToppings: size.maxFreeToppings ?? 6
  };
}
