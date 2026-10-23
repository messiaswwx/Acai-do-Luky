import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { 
  SizeItem, 
  BaseItem, 
  FreeToppingItem, 
  FruitItem, 
  PremiumToppingItem, 
  SyrupItem, 
  CartItem, 
  MenuData 
} from '../types';
import { formatCurrency } from '../utils/format';
import { isDiscountActive, getRemainingHoursText, getSizeLimits } from '../utils/promo';
import { 
  X, 
  Check, 
  Plus, 
  Minus, 
  Sparkles, 
  Flame, 
  Clock, 
  Droplets, 
  Apple, 
  Cookie, 
  MessageSquare
} from 'lucide-react';

interface MonteAcaiModalProps {
  size: SizeItem;
  menu: MenuData;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

const DEFAULT_COMPLEMENTS: FreeToppingItem[] = [
  { id: 'free-granola', name: 'Granola', available: true },
  { id: 'free-leite-po', name: 'Leite em Pó', available: true },
  { id: 'free-sucrilhos', name: 'Sucrilhos', available: true },
  { id: 'free-disqueti', name: 'Disqueti', available: true },
  { id: 'free-pacoca', name: 'Paçoca', available: true },
  { id: 'free-chocoball', name: 'Chocoball', available: true },
  { id: 'free-jujuba', name: 'Jujuba', available: true },
  { id: 'free-amendoim', name: 'Amendoim Triturado', available: true },
];

const DEFAULT_FRUITS: FruitItem[] = [
  { id: 'fruit-banana', name: 'Banana', available: true },
  { id: 'fruit-morango', name: 'Morango', available: true },
  { id: 'fruit-kiwi', name: 'Kiwi', available: true },
  { id: 'fruit-manga', name: 'Manga', available: true },
  { id: 'fruit-uva', name: 'Uva', available: true },
];

const DEFAULT_SYRUPS: SyrupItem[] = [
  { id: 'syrup-condensado', name: 'Leite Condensado', available: true },
  { id: 'syrup-chocolate', name: 'Calda de Chocolate', available: true },
  { id: 'syrup-morango', name: 'Calda de Morango', available: true },
  { id: 'syrup-caramelo', name: 'Calda de Caramelo', available: true },
];

const DEFAULT_PREMIUM: PremiumToppingItem[] = [
  { id: 'prem-nutella', name: 'Nutella Pura Original', price: 6.00, available: true },
];

export const MonteAcaiModal: React.FC<MonteAcaiModalProps> = ({ size, menu, onClose, onAddToCart }) => {
  // Prevent background scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Limites por tamanho:
  // 300ml: Calda 1, Comp 2, Fruta 1
  // 500ml: Calda 1, Comp 2, Fruta 2
  // 700ml: Calda 1, Comp 3, Fruta 2
  // Marmita G 1100: Calda 1, Comp 3, Fruta 3
  const limits = useMemo(() => getSizeLimits(size), [size]);

  // Listas de ingredientes com fallbacks seguros do panfleto
  const availableBases = useMemo(() => {
    const list = (menu.bases || []).filter(b => b.available);
    return list.length > 0 ? list : [{ id: 'base-tradicional', name: 'Açaí Tradicional Cremoso', available: true }];
  }, [menu.bases]);

  const complementsList = useMemo(() => {
    const base = (menu.freeToppings && menu.freeToppings.length > 0)
      ? menu.freeToppings.filter(t => !t.id.startsWith('fruit-'))
      : DEFAULT_COMPLEMENTS;
    return base;
  }, [menu.freeToppings]);

  const fruitsList = useMemo(() => {
    if (menu.fruits && menu.fruits.length > 0) {
      return menu.fruits;
    }
    const fromFree = (menu.freeToppings || []).filter(t => t.id.startsWith('fruit-'));
    if (fromFree.length > 0) return fromFree;
    return DEFAULT_FRUITS;
  }, [menu.fruits, menu.freeToppings]);

  const syrupsList = useMemo(() => {
    return (menu.syrups && menu.syrups.length > 0) ? menu.syrups : DEFAULT_SYRUPS;
  }, [menu.syrups]);

  const premiumList = useMemo(() => {
    return (menu.premiumToppings && menu.premiumToppings.length > 0) ? menu.premiumToppings : DEFAULT_PREMIUM;
  }, [menu.premiumToppings]);

  // Estados de seleção
  const [selectedBase, setSelectedBase] = useState<BaseItem>(availableBases[0]);
  const [selectedSyrups, setSelectedSyrups] = useState<SyrupItem[]>([]);
  const [selectedComplements, setSelectedComplements] = useState<FreeToppingItem[]>([]);
  const [selectedFruits, setSelectedFruits] = useState<FruitItem[]>([]);
  const [premiumToppingCounts, setPremiumToppingCounts] = useState<{ [id: string]: number }>({});
  const [notes, setNotes] = useState('');

  // 2. Caldas: Limite de 1 calda (troca automática ou desmarcação)
  const toggleSyrup = useCallback((syrup: SyrupItem) => {
    setSelectedSyrups(prev => {
      if (prev.some(s => s.id === syrup.id)) {
        return []; // Desmarcar
      }
      return [syrup]; // Limite de 1 calda: seleciona a clicada
    });
  }, []);

  // 3. Complementos: limite dinâmico de acordo com o tamanho
  const toggleComplement = useCallback((item: FreeToppingItem) => {
    setSelectedComplements(prev => {
      if (prev.some(t => t.id === item.id)) {
        return prev.filter(t => t.id !== item.id);
      }
      if (prev.length < limits.maxComplements) {
        return [...prev, item];
      }
      return prev;
    });
  }, [limits.maxComplements]);

  // 4. Frutas: limite dinâmico de acordo com o tamanho
  const toggleFruit = useCallback((fruit: FruitItem) => {
    setSelectedFruits(prev => {
      if (prev.some(f => f.id === fruit.id)) {
        return prev.filter(f => f.id !== fruit.id);
      }
      if (prev.length < limits.maxFruits) {
        return [...prev, fruit];
      }
      return prev;
    });
  }, [limits.maxFruits]);

  // 5. Adicionais Premium (Nutella e extras pagos)
  const updatePremiumCount = useCallback((toppingId: string, delta: number) => {
    setPremiumToppingCounts(prev => {
      const current = prev[toppingId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[toppingId];
        return copy;
      }
      return { ...prev, [toppingId]: next };
    });
  }, []);

  const premiumTotal = useMemo(() => {
    return Object.entries(premiumToppingCounts).reduce((acc, [id, qty]) => {
      const item = premiumList.find(p => p.id === id);
      return acc + (item ? item.price * qty : 0);
    }, 0);
  }, [premiumToppingCounts, premiumList]);

  const isPromo = useMemo(() => isDiscountActive(size), [size]);
  const activeBasePrice = isPromo ? size.price : (size.originalPrice ?? size.price);
  const unitPrice = useMemo(() => activeBasePrice + premiumTotal, [activeBasePrice, premiumTotal]);

  const handleConfirm = useCallback(() => {
    const premiumItems = Object.entries(premiumToppingCounts)
      .map(([id, quantity]) => {
        const item = premiumList.find(p => p.id === id);
        return item ? { item, quantity } : null;
      })
      .filter((p): p is { item: PremiumToppingItem; quantity: number } => p !== null);

    const cartItem: CartItem = {
      id: `${size.id}-${Date.now()}`,
      size,
      base: selectedBase,
      freeToppings: selectedComplements,
      fruits: selectedFruits,
      premiumToppings: premiumItems,
      syrups: selectedSyrups,
      notes: notes.trim(),
      unitPrice,
      quantity: 1
    };

    onAddToCart(cartItem);
    onClose();
  }, [size, selectedBase, selectedComplements, selectedFruits, premiumToppingCounts, selectedSyrups, notes, unitPrice, premiumList, onAddToCart, onClose]);

  const remainingTime = useMemo(
    () => isPromo ? getRemainingHoursText(size.discountExpiresAt) : null,
    [isPromo, size.discountExpiresAt]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-purple-200/50 dark:border-purple-900/40 transform-gpu animate-in fade-in duration-200">
        
        {/* Modal Header */}
        <div className="relative bg-gradient-to-r from-[#471256] via-[#5c1c73] to-[#360942] text-white p-5 flex items-start justify-between border-b border-purple-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-12 h-12 rounded-full border-2 border-amber-400 bg-white object-contain shrink-0 shadow-md"
              decoding="async"
              loading="eager"
            />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-amber-300 text-xs font-black uppercase tracking-wider">Montando seu açaí</span>
                {isPromo && (
                  <>
                    <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      <Flame className="w-2.5 h-2.5 fill-white" />
                      {size.discountPercent}% OFF
                    </span>
                    {remainingTime && (
                      <span className="bg-purple-900 text-amber-300 border border-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                        {remainingTime}
                      </span>
                    )}
                  </>
                )}
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">{size.name}</h2>
              <p className="text-purple-200 text-xs mt-0.5 font-medium">
                1 Calda • {limits.maxComplements} Comp. • {limits.maxFruits} Fruta{limits.maxFruits > 1 ? 's' : ''} inclusos
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            aria-label="Fechar"
            className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content com ordem estrita solicitada:
            1. Base
            2. Caldas (limite de 1)
            3. Complementos (limites dinâmicos)
            4. Frutas (limites dinâmicos)
            5. Adicionais Premium (Nutella)
            6. Observações
        */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6 overscroll-contain transform-gpu">

          {/* ========================================================= */}
          {/* 1. ESCOLHA A BASE                                         */}
          {/* ========================================================= */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-purple-900 text-amber-300 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">1</span>
                <span>Escolha a Base</span>
              </h3>
              <span className="text-xs text-purple-900 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 font-bold px-2.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-900/50">
                Obrigatório
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Escolha a base do seu copo:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableBases.map(base => (
                <button
                  key={base.id}
                  onClick={() => setSelectedBase(base)}
                  className={`text-left p-3 rounded-2xl border-2 transition-all flex items-center justify-between cursor-pointer ${
                    selectedBase.id === base.id
                      ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 font-bold shadow-xs ring-1 ring-purple-600/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                  }`}
                >
                  <span className="text-xs font-bold">{base.name}</span>
                  {selectedBase.id === base.id && (
                    <div className="w-5 h-5 rounded-full bg-purple-700 dark:bg-purple-600 text-amber-300 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2. CALDAS (LIMITE DE UMA CALDA)                           */}
          {/* ========================================================= */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-purple-900 text-amber-300 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">2</span>
                <span className="flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Caldas & Coberturas</span>
                </span>
              </h3>
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                selectedSyrups.length > 0
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}>
                {selectedSyrups.length === 1 ? '1 selecionada (Inclusa)' : 'Limite de 1 calda'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Escolha 1 calda sem custo extra (clique para escolher ou trocar):
            </p>
            <div className="grid grid-cols-2 gap-2">
              {syrupsList.map(syrup => {
                const isSelected = selectedSyrups.some(s => s.id === syrup.id);
                return (
                  <button
                    key={syrup.id}
                    disabled={!syrup.available}
                    onClick={() => toggleSyrup(syrup)}
                    className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                      !syrup.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 font-black shadow-xs ring-1 ring-purple-600/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate mr-1">{syrup.name}</span>
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-purple-700 dark:bg-purple-600 text-amber-300 flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 3. COMPLEMENTOS (LIMITES: 300=2, 500=2, 700=3, MARMITA=3) */}
          {/* ========================================================= */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-purple-900 text-amber-300 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">3</span>
                <span className="flex items-center gap-1.5">
                  <Cookie className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Complementos</span>
                </span>
              </h3>
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                selectedComplements.length === limits.maxComplements
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}>
                {selectedComplements.length} de {limits.maxComplements} inclusos
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Escolha até {limits.maxComplements} acompanhamentos sem custo extra:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {complementsList.map(item => {
                const isSelected = selectedComplements.some(c => c.id === item.id);
                const isLimitReached = !isSelected && selectedComplements.length >= limits.maxComplements;

                return (
                  <button
                    key={item.id}
                    disabled={!item.available || isLimitReached}
                    onClick={() => toggleComplement(item)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                      !item.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-purple-600 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 font-black shadow-xs'
                          : isLimitReached
                            ? 'border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate mr-1">{item.name}</span>
                    {isSelected ? (
                      <Check className="w-4 h-4 text-purple-700 dark:text-purple-400 stroke-[3] shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 4. FRUTAS (LIMITES: 300=1, 500=2, 700=2, MARMITA=3)       */}
          {/* ========================================================= */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-purple-900 text-amber-300 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">4</span>
                <span className="flex items-center gap-1.5">
                  <Apple className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Frutas Frescas</span>
                </span>
              </h3>
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                selectedFruits.length === limits.maxFruits
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}>
                {selectedFruits.length} de {limits.maxFruits} inclusa{limits.maxFruits > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Escolha até {limits.maxFruits} fruta{limits.maxFruits > 1 ? 's' : ''} fresca{limits.maxFruits > 1 ? 's' : ''} para o seu açaí:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {fruitsList.map(fruit => {
                const isSelected = selectedFruits.some(f => f.id === fruit.id);
                const isLimitReached = !isSelected && selectedFruits.length >= limits.maxFruits;

                return (
                  <button
                    key={fruit.id}
                    disabled={!fruit.available || isLimitReached}
                    onClick={() => toggleFruit(fruit)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                      !fruit.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-purple-600 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 font-black shadow-xs'
                          : isLimitReached
                            ? 'border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate mr-1">{fruit.name}</span>
                    {isSelected ? (
                      <Check className="w-4 h-4 text-purple-700 dark:text-purple-400 stroke-[3] shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 5. COMPLEMENTO PREMIUM (NUTELLA R$ 6,00)                  */}
          {/* ========================================================= */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-amber-400 text-purple-950 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">5</span>
                <span>Complemento Premium</span>
              </h3>
              <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-amber-200 dark:border-amber-800">
                <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Opcional
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Turbine seu copo com dose generosa de Nutella pura:
            </p>
            <div className="space-y-2">
              {premiumList.map(item => {
                const count = premiumToppingCounts[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between transition-colors ${
                      !item.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 opacity-60'
                        : count > 0
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{item.name}</div>
                      <div className="text-xs font-black text-amber-600 dark:text-amber-400">+{formatCurrency(item.price)}</div>
                    </div>

                    {!item.available ? (
                      <span className="text-[10px] text-slate-400 font-semibold">Indisponível</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {count > 0 && (
                          <>
                            <button
                              onClick={() => updatePremiumCount(item.id, -1)}
                              aria-label="Diminuir"
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-4 text-center font-black text-purple-950 dark:text-amber-300 text-sm">{count}</span>
                          </>
                        )}
                        <button
                          onClick={() => updatePremiumCount(item.id, 1)}
                          aria-label="Adicionar"
                          className="w-7 h-7 rounded-lg bg-amber-400 hover:bg-amber-500 flex items-center justify-center text-purple-950 font-black shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 6. OBSERVAÇÕES                                            */}
          {/* ========================================================= */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Alguma observação para o Luky?</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Calda no fundo, capricha no leite em pó, sem colher..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600 transition-colors"
              maxLength={120}
            />
          </div>
        </div>

        {/* Modal Footer with Live Price & Add Button */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 transform-gpu shrink-0">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Total deste item</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-purple-950 dark:text-amber-400">{formatCurrency(unitPrice)}</span>
              {isPromo && (size.originalPrice || size.price) > size.price && (
                <span className="line-through text-xs font-bold text-slate-400 dark:text-slate-500">
                  {formatCurrency((size.originalPrice || size.price) + premiumTotal)}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleConfirm}
            className="flex-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-purple-950 font-black py-4 px-6 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-colors flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>Adicionar à Sacola</span>
          </button>
        </div>
      </div>
    </div>
  );
};
