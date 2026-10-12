import { MFP_THEMES, MfpThemeName } from './mfpThemes';

// The app's colors, in one place. Screens import `colors` from here instead
// of writing hex codes.
//
// Each store can pick a theme (Settings > Theme), so these are not fixed
// values: every entry is a reference to a CSS variable, and applyTheme()
// below sets those variables on the page. Changing theme therefore recolors
// the whole app at once without any screen having to re-render or know
// that themes exist. (react-native-web passes `var(--x)` color values
// straight through to the browser; this app is web-only.)
//
// The themes themselves come from the MFP design system
// (@mfp-design-system/tokens, via scripts/sync-mfp-themes.js), plus one
// extra, "studio", which is this app's own default.
//
// Contrast matters more than usual: this runs on phones and tablets at
// outdoor booths, often in sunlight. White text is only ever placed on
// `primary`, `primaryDark` or `accent`; the palette colors are for
// decoration and chart bars, never a background for small text.
export const colors = {
  // Buttons, selected chips, outlines.
  primary: 'var(--vc-primary)',
  primaryDark: 'var(--vc-primary-dark)',
  // Body text.
  ink: 'var(--vc-ink)',
  // A second color for controls that switch between whole views (the
  // Reports tabs), so they don't blend in with the primary-colored filter
  // chips beneath them.
  accent: 'var(--vc-accent)',
  accentSoft: 'var(--vc-accent-soft)',
  // Unselected chips and other tappable-but-quiet surfaces.
  chip: 'var(--vc-chip)',
  // Summary boxes and cards.
  card: 'var(--vc-card)',
  // The page itself.
  background: 'var(--vc-background)',
  // The same in every theme: these two carry meaning (money in / destructive).
  success: '#2a7a2a',
  danger: '#b00020',
};

// Five colors per theme for the bars of the comparison charts in Reports.
export const palette = [1, 2, 3, 4, 5].map((n) => `var(--vc-palette-${n})`);

// react-native-web's Switch takes its "on" colors from these props.
export const switchColors = {
  trackColor: { false: '#d9d6e3', true: 'var(--vc-switch-track)' },
  activeThumbColor: colors.primary,
};

export type ThemeName = 'studio' | MfpThemeName;
export const DEFAULT_THEME: ThemeName = 'studio';

type ThemeValues = {
  primary: string;
  primaryDark: string;
  ink: string;
  accent: string;
  accentSoft: string;
  card: string;
  background: string;
  palette: string[];
};

// Blends two #rrggbb colors; `amount` is how much of `a` ends up in the mix.
function mix(a: string, b: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const blended = [0, 1, 2].map((i) => Math.round(channel(a, i) * amount + channel(b, i) * (1 - amount)));
  return `#${blended.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

// How a design-system theme's variables map onto this app's handful of
// color roles.
function fromMfp(name: MfpThemeName): ThemeValues {
  const t = MFP_THEMES[name];
  return {
    primary: t['color-brand-primary'],
    primaryDark: t['color-brand-primary-hover'],
    ink: t['color-text-default'],
    accent: t['color-brand-primary-emphasis'],
    accentSoft: t['color-background-muted'],
    card: t['color-background-subtle'],
    background: t['color-background-default'],
    palette: [
      t['color-brand-primary'],
      t['color-brand-primary-emphasis'],
      t['color-status-success-solid'],
      t['color-status-warning-solid'],
      t['color-status-info-solid'],
    ],
  };
}

const THEME_VALUES: Record<ThemeName, ThemeValues> = {
  // This app's own look: violet, with a painter's swatch strip of accents.
  studio: {
    primary: '#5B3FD9',
    primaryDark: '#3D2A9E',
    ink: '#241C3D',
    accent: '#0F766E',
    accentSoft: '#DDF1EE',
    card: '#FAF6EF',
    background: '#ffffff',
    palette: ['#5B3FD9', '#1FA39A', '#F2674A', '#F6B93B', '#E8468A'],
  },
  blue: fromMfp('blue'),
  emerald: fromMfp('emerald'),
  navy: fromMfp('navy'),
  orange: fromMfp('orange'),
  sand: fromMfp('sand'),
  terracotta: fromMfp('terracotta'),
};

// For the picker in Settings: every theme, with a color to show beside it.
export const THEME_OPTIONS: { name: ThemeName; label: string; swatch: string }[] = (
  Object.keys(THEME_VALUES) as ThemeName[]
).map((name) => ({
  name,
  label: name.charAt(0).toUpperCase() + name.slice(1),
  swatch: THEME_VALUES[name].primary,
}));

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && value in THEME_VALUES;
}

export function applyTheme(name: ThemeName) {
  if (typeof document === 'undefined') return;
  const t = THEME_VALUES[name];
  const root = document.documentElement.style;
  root.setProperty('--vc-primary', t.primary);
  root.setProperty('--vc-primary-dark', t.primaryDark);
  root.setProperty('--vc-ink', t.ink);
  root.setProperty('--vc-accent', t.accent);
  root.setProperty('--vc-accent-soft', t.accentSoft);
  root.setProperty('--vc-card', t.card);
  root.setProperty('--vc-background', t.background);
  // Derived rather than taken from the theme, so chips are tinted enough to
  // see on every theme's background (some themes' own "subtle" brand tint
  // is nearly white).
  root.setProperty('--vc-chip', mix(t.primary, t.background, 0.13));
  root.setProperty('--vc-switch-track', mix(t.primary, t.background, 0.4));
  t.palette.forEach((color, i) => root.setProperty(`--vc-palette-${i + 1}`, color));
  document.body.style.backgroundColor = t.background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.primary);
}

// Set once as soon as this module loads, so the variables exist before the
// first screen is drawn.
applyTheme(DEFAULT_THEME);
