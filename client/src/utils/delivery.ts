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

export function matchPraiaGrandeNeighborhood(rawNeighborhood: string): {
  option: string;
  customName: string;
  fee: number;
} {
  const trimmed = (rawNeighborhood || '').trim();
  if (!trimmed) {
    return { option: '', customName: '', fee: 0 };
  }

  const clean = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (clean.includes('ocian')) return { option: 'Ocian', customName: '', fee: 4.00 };
  if (clean.includes('tupiry') || clean.includes('tupiri')) return { option: 'Tupiry', customName: '', fee: 6.00 };
  if (clean.includes('tupi')) return { option: 'Tupi', customName: '', fee: 5.00 };
  if (clean.includes('quietude')) return { option: 'Quietude', customName: '', fee: 6.00 };
  if (clean.includes('anhanguera')) return { option: 'Anhanguera', customName: '', fee: 5.00 };
  if (clean.includes('mirim')) return { option: 'Nova Mirim', customName: '', fee: 5.00 };
  if (clean.includes('maracana')) return { option: 'Maracanã', customName: '', fee: 7.00 };
  if (clean.includes('ribeiropolis') || clean.includes('ribeiro')) return { option: 'Ribeirópolis', customName: '', fee: 7.00 };
  if (clean.includes('esmeralda')) return { option: 'Esmeralda', customName: '', fee: 8.00 };
  if (clean.includes('samambaia')) return { option: 'Samambaia', customName: '', fee: 8.00 };
  if (clean.includes('aviacao')) return { option: 'Aviação', customName: '', fee: 8.00 };
  if (clean.includes('antartica')) return { option: 'Vila Antártica', customName: '', fee: 8.00 };

  return { option: 'Outros', customName: trimmed, fee: 10.00 };
}

export interface CepLookupResult {
  found: boolean;
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  uf: string;
  isPraiaGrande: boolean;
}

export function formatCep(value: string): string {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

export async function lookupCep(rawCep: string): Promise<CepLookupResult> {
  const digits = (rawCep || '').replace(/\D/g, '');
  if (digits.length !== 8) {
    return {
      found: false,
      cep: digits,
      street: '',
      neighborhood: '',
      city: '',
      uf: '',
      isPraiaGrande: true
    };
  }

  const checkIsPg = (cityName: string, cepDigits: string) => {
    const cleanCity = (cityName || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (cleanCity) {
      return cleanCity === 'praia grande';
    }
    const num = Number(cepDigits);
    return num >= 11700000 && num <= 11729999;
  };

  // 1. Tenta ViaCEP
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.erro) {
        const city = String(data.localidade || '').trim();
        return {
          found: true,
          cep: formatCep(digits),
          street: String(data.logradouro || '').trim(),
          neighborhood: String(data.bairro || '').trim(),
          city,
          uf: String(data.uf || '').trim(),
          isPraiaGrande: checkIsPg(city, digits)
        };
      }
    }
  } catch {
    // Continua para fallback BrasilAPI
  }

  // 2. Fallback BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.cep) {
        const city = String(data.city || '').trim();
        return {
          found: true,
          cep: formatCep(digits),
          street: String(data.street || '').trim(),
          neighborhood: String(data.neighborhood || '').trim(),
          city,
          uf: String(data.state || '').trim(),
          isPraiaGrande: checkIsPg(city, digits)
        };
      }
    }
  } catch {
    // Ignora falha de rede
  }

  return {
    found: false,
    cep: formatCep(digits),
    street: '',
    neighborhood: '',
    city: '',
    uf: '',
    isPraiaGrande: true
  };
}
