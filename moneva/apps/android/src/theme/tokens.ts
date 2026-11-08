/** MONEVA design tokens. Single source for colour, spacing, radius and type. */
export const brand = {
  navy: '#101B2C',
  emerald: '#087B62',
  emeraldBright: '#16A67A',
  gold: '#D6B36A',
  softBg: '#F5F7F6',
  white: '#FFFFFF',
  textDark: '#17242F',
  grey: '#83908E',
} as const;

export interface Palette {
  bg: string;
  glow: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentText: string;
  positive: string;
  negative: string;
  warning: string;
  tabBar: string;
  shadow: string;
}

/** Dark emerald and gold is the MONEVA look. Light mode is kept for people who prefer it. */
export const dark: Palette = {
  bg: '#04120F',
  glow: '#0A4A36',
  surface: '#0A241E',
  surfaceAlt: '#103228',
  border: '#17483B',
  text: '#F2F7F5',
  textMuted: '#8FB0A6',
  primary: '#1ED08A',
  primaryText: '#03231A',
  accent: '#E2B04A',
  accentText: '#2A1C00',
  positive: '#27D98B',
  negative: '#FF5A5F',
  warning: '#E2B04A',
  tabBar: '#071C17',
  shadow: '#000000',
};
export const light: Palette = {
  bg: brand.softBg,
  glow: '#DDEFE8',
  surface: brand.white,
  surfaceAlt: '#EAF0EE',
  border: '#DDE5E2',
  text: brand.textDark,
  textMuted: '#5F6E6C',
  primary: brand.emerald,
  primaryText: brand.white,
  accent: '#B8922F',
  accentText: '#FFFFFF',
  positive: brand.emerald,
  negative: '#B3392F',
  warning: '#A9791A',
  tabBar: brand.white,
  shadow: '#101B2C',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 12.5, fontWeight: '500' as const },
};
