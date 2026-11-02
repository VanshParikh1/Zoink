import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMainTab } from '../../context/MainTabContext'
import { shadow, space } from '../../theme/tokens'

// Floating tab bar geometry (MainAppScreen), shared with the tab screens so
// their content can scroll clear of it.
export const TAB_BAR_PADDING = 6
export const TAB_ITEM_MIN_HEIGHT = 52
const TAB_BAR_HEIGHT = TAB_ITEM_MIN_HEIGHT + TAB_BAR_PADDING * 2 // 64
export const TAB_BAR_SHADOW = shadow.sm // 4px solid offset
export const TAB_BAR_GAP = space.sm // gap between the bar and the safe-area edge
export const TAB_FAB_SIZE = 62
export const TAB_FAB_OVERFLOW = 26 // how far the "+" rises above the bar

/**
 * Height the floating tab bar covers at the bottom of a tab screen: the bottom
 * offset, the bar, its hard shadow and the raised "+" above it. Use it as the
 * scroll content's bottom padding. Outside MainAppScreen (when a tab screen is
 * pushed as a standalone route) there's no bar, so it's just the safe area.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets()
  const insideTabs = useMainTab() !== null
  if (!insideTabs) return insets.bottom + space.xxl
  return insets.bottom + TAB_BAR_GAP + TAB_BAR_HEIGHT + TAB_BAR_SHADOW + TAB_FAB_OVERFLOW
}
