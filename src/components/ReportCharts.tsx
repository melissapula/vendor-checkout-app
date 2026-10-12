import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChartBar } from '../lib/reportCharts';
import { colors, palette } from '../lib/theme';

// The two chart shapes Reports uses, drawn with plain Views rather than a
// charting library: this app only needs bars, and Views behave the same on
// every browser with nothing extra to download. The numbers come from
// src/lib/reportCharts.ts.

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function describe(bar: ChartBar): string {
  return `${bar.detail}: ${money(bar.value)}, ${bar.count} ${bar.count === 1 ? 'item' : 'items'}`;
}

// Upright bars along a time axis. Too many to label each with its amount,
// so tapping a bar shows that bar's figures in the line above the chart.
export function TimeBarChart({ title, bars }: { title: string; bars: ChartBar[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  if (bars.length === 0) return null;

  const max = Math.max(...bars.map((b) => b.value), 1);
  const selected = bars.find((b) => b.key === selectedKey) ?? null;
  const dense = bars.length > 8;

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.caption, selected && styles.captionActive]}>
        {selected ? describe(selected) : `Tap a bar for details. Tallest is ${money(max)}.`}
      </Text>
      <View style={styles.timeBars}>
        {bars.map((bar) => (
          <Pressable
            key={bar.key}
            style={styles.timeColumn}
            onPress={() => setSelectedKey(bar.key === selectedKey ? null : bar.key)}
            accessibilityRole="button"
            accessibilityLabel={describe(bar)}
          >
            <View style={styles.timeTrack}>
              <View
                style={[
                  styles.timeBar,
                  // A day with sales always gets a visible sliver, however
                  // small next to the tallest bar.
                  { height: bar.value > 0 ? `${Math.max((bar.value / max) * 100, 2)}%` : 0 },
                  bar.key === selectedKey && styles.barSelected,
                ]}
              />
            </View>
            <Text style={[styles.timeLabel, dense && styles.timeLabelDense]} numberOfLines={1}>
              {bar.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Sideways bars for comparing named things (events, types, payment
// methods, items), each with its count and amount written out.
export function RankedBarChart({ title, bars }: { title: string; bars: ChartBar[] }) {
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {bars.map((bar, index) => (
        <View key={bar.key} style={styles.rankedRow} accessibilityLabel={describe(bar)}>
          <View style={styles.rankedText}>
            <Text style={styles.rankedLabel} numberOfLines={1}>
              {bar.label} ({bar.count})
            </Text>
            <Text style={styles.rankedValue}>{money(bar.value)}</Text>
          </View>
          <View style={styles.rankedTrack}>
            <View
              style={[
                styles.rankedBar,
                { width: `${Math.max((bar.value / max) * 100, 1)}%`, backgroundColor: palette[index % palette.length] },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 20, padding: 16, backgroundColor: colors.card, borderRadius: 10 },
  title: { fontSize: 13, color: '#666', marginBottom: 4 },
  caption: { fontSize: 12, color: '#888', marginBottom: 12 },
  captionActive: { color: colors.ink, fontWeight: '600' },
  timeBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  timeColumn: { flex: 1, alignItems: 'center', minWidth: 0 },
  timeTrack: { height: 120, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  timeBar: { width: '100%', maxWidth: 44, backgroundColor: colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barSelected: { backgroundColor: palette[2] },
  timeLabel: { fontSize: 11, color: '#666', marginTop: 6 },
  timeLabelDense: { fontSize: 9 },
  rankedRow: { marginTop: 8 },
  rankedText: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rankedLabel: { fontSize: 15, color: '#333', flexShrink: 1 },
  rankedValue: { fontSize: 15, color: '#333' },
  rankedTrack: { height: 8, borderRadius: 4, backgroundColor: '#e4e4e4', marginTop: 5, overflow: 'hidden' },
  rankedBar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
