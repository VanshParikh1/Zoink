import React from 'react'
import { RefreshControl, RefreshControlProps } from 'react-native'
import { colors } from '../theme/colors'
import { haptics } from '../utils/haptics'

/**
 * Every list's pull-to-refresh: the app's colours, and a light tick when the
 * pull triggers (not when the list refreshes on its own).
 */
export default function PullToRefresh({ refreshing, onRefresh, ...rest }: RefreshControlProps & { onRefresh: () => void }) {
  return (
    <RefreshControl
      {...rest}
      refreshing={refreshing}
      onRefresh={() => {
        haptics.tap()
        onRefresh()
      }}
      tintColor={colors.greenText}
      colors={[colors.green]}
    />
  )
}
