// Family names registered by useFonts in App.tsx. Kept apart from
// typography.ts so colors.ts can use them without an import cycle.
export const fonts = {
  regular: 'FiraSans_400Regular',
  bold: 'FiraSans_700Bold',
  black: 'FiraSans_900Black',
  mono: 'FiraMono_700Bold',
} as const
