// ScrapzData — Aqua + Purple glass theme
export const C = {
  // Backgrounds
  bg:          '#090818',   // near-black with deep purple tint
  bgCard:      'rgba(255,255,255,0.07)',
  bgCardHigh:  'rgba(255,255,255,0.13)',

  // Primary palette
  aqua:        '#00d9ff',
  aquaBright:  '#00ffff',
  aquaDim:     'rgba(0,217,255,0.55)',
  purple:      '#8b5cf6',
  purpleLight: '#a78bfa',
  purpleDim:   'rgba(139,92,246,0.55)',

  // Glass borders
  border:      'rgba(0,217,255,0.22)',
  borderStrong:'rgba(0,217,255,0.50)',
  borderPurple:'rgba(139,92,246,0.50)',
  borderPurpleStrong: 'rgba(139,92,246,0.80)',
  borderMuted: 'rgba(255,255,255,0.10)',

  // Text
  text:        '#ffffff',
  textSub:     'rgba(255,255,255,0.65)',
  textMuted:   'rgba(255,255,255,0.35)',
  textAqua:    '#00d9ff',
  textPurple:  '#a78bfa',

  // Semantic
  success:     '#00ffaa',
  danger:      '#ff5e7e',
  warning:     '#ffbe0b',
} as const;

// Glow shadow helpers
export const aquaGlow = {
  shadowColor:  '#00d9ff',
  shadowOpacity: 0.40,
  shadowOffset:  { width: 0, height: 0 },
  shadowRadius:  18,
  elevation:     8,
};

export const purpleGlow = {
  shadowColor:  '#8b5cf6',
  shadowOpacity: 0.55,
  shadowOffset:  { width: 0, height: 0 },
  shadowRadius:  24,
  elevation:     10,
};

export const softShadow = {
  shadowColor:  '#000',
  shadowOpacity: 0.35,
  shadowOffset:  { width: 0, height: 4 },
  shadowRadius:  10,
  elevation:     5,
};
