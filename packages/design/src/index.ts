/**
 * Cross-platform design primitives derived from the Bare Træn screen proposals.
 *
 * Values deliberately stay as plain data: React Native can consume the numeric
 * values and hex colors directly, while the web app can turn them into CSS.
 */

export const colors = {
  ink: "#16324F",
  muted: "#536879",
  page: "#F3EFE7",
  surface: "#FFFDF8",
  soft: "#EDF8F6",
  softWarm: "#FFF2D7",
  border: "#DCE4E7",
  primary: "#087C78",
  primaryDeep: "#06635F",
  onPrimary: "#FFFFFF",
  yellow: "#FFD166",
  coral: "#C4453A",
  navy: "#16324F",
  success: "#2D9A63",
  locked: "#D8E0E4",
  dangerSoft: "#FFF0ED",
  transparent: "transparent",
} as const;

export const darkColors = {
  ink: "#F5FBFF",
  muted: "#B9C9D7",
  page: "#0D1D2A",
  surface: "#162A39",
  soft: "#183D3E",
  softWarm: "#4A351A",
  border: "#355063",
  primary: "#48D2CA",
  primaryDeep: "#8BE9E4",
  onPrimary: "#082526",
  yellow: "#F3C75E",
  coral: "#FF8C82",
  navy: "#E8F3FA",
  success: "#66D89A",
  locked: "#3A5060",
  dangerSoft: "#492725",
  transparent: "transparent",
} as const satisfies Record<keyof typeof colors, string>;

export const colorThemes = {
  light: colors,
  dark: darkColors,
} as const;

export type ColorTheme = keyof typeof colorThemes;
export type ColorToken = keyof typeof colors;

export const spacing = {
  none: 0,
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
} as const;

export const radii = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
  "2xl": 22,
  "3xl": 24,
  phone: 34,
  full: 9999,
} as const;

export const typography = {
  families: {
    rounded: "Nunito",
    systemRounded: "Avenir Next",
    web: 'ui-rounded, "Nunito", "Avenir Next", system-ui, sans-serif',
  },
  sizes: {
    micro: 9,
    caption: 10,
    label: 11,
    kicker: 12,
    body: 13,
    button: 15,
    cardTitle: 17,
    title: 22,
    display: 46,
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeights: {
    snug: 1.08,
    compact: 1.2,
    body: 1.35,
    relaxed: 1.4,
  },
} as const;

/**
 * Shadow tokens include both React Native fields and a web shorthand so a
 * component can choose the representation without redefining the visual style.
 */
export const shadows = {
  soft: {
    color: "#16324F",
    opacity: 0.13,
    offset: { width: 0, height: 6 },
    radius: 16,
    elevation: 3,
    web: "0 6px 16px rgba(22, 50, 79, 0.13)",
  },
  floating: {
    color: "#16324F",
    opacity: 0.16,
    offset: { width: 0, height: 16 },
    radius: 34,
    elevation: 8,
    web: "0 16px 34px rgba(22, 50, 79, 0.16)",
  },
  glow: {
    color: "#FFD166",
    opacity: 0.36,
    offset: { width: 0, height: 0 },
    radius: 10,
    elevation: 0,
    web: "0 0 0 10px rgba(255, 209, 102, 0.36)",
  },
} as const;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;
export type ShadowToken = keyof typeof shadows;
