import { fonts } from './fonts'

export const colors = {
  // Matched to logo — grass green, not neon
  green: '#6DD832',          // primary — the exact logo green
  greenDeep: '#248232',      // green text/icons, pressed states, button floors (= greenText)
  greenDark: '#3A7D19',      // deep shadow, heavy button base
  greenSoft: '#C8FF59',      // highlights, soft accents (= lime)
  greenSurface: '#F2FAE8',   // faint tint for bg surfaces

  white: '#FFFFFF',
  gray50: '#F4EDE1',         // = bg
  gray100: '#E5DCCB',        // = tan
  gray200: '#E5DCCB',        // = tan
  gray300: '#C9C9C9',
  gray500: '#555D55',        // = mutedAlt
  gray700: '#2D3A3A',        // = muted
  gray900: '#040F0F',        // = ink

  danger: '#D72C0D',
  warning: '#FFC453',
  dangerSurface: '#FFF4F4',
  warningSurface: '#FFF5EA',

  inkBase: '#040F0F',

  // Mockup palette
  ink: '#040F0F',
  lime: '#C8FF59',
  greenText: '#248232',
  bg: '#F4EDE1',
  surface: '#FFF9EF',
  tan: '#E5DCCB',
  muted: '#2D3A3A',
  mutedAlt: '#555D55',
  divider: 'rgba(4, 15, 15, 0.14)',
  onInk: '#FFF9EF',
  onInkMuted: '#E5DCCB',
}

export const theme = {
  colors,

  screen: colors.gray50,
  surface: colors.surface,
  surfaceRaised: colors.surface,
  surfaceSubdued: colors.gray100,

  border: colors.divider,
  borderFocus: colors.green,
  borderSubdued: colors.divider,
  borderBottom: colors.divider,
  divider: colors.divider,

  shadow: 'rgba(0, 0, 0, 0.08)',
  shadowMd: 'rgba(0, 0, 0, 0.12)',
  shadowLg: 'rgba(0, 0, 0, 0.16)',

  text: colors.gray900,
  textSecondary: colors.gray700,
  textMuted: colors.gray500,
  textDisabled: colors.gray300,
  textOnPrimary: colors.ink,  // readable on #6DD832
  onInk: colors.onInk,
  onInkMuted: colors.onInkMuted,

  primary: colors.green,
  primaryDeep: colors.greenDeep,
  primaryLight: colors.greenSoft,
  primarySurface: colors.greenSurface,

  cardBorder: colors.divider,
  cardBackground: colors.surface,
  cardShadow: '0px 1px 3px rgba(0,0,0,0.08), 0px 1px 2px rgba(0,0,0,0.06)',

  // Grass-green wash pulled toward the landing page's radial glows
  // (landing/index.html: rgba(0,239,32,.26) / rgba(200,255,89,.28)) without
  // going full-saturation — has to stay readable behind body text and white
  // cards on 26 screens. Runs horizontally in ScreenBackground so the top and
  // bottom edges read identically; the middle stop is kept lightest for text.
  backgroundGradient: ['#D3F3C2', '#E9F9D5', '#F2FBE8'] as const,
  textureColor: colors.greenDeep,

  glassLight: 'rgba(255, 255, 255, 0.65)',
  glassDark: 'rgba(10, 28, 5, 0.85)',
  glassGreen: 'rgba(109, 216, 50, 0.12)',  // updated to new green
  glassBorder: 'rgba(255, 255, 255, 0.3)',

  danger: colors.danger,
  warning: colors.warning,
  dangerSurface: colors.dangerSurface,
  warningSurface: colors.warningSurface,

  // Flat-card radius scale — replaces the ad hoc 8/16/24/32 values
  // that had accumulated per-screen with no shared system behind them.
  radius: {
    sm: 8,   // chips, thumbnails, small inline controls
    md: 16,  // standard cards, panels
    lg: 24,  // hero/feature cards, large panels
    pill: 999,
  },

  // Flat-card shadow scale — replaces the 0.08–0.5 opacity spread
  // found across screens with three deliberate depth steps.
  shadowSm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  shadowMdElevation: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  shadowLgElevation: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },

  // Neobrutalist system, matched to the landing page (frontend/landing/index.html):
  // thick ink borders + a solid offset "block" shadow instead of soft blur.
  hard: {
    ink: colors.inkBase,     // border + block-shadow color
    border: 2.5,             // standard outline weight
    borderThin: 1.5,         // small controls (chips, pills)
    offset: {
      sm: 3,  // chips, thumbnails, small buttons
      md: 5,  // standard cards
      lg: 7,  // hero cards, feature panels
    },
  },

  // One type scale for the whole app — every screen title, section heading,
  // body copy, and caption pulls from here instead of picking its own size/
  // weight/line-height per screen.
  type: {
    // Family carries the weight (Android ignores fontWeight on custom fonts),
    // so these presets set fontFamily and never fontWeight.
    screenTitle: { fontFamily: fonts.black, fontSize: 28, lineHeight: 34, color: colors.gray900 },
    sectionTitle: { fontFamily: fonts.black, fontSize: 16, lineHeight: 20, color: colors.gray900 },
    body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.gray900 },
    bodyMuted: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.gray500 },
    label: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.gray900 },
    caption: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.gray500 },
    eyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' as const, color: colors.gray500 },
  },

  // Shared vertical rhythm for screen headers, so a title sits at the same
  // height and the same distance from content on every screen. `stack` is
  // for pushed screens with a Back control; `tab` is for top-level tab roots.
  header: {
    stackTop: 64,
    tabTop: 64,
    titleGap: 4,      // space between a Back link / eyebrow and the title
    contentGap: 20,   // space between the title block and the first card
  },
}