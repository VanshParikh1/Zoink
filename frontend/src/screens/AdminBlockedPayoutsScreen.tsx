import React, { useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatDateTime } from '@zoink/shared'
import { listBlockedPayouts, unblockPayout } from '../services/adminApi'
import { queryKeys } from '../services/queryKeys'
import { useRefreshOnFocus } from '../hooks/usePagedList'
import { AdminBlockedPayout } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Button from '../components/mockup/Button'
import StatePanel from '../components/mockup/StatePanel'
import { LoadFailedPanel } from '../components/LoadStates'
import { SkeletonCard } from '../components/mockup/Skeleton'
import PullToRefresh from '../components/PullToRefresh'
import { toast } from '../services/toast'

const RESULT_MESSAGE: Record<string, string> = {
  paid: 'Unblocked. The payout was sent.',
  failed: "Unblocked. Stripe didn't accept it yet; it will be retried automatically.",
  blocked: 'Stripe refused it again, so it is still blocked. Check the error below.',
  not_due: 'Unblocked. The payout will go out with the next run.',
}

/** Owner payouts Stripe refused permanently (e.g. a restricted account). Fix
 *  the cause with the owner, then unblock: the payout is retried at once. */
export default function AdminBlockedPayoutsScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: queryKeys.adminBlockedPayouts(), queryFn: listBlockedPayouts })
  useRefreshOnFocus(queryKeys.adminBlockedPayouts())
  const [busyId, setBusyId] = useState<string | null>(null)
  const items = query.data ?? []

  const unblock = async (id: string) => {
    setBusyId(id)
    try {
      const { result } = await unblockPayout(id)
      const message = RESULT_MESSAGE[result] ?? RESULT_MESSAGE.not_due
      if (result === 'blocked') toast.info(message)
      else toast.success(message)
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    } catch (err) {
      toast.failure(err, { action: "Couldn't unblock this payout. Please try again." })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Screen scroll={false} header={<ScreenHeader title="Blocked payouts" back />} contentStyle={styles.screenContent}>
      <FlatList
        data={query.isPending ? [] : items}
        keyExtractor={(item) => item.id}
        refreshControl={<PullToRefresh refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        ListHeaderComponent={
          <Text style={styles.subtitle}>
            Stripe refused these owner payouts and won't accept a retry until the cause is fixed. Sort it out with the
            owner, then unblock to try again.
          </Text>
        }
        ListEmptyComponent={
          query.isPending ? (
            <View style={styles.skeletons} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : query.isError ? (
            <LoadFailedPanel error={query.error} what="blocked payouts" onRetry={() => query.refetch()} />
          ) : (
            <StatePanel title="No blocked payouts" body="Every payout Stripe was asked for went through or is retrying." />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <BlockedCard item={item} busy={busyId === item.id} onUnblock={() => unblock(item.id)} />}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

function BlockedCard({ item, busy, onUnblock }: { item: AdminBlockedPayout; busy: boolean; onUnblock: () => void }) {
  return (
    <Card shadow="sm" padding={space.xxl} contentStyle={styles.card}>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
      <Text style={styles.cardBody}>
        ${Number(item.ownerPayout).toFixed(2)} to {item.owner.firstName} · blocked since {formatDateTime(item.payoutBlockedAt)}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>Owner: {item.owner.email}</Text>
      <Text style={styles.cardMeta}>Stripe: {item.blockedReason ?? 'No error recorded.'}</Text>
      <Button label="Unblock and retry" size="sm" variant="secondary" onPress={onUnblock} loading={busy} />
    </Card>
  )
}

const styles = StyleSheet.create({
  skeletons: { gap: space.lg },
  screenContent: { paddingHorizontal: 0, paddingBottom: 0 },
  content: { paddingHorizontal: space.screen },
  subtitle: { ...type.bodySm, color: colors.mutedAlt, marginBottom: space.lg },
  separator: { height: space.lg },
  card: { gap: space.sm },
  cardTitle: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink },
  cardBody: { ...type.bodySm, color: colors.muted },
  cardMeta: { ...type.caption, color: colors.mutedAlt },
})
