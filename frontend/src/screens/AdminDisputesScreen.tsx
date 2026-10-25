import React, { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootStackParamList } from '../navigation'
import { listDisputes } from '../services/adminApi'
import { queryKeys } from '../services/queryKeys'
import { usePagedList } from '../hooks/usePagedList'
import { userMessage } from '../utils/userMessage'
import { AdminDisputeListItem, DisputeStatus } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Chip from '../components/mockup/Chip'
import Badge from '../components/mockup/Badge'
import StatePanel from '../components/mockup/StatePanel'
import { disputeStatusBadge } from '../components/mockup/adminStatus'

type Nav = NativeStackNavigationProp<RootStackParamList>

const REASON_LABELS: Record<string, string> = {
  ITEM_DAMAGED: 'Item was damaged',
  ITEM_NOT_RETURNED: 'Item was not returned',
  ITEM_NOT_AS_DESCRIBED: 'Item not as described',
  PAYMENT_ISSUE: 'Payment issue',
  OTHER: 'Other',
}

const FILTERS: { label: string; value: DisputeStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Open', value: 'OPEN' },
  { label: 'Under Review', value: 'UNDER_REVIEW' },
  { label: 'Refunded', value: 'RESOLVED_REFUND' },
  { label: 'No Action', value: 'RESOLVED_NO_ACTION' },
  { label: 'Dismissed', value: 'DISMISSED' },
]

export default function AdminDisputesScreen() {
  const nav = useNavigation<Nav>()
  const [filter, setFilter] = useState<DisputeStatus | undefined>(undefined)
  const insets = useSafeAreaInsets()
  const feed = usePagedList<AdminDisputeListItem>(queryKeys.adminDisputes(filter), (cursor) => listDisputes(filter, cursor))
  const { items: disputes, loading, refreshing } = feed
  const error = feed.error ? userMessage(feed.error, { action: 'Could not load disputes.' }) : ''

  const header = <ScreenHeader title="Dispute queue" back />

  if (loading) {
    return (
      <Screen scroll={false} header={header} contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </Screen>
    )
  }

  return (
    <Screen scroll={false} header={header} contentStyle={styles.screenContent}>
      <FlatList
        data={disputes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={feed.refresh}
            tintColor={colors.greenText}
            colors={[colors.green]}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.subtitle}>Review and resolve disputes raised across all bookings.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FILTERS.map((item) => (
                <Chip key={item.label} label={item.label} active={filter === item.value} onPress={() => setFilter(item.value)} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <StatePanel
              title="Couldn't load disputes"
              body={error}
              action={{ label: 'Try again', onPress: () => feed.retry(), variant: 'primary' }}
            />
          ) : (
            <StatePanel title="No disputes here" body="Nothing matches this filter right now." />
          )
        }
        ItemSeparatorComponent={Separator}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={1}
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator style={styles.footer} color={colors.greenText} /> : null}
        renderItem={({ item }) => {
          const badge = disputeStatusBadge(item.status)
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${REASON_LABELS[item.reason] ?? item.reason}, ${badge.label}`}
              onPress={() => nav.navigate('AdminDisputeDetail', { disputeId: item.id })}
              style={({ pressed }) => (pressed ? styles.pressed : null)}
            >
              <Card shadow="sm" padding={space.xxl} contentStyle={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>{REASON_LABELS[item.reason] ?? item.reason}</Text>
                  <Badge label={badge.label} variant={badge.variant} />
                </View>
                <Text style={styles.cardBody} numberOfLines={2}>{item.description}</Text>
                <View style={styles.cardRow}>
                  <Text style={styles.cardMeta} numberOfLines={1}>{item.raisedByUser.firstName} · {item.raisedByUser.email}</Text>
                  <Text style={type.price}>${Number(item.booking.totalPrice).toFixed(2)}</Text>
                </View>
              </Card>
            </Pressable>
          )
        }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  screenContent: { paddingHorizontal: 0, paddingBottom: 0 },
  content: { paddingHorizontal: space.screen },
  listHeader: { gap: space.lg, marginBottom: space.lg },
  subtitle: { ...type.bodySm, color: colors.mutedAlt },
  chips: { gap: space.sm, paddingVertical: space.xs },
  separator: { height: space.lg },
  footer: { marginTop: space.lg },
  pressed: { opacity: 0.85 },
  card: { gap: space.sm },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.lg },
  cardTitle: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink, flex: 1 },
  cardBody: { ...type.bodySm, color: colors.muted },
  cardMeta: { ...type.caption, color: colors.mutedAlt, flex: 1 },
})
