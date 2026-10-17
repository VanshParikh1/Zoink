import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors } from '../../theme/colors'
import { radius } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'

export type PriceRow = { label: string; value: string }

type Props = {
  rows: PriceRow[]
  total?: PriceRow
  highlight?: 'lime' | 'green' | 'none'
  style?: StyleProp<ViewStyle>
}

const DIVIDER = 1.5

export default function PriceTable({ rows, total, highlight = 'none', style }: Props) {
  const totalBg = highlight === 'lime' ? colors.lime : highlight === 'green' ? colors.green : undefined
  return (
    <View style={style}>
      {rows.map((row, i) => (
        <View key={`${row.label}-${i}`} style={[styles.row, i > 0 ? styles.divided : null]}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
      {total ? (
        <View
          style={[
            styles.row,
            styles.totalRow,
            rows.length > 0 && !totalBg ? styles.divided : null,
            totalBg ? { backgroundColor: totalBg, marginTop: 8 } : null,
          ]}
        >
          <Text style={styles.total}>{total.label}</Text>
          <Text style={styles.total}>{total.value}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  divided: {
    borderTopWidth: DIVIDER,
    borderTopColor: colors.divider,
  },
  totalRow: {
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: radius.thumbSm,
  },
  label: {
    ...type.bodySm,
    color: colors.muted,
    flexShrink: 1,
  },
  value: {
    ...type.label,
    color: colors.ink,
  },
  total: {
    fontFamily: fonts.black,
    fontSize: 17,
    lineHeight: 21,
    color: colors.ink,
  },
})
