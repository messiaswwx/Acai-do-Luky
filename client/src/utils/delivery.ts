export interface DeliveryNeighborhood {
  name: string;
  fee: number;
}

export const PRAIA_GRANDE_NEIGHBORHOODS: DeliveryNeighborhood[] = [
  { name: 'Ocian', fee: 4.00 },
  { name: 'Tupi', fee: 5.00 },
  { name: 'Anhanguera', fee: 5.00 },
  { name: 'Nova Mirim', fee: 5.00 },
  { name: 'Tupiry', fee: 6.00 },
  { name: 'Quietude', fee: 6.00 },
  { name: 'Maracanã', fee: 7.00 },
  { name: 'Ribeirópolis', fee: 7.00 },
  { name: 'Esmeralda', fee: 8.00 },
  { name: 'Samambaia', fee: 8.00 },
  { name: 'Aviação', fee: 8.00 },
  { name: 'Vila Antártica', fee: 8.00 }
];

export function getDeliveryFeeByNeighborhood(neighborhoodName: string, fallbackFee: number = 10.00): number {
  if (!neighborhoodName) return fallbackFee;
  const clean = neighborhoodName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (clean.includes('ocian')) return 4.00;
  if (clean.includes('tupiry') || clean.includes('tupiri')) return 6.00;
  if (clean.includes('tupi')) return 5.00;
  if (clean.includes('quietude')) return 6.00;
  if (clean.includes('anhanguera')) return 5.00;
  if (clean.includes('mirim')) return 5.00;
  if (clean.includes('maracana')) return 7.00;
  if (clean.includes('ribeiropolis') || clean.includes('ribeiro')) return 7.00;
  if (clean.includes('esmeralda')) return 8.00;
  if (clean.includes('samambaia')) return 8.00;
  if (clean.includes('aviacao')) return 8.00;
  if (clean.includes('antartica')) return 8.00;

  // "quando ela selecionar outros coloque o valor padrão de 10 reais"
  return 10.00;
}
