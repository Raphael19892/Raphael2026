// Central design tokens for FiberTrack AI.
// A calm, "clinical green" palette — trustworthy and science-forward.

export const colors = {
  bg: '#F4F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF3EF',
  primary: '#0B3D2E', // deep forest green
  primarySoft: '#1B7A5A',
  accent: '#37B87C', // vibrant fiber-green
  amber: '#E9A23B',
  danger: '#D9534F',
  text: '#12211B',
  textMuted: '#5C6B63',
  border: '#DCE6DF',
  // Fiber-type identity colors (used consistently across the app).
  soluble: '#2F80ED', // dissolves in water -> blue
  insoluble: '#8E6E3A', // roughage -> earthy brown
  resistant: '#9B51E0', // ferments to feed microbiome -> purple
};

export const spacing = (n) => n * 4;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  small: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.4 },
};

export const shadow = {
  shadowColor: '#0B3D2E',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
};
