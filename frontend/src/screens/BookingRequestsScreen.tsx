import React, { useMemo, useState, useRef } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootStackParamList } from '../navigation'
import type { BookingListItem, BookingListPage } from '@zoink/shared'
import { acceptBooking, declineBooking, getBookingListPage } from '../services/bookingsApi'
import { queryKeys } from '../services/queryKeys'
import { applyBookingUpdate } from '../services/bookingCache'
import { usePagedList } from '../hooks/usePagedList'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import ListingCard, { ListingCardSkeleton } from '../components/mockup/ListingCard'
import Button from '../components/mockup/Button'
import StatePanel from '../components/mockup/StatePanel'
import { bookingStatusBadge } from '../components/mockup/bookingStatus'
import { sortBookingsLiveFirst } from '../utils/sortBookings'
import { formatRentalDate } from '@zoink/shared'
import { toast } from '../services/toast'
import { LoadFailedPanel } from '../components/LoadStates'
import { confirmDecline } from '../utils/confirmBookingChange'

type Nav = NativeStackNavigationProp<RootStackParamList>

const SKELETON_COUNT = 3

function formatDate(dateStr: string) {
  return formatRentalDate(dateStr, 'short')
}

function formatDateRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

export default function BookingRequestsScreen() {
  const nav = useNavigation<Nav>()
  const [busyId, setBusyId] = useState<string | null>(null)
  const insets = useSafeAreaInsets()
  const feed = usePagedList<BookingListItem, BookingListPage>(queryKeys.bookingList('owner'), (cursor) =>
    getBookingListPage('owner', cursor)
  )
  const { items: bookings, loading, refreshing } = feed

  // Live/confirmed rentals always sit at the top; the rest fall below, newest
  // rental first. (The server pages in this order too.)
  const orderedBookings = useMemo(() => sortBookingsLiveFirst(bookings), [bookings])

  // One answer per request at a time: a second tap on the same row before
  // the first returns is dropped (the busy state only shows a frame later).
  const inFlight = useRef(new Set<string>())

  async function handleAction(id: string, action: 'accept' | 'decline') {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    setBusyId(id)

    try {
      const updated = action === 'accept' ? await acceptBooking(id) : await declineBooking(id)
      applyBookingUpdate(updated)
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't update this request. Please try again." })
    } finally {
      inFlight.current.delete(id)
      setBusyId(null)
    }
  }

  // Across every page, not just the loaded ones.
  const pendingCount = feed.firstPage?.pendingCount ?? bookings.filter((booking) => booking.status === 'PENDING').length

  return (
    <Screen scroll={false} header={<ScreenHeader title="Requests" back />} contentStyle={styles.screenContent}>
      <FlatList
        data={loading ? [] : orderedBookings}
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
          <Text style={styles.summary}>
            {loading
              ? 'Loading incoming requests…'
              : feed.error || feed.offline
                ? ''
                : bookings.length === 0
                ? 'No pending action right now'
                : `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting on you`}
          </Text>
        }
        ItemSeparatorComponent={Separator}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={1}
        ListFooterComponent={feed.loadingMore ? <ListingCardSkeleton style={styles.footer} /> : null}
        ListEmptyComponent={
          loading ? (
            <View style={styles.list}>
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </View>
          ) : feed.error || feed.offline ? (
            <LoadFailedPanel error={feed.error} offline={feed.offline} what="your requests" onRetry={feed.retry} />
          ) : (
            <StatePanel
              title="No requests have landed yet"
              body="As soon as someone wants one of your items, you'll be able to review dates and respond from here."
              action={{ label: 'View my listings', onPress: () => nav.navigate('MyListings') }}
            />
          )
        }
        renderItem={({ item }) => {
          const isPending = item.status === 'PENDING'
          const isBusy = busyId === item.id
          return (
            <ListingCard
              // The booking's listing snapshot has no deposit; the status badge replaces it anyway.
              listing={{ ...item.listing, depositAmount: '0' }}
              caption={`${item.renter.firstName} ${item.renter.lastName} · ${formatDateRange(item.startDate, item.endDate)}`}
              subtitle={`$${item.totalPrice.toFixed(2)} · net $${item.ownerPayout.toFixed(2)}`}
              badge={bookingStatusBadge(item.status)}
              onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}
            >
              {isPending ? (
                <View style={styles.actions}>
                  <Button
                    label="Accept"
                    size="sm"
                    loading={isBusy}
                    onPress={() => handleAction(item.id, 'accept')}
                    style={styles.action}
                  />
                  <Button
                    label="Decline"
                    variant="secondary"
                    size="sm"
                    disabled={isBusy}
                    onPress={() => confirmDecline(item.renter.firstName, () => handleAction(item.id, 'decline'))}
                    style={styles.action}
                  />
                </View>
              ) : null}
            </ListingCard>
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
  screenContent: { paddingBottom: 0 },
  content: { gap: space.lg },
  summary: { ...type.caption, color: colors.mutedAlt },
  list: { gap: space.lg },
  separator: { height: space.lg },
  footer: { marginTop: space.lg },
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1 },
})
