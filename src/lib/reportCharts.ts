import { Sale } from '../types/database';

// The numbers behind the Reports charts (src/components/ReportCharts.tsx),
// kept apart from the drawing so each chart is just "a list of bars".
// Callers pass sales that are already filtered and already exclude refunds,
// so every chart agrees with the summary box above it.
export type ChartBar = {
  key: string;
  // Short text for under/beside the bar.
  label: string;
  // Longer text for when a bar is selected, and for screen readers.
  detail: string;
  value: number;
  count: number;
};

const MAX_TIME_BARS = 14;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hourLabel(hour: number, long: boolean): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'a' : 'p';
  return long ? `${h} ${suffix.toUpperCase()}M` : `${h}${suffix}`;
}

// Sales over time, at whatever grain suits the span being looked at: by
// hour for a single day (when was the booth busy?), by day for anything
// short, and by month once there are too many days to read as bars. A
// vendor's sales cluster on event days with long gaps between, so a longer
// span with few selling days shows just those days rather than a row of
// empty ones.
export function salesOverTime(sales: Sale[]): { title: string; bars: ChartBar[] } {
  if (sales.length === 0) return { title: 'Sales by day', bars: [] };

  const dates = sales.map((s) => new Date(s.sale_date));
  const days = Array.from(new Set(dates.map(dayKey))).sort();
  const add = (map: Map<string, ChartBar>, key: string, sale: Sale) => {
    const bar = map.get(key);
    if (!bar) return;
    bar.value += sale.sale_price;
    bar.count += 1;
  };

  if (days.length === 1) {
    const hours = dates.map((d) => d.getHours());
    const map = new Map<string, ChartBar>();
    for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
      map.set(String(h), { key: String(h), label: hourLabel(h, false), detail: hourLabel(h, true), value: 0, count: 0 });
    }
    sales.forEach((s, i) => add(map, String(dates[i].getHours()), s));
    return { title: 'Sales by hour', bars: Array.from(map.values()) };
  }

  const first = new Date(Math.min(...dates.map((d) => d.getTime())));
  const last = new Date(Math.max(...dates.map((d) => d.getTime())));
  first.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);
  const spanDays = Math.round((last.getTime() - first.getTime()) / 86400000) + 1;

  if (spanDays <= MAX_TIME_BARS || days.length <= MAX_TIME_BARS) {
    const map = new Map<string, ChartBar>();
    const dayBar = (d: Date): ChartBar => ({
      key: dayKey(d),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      detail: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      value: 0,
      count: 0,
    });
    if (spanDays <= MAX_TIME_BARS) {
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
        map.set(dayKey(d), dayBar(d));
      }
    } else {
      for (const key of days) {
        const [y, m, d] = key.split('-').map(Number);
        map.set(key, dayBar(new Date(y, m - 1, d)));
      }
    }
    sales.forEach((s, i) => add(map, dayKey(dates[i]), s));
    return { title: 'Sales by day', bars: Array.from(map.values()) };
  }

  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const months = Array.from(new Set(dates.map(monthKey))).sort().slice(-12);
  const map = new Map<string, ChartBar>();
  for (const key of months) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    map.set(key, {
      key,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      detail: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      value: 0,
      count: 0,
    });
  }
  sales.forEach((s, i) => add(map, monthKey(dates[i]), s));
  return { title: 'Sales by month', bars: Array.from(map.values()) };
}

// Totals for each distinct value of `keyOf` (payment method, item type,
// event, item), biggest first.
export function salesGroupedBy(sales: Sale[], keyOf: (sale: Sale) => string, limit?: number): ChartBar[] {
  const map = new Map<string, ChartBar>();
  for (const s of sales) {
    const key = keyOf(s);
    const bar = map.get(key) ?? { key, label: key, detail: key, value: 0, count: 0 };
    bar.value += s.sale_price;
    bar.count += 1;
    map.set(key, bar);
  }
  const bars = Array.from(map.values()).sort((a, b) => b.value - a.value);
  return limit ? bars.slice(0, limit) : bars;
}
