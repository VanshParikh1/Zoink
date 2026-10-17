import React from 'react'
import { StyleSheet } from 'react-native'
// The gesture-handler ScrollView, so a horizontal swipe on the chips scrolls
// them instead of paging MainAppScreen's tabs.
import { ScrollView } from 'react-native-gesture-handler'
import { shadow, space } from '../../theme/tokens'
import Chip from './Chip'

type Props = {
  categories: readonly string[]
  selected: string
  onSelect: (category: string) => void
}

/** Horizontal row of category chips, padded so the active chip's hard shadow isn't clipped. */
export default function CategoryChips({ categories, selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {categories.map((category) => (
        <Chip key={category} label={category} active={selected === category} onPress={() => onSelect(category)} />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingTop: space.xs,
    paddingBottom: space.xs + shadow.xs,
  },
})
