import React from 'react'
import { SectionList, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootStackParamList } from '../navigation'
import type { BookingListItem, BookingListPage } from '@zoink/shared'
import { getBookingListPage } from '../services/bookingsApi'
import { queryKeys } from '../services/queryKeys'
import { usePagedList } from '../hooks/usePagedList'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import { isLiveBooking } from '../utils/sortBookings'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import ListingCard, { ListingCardSkeleton } from '../components/mockup/ListingCard'
import StatePanel from '../components/mockup/StatePanel'
import { bookingStatusBadge } from '../components/mockup/bookingStatus'
import { formatRentalDate } from '@zoink/shared'
import { LoadFailedPanel } from '../components/LoadStates'
import PullToRefresh from '../components/PullToRefresh'

type Nav = NativeStackNavigationProp<RootStackParamList>

const SKELETON_COUNT = 3

function formatDate(dateStr: string) {
  return formatRentalDate(dateStr, 'short')
}

function formatDateRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

export default function BookingHistoryScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  // Pages arrive live-first, the order the sections show.
  const feed = usePagedList<BookingListItem, BookingListPage>(queryKeys.bookingList('renter'), (cursor) =>
    getBookingListPage('renter', cursor)
  )
  const { items: bookings, loading, refreshing } = feed
  const total = feed.firstPage?.total ?? bookings.length

  const activeRentals = bookings
    .filter((booking) => isLiveBooking(booking.status))
    .sort((left, right) => new Date(left.startDate).getTime() - new Date(right.startDate).getTime())
  const otherBookings = bookings
    .filter((booking) => !isLiveBooking(booking.status))
    .sort((left, right) => new Date(right.startDate).getTime() - new Date(left.startDate).getTime())

  const sections = [
    { key: 'active', title: 'Active', data: activeRentals },
    { key: 'other', title: 'Requests & past', data: otherBookings },
  ].filter((section) => section.data.length > 0)

  return (
    <Screen scroll={false} header={<ScreenHeader title="Rentals" back />} contentStyle={styles.screenContent}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <PullToRefresh refreshing={refreshing} onRefresh={feed.refresh} />
        }
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        ListHeaderComponent={
          <Text style={styles.summary}>
            {loading
              ? 'Loading your bookings…'
              : feed.error || feed.offline
                ? ''
                : total === 0
                ? 'Nothing booked yet'
                : `${total} booking${total === 1 ? '' : 's'} tracked here`}
          </Text>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item, section }) => (
          <ListingCard
            // The booking's listing snapshot has no deposit; the status badge replaces it anyway.
            listing={{ ...item.listing, depositAmount: '0' }}
            subtitle={formatDateRange(item.startDate, item.endDate)}
            badge={bookingStatusBadge(item.status)}
            onPress={() =>
              section.key === 'active'
                ? nav.navigate('ActiveRental', { bookingId: item.id })
                : nav.navigate('BookingDetail', { bookingId: item.id })
            }
          />
        )}
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
            <LoadFailedPanel error={feed.error} offline={feed.offline} what="your rentals" onRetry={feed.retry} />
          ) : (
            <StatePanel
              title="No booking requests yet"
              body="Once you request a rental, the full timeline from pending to completed will show up here."
              action={{ label: 'Browse rentals', onPress: () => nav.navigate('MainApp', { tab: 'Search' }) }}
            />
          )
        }
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
  sectionTitle: { ...type.section, color: colors.ink, marginTop: space.sm },
  list: { gap: space.lg },
  separator: { height: space.lg },
  footer: { marginTop: space.lg },
})
