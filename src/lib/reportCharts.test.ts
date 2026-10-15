// Unit tests for the Reports chart numbers (reportCharts.ts). Expected values
// come from the rules in reportCharts.ts's comments: one selling day is shown
// by hour, a span of up to 14 days by day (empty days included), a longer
// span with few selling days by just those days, and anything bigger by
// month (the last 12 kept). Dates are built in local time, the same way the
// code buckets them, so the results don't depend on the machine's time zone.
// They also stay clear of daylight-saving changeovers.
import type { Sale } from '../types/database';
import { salesGroupedBy, salesOverTime } from './reportCharts';

function sale(when: Date, sale_price: number, payment_method = 'card'): Sale {
  return { sale_date: when.toISOString(), sale_price, payment_method } as Sale;
}

// Month is 1-based here, unlike Date's.
function at(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

describe('salesOverTime', () => {
  test('no sales gives an empty day chart', () => {
    expect(salesOverTime([])).toEqual({ title: 'Sales by day', bars: [] });
  });

  test('a single selling day is shown by hour, quiet hours in between included', () => {
    const result = salesOverTime([
      sale(at(2026, 10, 10, 10, 15), 20),
      sale(at(2026, 10, 10, 10, 45), 15),
      sale(at(2026, 10, 10, 13, 5), 40),
    ]);

    expect(result.title).toBe('Sales by hour');
    expect(result.bars).toEqual([
      { key: '10', label: '10a', detail: '10 AM', value: 35, count: 2 },
      { key: '11', label: '11a', detail: '11 AM', value: 0, count: 0 },
      { key: '12', label: '12p', detail: '12 PM', value: 0, count: 0 },
      { key: '13', label: '1p', detail: '1 PM', value: 40, count: 1 },
    ]);
  });

  test('a short range is shown by day, empty days included', () => {
    const result = salesOverTime([
      sale(at(2026, 10, 1, 9), 10),
      sale(at(2026, 10, 3, 18), 25),
      sale(at(2026, 10, 3, 19), 5),
    ]);

    expect(result.title).toBe('Sales by day');
    expect(result.bars.map((b) => [b.key, b.label, b.value, b.count])).toEqual([
      ['2026-10-01', '10/1', 10, 1],
      ['2026-10-02', '10/2', 0, 0],
      ['2026-10-03', '10/3', 30, 2],
    ]);
  });

  test('a span of exactly 14 days still gets one bar per day', () => {
    const result = salesOverTime([sale(at(2026, 10, 1), 10), sale(at(2026, 10, 14), 10)]);

    expect(result.title).toBe('Sales by day');
    expect(result.bars).toHaveLength(14);
    expect(result.bars[0].key).toBe('2026-10-01');
    expect(result.bars[13].key).toBe('2026-10-14');
  });

  test('a longer span with few selling days shows just those days', () => {
    const result = salesOverTime([sale(at(2026, 10, 1), 10), sale(at(2026, 10, 15), 20)]);

    expect(result.title).toBe('Sales by day');
    expect(result.bars.map((b) => [b.key, b.value])).toEqual([
      ['2026-10-01', 10],
      ['2026-10-15', 20],
    ]);
  });

  test('a long span with many selling days is shown by month', () => {
    // 15 selling days, so neither day rule applies.
    const days = [
      at(2026, 1, 5), at(2026, 1, 6), at(2026, 1, 7), at(2026, 1, 8), at(2026, 1, 9),
      at(2026, 2, 2), at(2026, 2, 3), at(2026, 2, 4), at(2026, 2, 5), at(2026, 2, 6),
      at(2026, 4, 6), at(2026, 4, 7), at(2026, 4, 8), at(2026, 4, 9), at(2026, 4, 10),
    ];
    const result = salesOverTime(days.map((d) => sale(d, 10)));

    expect(result.title).toBe('Sales by month');
    // Only months with sales get a bar; March is skipped.
    expect(result.bars.map((b) => [b.key, b.value, b.count])).toEqual([
      ['2026-01', 50, 5],
      ['2026-02', 50, 5],
      ['2026-04', 50, 5],
    ]);
  });

  test('the month chart keeps only the last 12 months', () => {
    // 15 selling days spread over 13 months.
    const days = [
      at(2025, 1, 15), at(2025, 2, 15), at(2025, 3, 16), at(2025, 4, 15), at(2025, 5, 15),
      at(2025, 6, 16), at(2025, 7, 15), at(2025, 8, 15), at(2025, 9, 15), at(2025, 10, 15),
      at(2025, 11, 14), at(2025, 12, 1), at(2025, 12, 2), at(2025, 12, 3), at(2026, 1, 15),
    ];
    const result = salesOverTime(days.map((d) => sale(d, 10)));

    expect(result.title).toBe('Sales by month');
    expect(result.bars).toHaveLength(12);
    expect(result.bars[0].key).toBe('2025-02');
    expect(result.bars[result.bars.length - 1].key).toBe('2026-01');
    // January 2025's sale falls outside the chart rather than landing in another bar.
    expect(result.bars.reduce((sum, b) => sum + b.count, 0)).toBe(14);
  });
});

describe('salesGroupedBy', () => {
  const sales = [
    sale(at(2026, 10, 1), 20, 'card'),
    sale(at(2026, 10, 1), 50, 'cash'),
    sale(at(2026, 10, 1), 15, 'venmo'),
    sale(at(2026, 10, 2), 25, 'card'),
  ];
  const byMethod = (s: Sale) => s.payment_method;

  test('totals each group and lists the biggest first', () => {
    expect(salesGroupedBy(sales, byMethod)).toEqual([
      { key: 'cash', label: 'cash', detail: 'cash', value: 50, count: 1 },
      { key: 'card', label: 'card', detail: 'card', value: 45, count: 2 },
      { key: 'venmo', label: 'venmo', detail: 'venmo', value: 15, count: 1 },
    ]);
  });

  test('a limit keeps only the biggest groups', () => {
    expect(salesGroupedBy(sales, byMethod, 2).map((b) => b.key)).toEqual(['cash', 'card']);
  });

  test('no sales gives no bars', () => {
    expect(salesGroupedBy([], byMethod)).toEqual([]);
  });
});
