import React, { useCallback, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootStackParamList } from '../navigation'
import { acceptBooking, declineBooking, getIncomingRequests } from '../services/bookingsApi'
import { Booking } from '../types'
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
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const insets = useSafeAreaInsets()

  // Live/confirmed rentals always sit at the top; the rest fall below, newest
  // rental first.
  const orderedBookings = useMemo(() => sortBookingsLiveFirst(bookings), [bookings])

  const loadBookings = useCallback(async () => {
    try {
      setError('')
      const nextBookings = await getIncomingRequests()
      setBookings(nextBookings)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load incoming requests.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadBookings()
    }, [loadBookings])
  )

  async function handleAction(id: string, action: 'accept' | 'decline') {
    setBusyId(id)

    try {
      const updated = action === 'accept' ? await acceptBooking(id) : await declineBooking(id)
      setBookings((current) => current.map((booking) => (booking.id === id ? updated : booking)))
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not update this request.')
    } finally {
      setBusyId(null)
    }
  }

  const pendingCount = bookings.filter((booking) => booking.status === 'PENDING').length

  return (
    <Screen scroll={false} header={<ScreenHeader title="Requests" back />} contentStyle={styles.screenContent}>
      <FlatList
        data={loading ? [] : orderedBookings}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadBookings()
            }}
            tintColor={colors.greenText}
            colors={[colors.green]}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        ListHeaderComponent={
          <Text style={styles.summary}>
            {loading
              ? 'Loading incoming requests…'
              : bookings.length === 0
                ? 'No pending action right now'
                : `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting on you`}
          </Text>
        }
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          loading ? (
            <View style={styles.list}>
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </View>
          ) : error ? (
            <StatePanel
              title="Incoming requests couldn't load"
              body={error}
              action={{ label: 'Try again', onPress: loadBookings, variant: 'primary' }}
            />
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
                    onPress={() => handleAction(item.id, 'decline')}
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
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1 },
})
