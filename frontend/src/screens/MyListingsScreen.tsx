import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getMyListings } from '../services/listingsApi'
import { getIncomingRequests } from '../services/bookingsApi'
import { Booking, Listing } from '../types'
import ZoinkLogo from '../components/ZoinkLogo'
import ZoinkFullLogo from '../components/ZoinkFullLogo'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function MyListingsScreen() {
  const nav = useNavigation<Nav>()
  const [listings, setListings] = useState<Listing[]>([])
  const [activeBookingsByListing, setActiveBookingsByListing] = useState<Record<string, Booking>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

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

  const renderItem = ({ item }: { item: Listing }) => {
    const imageUrl = item.images[0]?.url
    const activeBooking = activeBookingsByListing[item.id]

    return (
      <View style={styles.cardWrap}>
        <TouchableOpacity
          style={[styles.card, activeBooking && styles.activeCard]}
          onPress={() =>
            activeBooking
              ? nav.navigate('ActiveRental', { bookingId: activeBooking.id })
              : nav.navigate('ListingDetail', { listingId: item.id })
          }
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <ZoinkFullLogo width={80} height={24} />
            </View>
          )}

          <View style={styles.cardContent}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.price}>${Number(item.dailyPrice).toFixed(2)} / day</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, item.isAvailable ? styles.availDot : styles.unavailDot]} />
              <Text style={styles.statusText}>{item.isAvailable ? 'Available' : 'Unavailable'}</Text>
            </View>
            {activeBooking ? (
              <TouchableOpacity
                style={styles.activeBadge}
                onPress={() => nav.navigate('ActiveRental', { bookingId: activeBooking.id })}
              >
                <Text style={styles.activeBadgeText}>Active Rental</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.arrow}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Listings</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => nav.navigate('CreateListing')}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listings}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyErrorTitle}>Your listings couldn't load</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.btn} onPress={fetchListings}>
                <Text style={styles.btnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <ZoinkLogo size={60} style={styles.emptyLogo} />
              <Text style={styles.emptyTitle}>You have not listed anything yet.</Text>
              <Text style={styles.emptyText}>Post your first item to start getting requests from nearby students.</Text>
              <TouchableOpacity style={styles.btn} onPress={() => nav.navigate('CreateListing')}>
                <Text style={styles.btnText}>Create your first listing</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, backgroundColor: theme.screen, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: theme.header.stackTop,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: { ...theme.type.screenTitle },
  backBtn: { width: 60 },
  backText: { color: theme.primary, fontSize: 16, fontWeight: '800' },
  addBtn: { width: 60, alignItems: 'flex-end' },
  addBtnText: { color: theme.primary, fontSize: 16, fontWeight: '900' },
  list: { padding: 20 },
  cardWrap: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
    marginBottom: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    padding: 12,
    alignItems: 'center',
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  activeCard: {
    backgroundColor: theme.primarySurface,
  },
  image: { width: 70, height: 70, borderRadius: theme.radius.sm, backgroundColor: theme.primarySurface, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, marginLeft: 16 },
  title: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 4 },
  price: { fontSize: 15, color: theme.primaryDeep, fontWeight: '900', marginBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  availDot: { backgroundColor: theme.primary },
  unavailDot: { backgroundColor: theme.colors.danger },
  statusText: { fontSize: 12, color: theme.textMuted },
  activeBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: theme.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  activeBadgeText: { color: theme.primaryDeep, fontSize: 11, fontWeight: '900' },
  arrow: { fontSize: 24, color: theme.primary, marginLeft: 8 },
  empty: { marginTop: 100, alignItems: 'center' },
  emptyLogo: { marginBottom: 18 },
  emptyTitle: { color: theme.text, fontSize: 20, fontWeight: '900', marginBottom: 10, textAlign: 'center' },
  emptyErrorTitle: { color: theme.colors.danger, fontSize: 20, fontWeight: '900', marginBottom: 10, textAlign: 'center' },
  emptyText: { color: theme.textMuted, fontSize: 16, marginBottom: 20, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  btn: { backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: theme.textOnPrimary, fontWeight: '900' },
})

