import React from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatDateTime, formatRentalDate } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { listOverdueBookings } from '../services/adminApi'
import { queryKeys } from '../services/queryKeys'
import { useRefreshOnFocus } from '../hooks/usePagedList'
import { AdminOverdueBooking } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Badge from '../components/mockup/Badge'
import StatePanel from '../components/mockup/StatePanel'
import { LoadFailedPanel } from '../components/LoadStates'
import { SkeletonCard } from '../components/mockup/Skeleton'
import PullToRefresh from '../components/PullToRefresh'

type Nav = NativeStackNavigationProp<RootStackParamList>

/** D-1: rentals the overdue job flagged that are still out. Each opens the close-out form. */
export default function AdminOverdueScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const query = useQuery({ queryKey: queryKeys.adminOverdue(), queryFn: listOverdueBookings })
  useRefreshOnFocus(queryKeys.adminOverdue())
  const items = query.data ?? []

  return (
    <Screen scroll={false} header={<ScreenHeader title="Overdue rentals" back />} contentStyle={styles.screenContent}>
      <FlatList
        data={query.isPending ? [] : items}
        keyExtractor={(item) => item.id}
        refreshControl={<PullToRefresh refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        ListHeaderComponent={
          <Text style={styles.subtitle}>
            Not returned by the end of the day after the rental ended. Contact both people, then close it out.
          </Text>
        }
        ListEmptyComponent={
          query.isPending ? (
            <View style={styles.skeletons} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : query.isError ? (
            <LoadFailedPanel error={query.error} what="overdue rentals" onRetry={() => query.refetch()} />
          ) : (
            <StatePanel title="Nothing overdue" body="Every rental came back on time. Pull down to check again." />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <OverdueCard item={item} onPress={() => nav.navigate('AdminCloseOut', closeOutParams(item))} />}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

function closeOutParams(item: AdminOverdueBooking): RootStackParamList['AdminCloseOut'] {
  return {
    bookingId: item.id,
    listingTitle: item.listing.title,
    depositAmount: item.depositStatus === 'AUTHORIZED' ? item.depositAmount : '0',
  }
}

function OverdueCard({ item, onPress }: { item: AdminOverdueBooking; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.listing.title}, overdue, close out`}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card shadow="sm" padding={space.xxl} contentStyle={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
          <Badge label={item.status === 'RETURN_PENDING' ? 'Return started' : 'Out'} variant="tan" />
        </View>
        <Text style={styles.cardBody}>
          Ended {formatRentalDate(item.endDate, 'long')} · overdue since {formatDateTime(item.overdueAt)}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>Renter: {item.renter.firstName} · {item.renter.email}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>Owner: {item.owner.firstName} · {item.owner.email}</Text>
        {item.depositStatus === 'AUTHORIZED' ? (
          <Text style={styles.cardMeta}>Deposit held: ${Number(item.depositAmount).toFixed(2)}</Text>
        ) : null}
        {item.disputeStatus === 'OPEN' || item.disputeStatus === 'UNDER_REVIEW' ? (
          <Text style={styles.cardMeta}>Has an open dispute</Text>
        ) : null}
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  skeletons: { gap: space.lg },
  screenContent: { paddingHorizontal: 0, paddingBottom: 0 },
  content: { paddingHorizontal: space.screen },
  subtitle: { ...type.bodySm, color: colors.mutedAlt, marginBottom: space.lg },
  separator: { height: space.lg },
  pressed: { opacity: 0.85 },
  card: { gap: space.sm },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.lg },
  cardTitle: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink, flex: 1 },
  cardBody: { ...type.bodySm, color: colors.muted },
  cardMeta: { ...type.caption, color: colors.mutedAlt },
})
