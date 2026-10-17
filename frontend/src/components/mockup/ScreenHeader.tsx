import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../theme/colors'
import { space } from '../../theme/tokens'
import { type } from '../../theme/typography'
import IconButton from './IconButton'

type Props = {
  title: string
  /** Shows the back button. Defaults to navigation.goBack(). */
  back?: boolean
  onBack?: () => void
  right?: React.ReactNode
}

export default function ScreenHeader({ title, back = false, onBack, right }: Props) {
  const navigation = useNavigation()
  return (
    <View style={styles.row}>
      {back ? (
        <IconButton accessibilityLabel="Go back" onPress={onBack ?? (() => navigation.goBack())}>
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </IconButton>
      ) : null}
      <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
      {right ? <View>{right}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    minHeight: 48,
  },
  title: {
    ...type.h2,
    color: colors.ink,
    flex: 1,
  },
})
