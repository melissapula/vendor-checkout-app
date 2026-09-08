import type { CartItem } from '../context/CartContext';
import type { Deal, PieceType } from '../types/database';

// Structured shape for Deal.applies_to / trigger_condition (stored as jsonb
// in Supabase — Deal's TS type keeps them as Record<string, unknown> since
// that's what the column is; these are the shapes this engine expects).
export type AppliesTo =
  | { scope: 'all' }
  | { scope: 'type'; type: PieceType }
  | { scope: 'series'; series: string }
  | { scope: 'skus'; skus: string[] };

export type TriggerCondition = { count: number };

export interface AppliedDeal {
  deal: Deal;
  reps: number; // how many times the deal's bundle/bogo unit repeated (e.g. 6 eligible prints / 3-per-bundle = 2 reps)
  discountAmount: number;
  description: string;
}

export interface DealsEvaluation {
  applied: AppliedDeal[];
  overridden: AppliedDeal[]; // non-stackable deals that matched but lost to a better same-scope deal
  totalDiscount: number;
  // Total discount attributed to each piece_id, spread evenly across that
  // piece's units in the cart — the engine doesn't track which specific
  // units of a stack were "in" a bundle vs. not, just the item's total cut.
  discountByPieceId: Map<string, number>;
}

function matchesScope(piece: CartItem['piece'], appliesTo: AppliesTo): boolean {
  switch (appliesTo.scope) {
    case 'all':
      return true;
    case 'type':
      return piece.type === appliesTo.type;
    case 'series':
      return piece.series === appliesTo.series;
    case 'skus':
      return appliesTo.skus.includes(piece.sku);
  }
}

function scopeKey(appliesTo: AppliesTo): string {
  return JSON.stringify(appliesTo);
}

function withinDateWindow(deal: Deal, now: Date): boolean {
  if (deal.start_date && now < new Date(deal.start_date)) return false;
  if (deal.end_date && now > new Date(deal.end_date)) return false;
  return true;
}

// Cheapest-first so bundle/bogo discounts consume the lowest-value units,
// which is the standard "the free/discounted item is the cheapest one" rule.
function eligibleUnitPrices(items: CartItem[], appliesTo: AppliesTo): number[] {
  const prices: number[] = [];
  for (const item of items) {
    if (matchesScope(item.piece, appliesTo)) {
      for (let i = 0; i < item.quantity; i++) prices.push(item.piece.price);
    }
  }
  return prices.sort((a, b) => a - b);
}

function evaluateSingleDeal(deal: Deal, items: CartItem[], now: Date): AppliedDeal | null {
  if (!deal.active || !withinDateWindow(deal, now)) return null;

  const appliesTo = deal.applies_to as unknown as AppliesTo;
  const trigger = deal.trigger_condition as unknown as TriggerCondition;
  const perRep = trigger.count;
  if (!perRep || perRep <= 0) return null;

  const prices = eligibleUnitPrices(items, appliesTo);
  if (prices.length < perRep) return null;

  // bundle_price/bogo are inherently group-based (a bundle IS a fixed-size
  // group; a bogo cycle IS a fixed-size group) — repeat once per complete
  // group of `perRep` eligible units. percent_off/amount_off are threshold
  // triggers, not groups: once you have >= perRep eligible units, the
  // discount applies to ALL of them, not just floor(n / perRep) of them.
  const reps = Math.floor(prices.length / perRep);

  let discountAmount = 0;
  let description = deal.name;

  switch (deal.type) {
    case 'bundle_price': {
      // discount_value = the bundle's total price for `perRep` items.
      for (let r = 0; r < reps; r++) {
        const groupPrices = prices.slice(r * perRep, (r + 1) * perRep);
        const groupTotal = groupPrices.reduce((s, p) => s + p, 0);
        discountAmount += Math.max(0, groupTotal - deal.discount_value);
      }
      description = `${deal.name} — saved $${discountAmount.toFixed(2)}`;
      break;
    }
    case 'percent_off': {
      const eligibleTotal = prices.reduce((s, p) => s + p, 0);
      discountAmount = Math.round(eligibleTotal * (deal.discount_value / 100) * 100) / 100;
      description = `${deal.name} — saved $${discountAmount.toFixed(2)}`;
      break;
    }
    case 'amount_off': {
      const eligibleTotal = prices.reduce((s, p) => s + p, 0);
      discountAmount = Math.min(deal.discount_value, eligibleTotal);
      description = `${deal.name} — saved $${discountAmount.toFixed(2)}`;
      break;
    }
    case 'bogo': {
      // trigger_condition.count = cycle size (e.g. 4 for "buy 3 get 1 free").
      // discount_value = number of free units per cycle (usually 1). The
      // free units are the cheapest ones in each cycle.
      const freePerCycle = Math.max(1, Math.round(deal.discount_value));
      for (let r = 0; r < reps; r++) {
        const cycle = prices.slice(r * perRep, (r + 1) * perRep);
        const free = cycle.slice(0, freePerCycle);
        discountAmount += free.reduce((s, p) => s + p, 0);
      }
      description = `${deal.name} — saved $${discountAmount.toFixed(2)}`;
      break;
    }
  }

  if (discountAmount <= 0) return null;
  return { deal, reps, discountAmount, description };
}

export function evaluateDeals(items: CartItem[], deals: Deal[], now = new Date()): DealsEvaluation {
  const matches = deals
    .map((d) => evaluateSingleDeal(d, items, now))
    .filter((e): e is AppliedDeal => e !== null);

  const stackable = matches.filter((m) => m.deal.stackable);
  const nonStackable = matches.filter((m) => !m.deal.stackable);

  // Non-stackable deals competing over the identical applies_to scope: keep
  // only the single biggest discount per scope, per the design doc's rule.
  const byScope = new Map<string, AppliedDeal[]>();
  for (const m of nonStackable) {
    const key = scopeKey(m.deal.applies_to as unknown as AppliesTo);
    byScope.set(key, [...(byScope.get(key) ?? []), m]);
  }

  const applied: AppliedDeal[] = [...stackable];
  const overridden: AppliedDeal[] = [];

  for (const group of byScope.values()) {
    const sorted = [...group].sort((a, b) => b.discountAmount - a.discountAmount);
    applied.push(sorted[0]);
    overridden.push(...sorted.slice(1));
  }

  const totalDiscount = Math.round(applied.reduce((s, a) => s + a.discountAmount, 0) * 100) / 100;

  const discountByPieceId = new Map<string, number>();
  for (const a of applied) {
    const appliesTo = a.deal.applies_to as unknown as AppliesTo;
    const matchingItems = items.filter((i) => matchesScope(i.piece, appliesTo));
    const scopeUnitCount = matchingItems.reduce((s, i) => s + i.quantity, 0);
    if (scopeUnitCount === 0) continue;
    for (const item of matchingItems) {
      const share = (item.quantity / scopeUnitCount) * a.discountAmount;
      discountByPieceId.set(item.piece.id, (discountByPieceId.get(item.piece.id) ?? 0) + share);
    }
  }

  return { applied, overridden, totalDiscount, discountByPieceId };
}
