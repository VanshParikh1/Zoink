import React, { useCallback, useState } from 'react'
import { FlatList, LayoutChangeEvent, RefreshControl, StyleSheet, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootStackParamList } from '../navigation'
import { getMyListings } from '../services/listingsApi'
import { getIncomingRequests } from '../services/bookingsApi'
import { Booking, Listing } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import IconButton from '../components/mockup/IconButton'
import ListingGridCard from '../components/mockup/ListingGridCard'
import StatePanel from '../components/mockup/StatePanel'
import { BadgeVariant } from '../components/mockup/Badge'

type Nav = NativeStackNavigationProp<RootStackParamList>

// Same grid as Home: two equal columns sized from the list's measured width.
const GRID_COLUMNS = 2
const COLUMN_GAP = space.lg
const ROW_GAP = space.xl
const SKELETON_COUNT = 4

function statusBadge(listing: Listing, activeBooking?: Booking): { label: string; variant: BadgeVariant } {
  if (activeBooking) return { label: 'Rented out', variant: 'green' }
  return listing.isAvailable ? { label: 'Active', variant: 'lime' } : { label: 'Paused', variant: 'surface' }
}

export default function MyListingsScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const [listings, setListings] = useState<Listing[]>([])
  const [activeBookingsByListing, setActiveBookingsByListing] = useState<Record<string, Booking>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [listWidth, setListWidth] = useState(0)
  const cellWidth = listWidth ? Math.floor((listWidth - COLUMN_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS) : 0

  const fetchListings = useCallback(async () => {
    try {
      setError('')
      const [data, ownerBookings] = await Promise.all([getMyListings(), getIncomingRequests()])
      const activeByListing = ownerBookings.reduce<Record<string, Booking>>((acc, booking) => {
        if (booking.status === 'ACTIVE' || booking.status === 'PICKUP_PENDING' || booking.status === 'RETURN_PENDING') {
          acc[booking.listingId] = booking
        }
        return acc
      }, {})
      setListings(data)
      setActiveBookingsByListing(activeByListing)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load your listings right now.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchListings()
    }, [fetchListings])
  )

  const onRefresh = () => {
    setRefreshing(true)
    fetchListings()
  }

  return (
    <Screen
      scroll={false}
      contentStyle={styles.screenContent}
      header={
        <ScreenHeader
          title="My listings"
          back
          right={
            <IconButton accessibilityLabel="List an item" onPress={() => nav.navigate('CreateListing')}>
              <Feather name="plus" size={22} color={colors.ink} />
            </IconButton>
          }
        />
      }
    >
      <FlatList
        data={loading && !refreshing ? [] : listings}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        onLayout={(e: LayoutChangeEvent) => setListWidth(e.nativeEvent.layout.width)}
        renderItem={({ item }) => {
          const activeBooking = activeBookingsByListing[item.id]
          return cellWidth > 0 ? (
            <ListingGridCard
              listing={item}
              width={cellWidth}
              badge={statusBadge(item, activeBooking)}
              onPress={() =>
                activeBooking
                  ? nav.navigate('ActiveRental', { bookingId: activeBooking.id })
                  : nav.navigate('ListingDetail', { listingId: item.id })
              }
            />
          ) : null
        }}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenText} colors={[colors.green]} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonGrid}>
              {cellWidth > 0
                ? Array.from({ length: SKELETON_COUNT }, (_, i) => <ListingGridCard.Skeleton key={i} width={cellWidth} />)
                : null}
            </View>
          ) : error ? (
            <StatePanel
              title="Your listings couldn't load"
              body={error}
              action={{ label: 'Try again', onPress: fetchListings, variant: 'primary' }}
            />
          ) : (
            <StatePanel
              title="You have not listed anything yet."
              body="Post your first item to start getting requests from nearby students."
              action={{ label: 'List an item', onPress: () => nav.navigate('CreateListing'), variant: 'primary' }}
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
  gridRow: { gap: COLUMN_GAP },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: COLUMN_GAP, rowGap: ROW_GAP },
  separator: { height: ROW_GAP },
})
