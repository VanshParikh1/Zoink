import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
} from 'react-native'
import * as Location from 'expo-location'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { Listing } from '../types'
import { getNearbyListings } from '../services/listingsApi'
import LogoPlaceholder from '../components/LogoPlaceholder'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const DEFAULT_RADIUS_KM = 25

export default function HomeScreen() {
  const { user } = useAuth()
  const nav = useNavigation<Nav>()

  const [listings, setListings] = useState<Listing[]>([])
  const [coords, setCoords] = useState(DEFAULT_COORDS)
  const [locationLabel, setLocationLabel] = useState('Fetching your location')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const greeting = useMemo(() => {
    if (!user?.firstName) return 'Explore nearby rentals'
    return `Hi ${user.firstName}, explore nearby rentals`
  }, [user?.firstName])

  const fetchListings = useCallback(async (currentCoords: typeof DEFAULT_COORDS) => {
    try {
      setError('')
      const data = await getNearbyListings({
        lat: currentCoords.latitude,
        lng: currentCoords.longitude,
        radius: DEFAULT_RADIUS_KM,
      })
      setListings(data)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load nearby listings right now.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadLocationAndListings = useCallback(async () => {
    setLoading(true)

    try {
      const permission = await Location.requestForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        setLocationLabel('Showing listings around downtown Toronto')
        setCoords(DEFAULT_COORDS)
        await fetchListings(DEFAULT_COORDS)
        return
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })

      const nextCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }

      setCoords(nextCoords)
      setLocationLabel('Showing listings near you')
      await fetchListings(nextCoords)
    } catch {
      setLocationLabel('Showing listings around downtown Toronto')
      setCoords(DEFAULT_COORDS)
      await fetchListings(DEFAULT_COORDS)
    }
  }, [fetchListings])

  useEffect(() => {
    loadLocationAndListings()
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchListings(coords)
    }, [coords, fetchListings])
  )

  const onRefresh = () => {
    setRefreshing(true)
    fetchListings(coords)
  }

  const renderListing = ({ item }: { item: Listing }) => {
    const imageUrl = item.images[0]?.url

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => nav.navigate('ListingDetail', { listingId: item.id })}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.imageFallback]}>
            <Text style={styles.imageFallbackText}>{item.category}</Text>
          </View>
        )}

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={[styles.statusPill, item.isAvailable ? styles.statusLive : styles.statusPaused]}>
              <Text style={styles.statusPillText}>{item.isAvailable ? 'Live' : 'Paused'}</Text>
            </View>
          </View>

          <Text style={styles.cardMeta} numberOfLines={2}>
            {item.description}
          </Text>

          <View style={styles.cardFooter}>
            <View>
              <Text style={styles.cardPrice}>${Number(item.dailyPrice).toFixed(2)} / day</Text>
              <Text style={styles.cardCity}>
                {item.city}
                {typeof item.distanceKm === 'number' ? ` - ${item.distanceKm.toFixed(1)} km away` : ''}
              </Text>
            </View>
            <Text style={styles.cardOwner}>
              {item.owner.firstName} {item.owner.lastName}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading nearby listings...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={renderListing}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>ZOINK MARKET</Text>
                <Text style={styles.title}>{greeting}</Text>
              </View>
              <LogoPlaceholder size="small" style={styles.heroLogo} />
            </View>
            <Text style={styles.subtitle}>{locationLabel}</Text>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => nav.navigate('CreateListing')}>
                <Text style={styles.primaryButtonText}>Create listing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => nav.navigate('MyListings')}>
                <Text style={styles.secondaryButtonText}>My listings</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.tertiaryButton} onPress={() => nav.navigate('BookingHistory')}>
                <Text style={styles.tertiaryButtonText}>My bookings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tertiaryButton} onPress={() => nav.navigate('BookingRequests')}>
                <Text style={styles.tertiaryButtonText}>Requests</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tertiaryButton} onPress={() => nav.navigate('MainApp', { tab: 'Inbox' })}>
                <Text style={styles.tertiaryButtonText}>Inbox</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.profileButton} onPress={() => nav.navigate('MainApp', { tab: 'MyProfile' })}>
                <Text style={styles.profileButtonText}>Open my profile card</Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No nearby listings yet</Text>
            <Text style={styles.emptyText}>
              Pull to refresh, or be the first person in your area to put something up for rent.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => nav.navigate('CreateListing')}>
              <Text style={styles.emptyButtonText}>Post the first listing</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.screen },
  loadingScreen: {
    flex: 1,
    backgroundColor: theme.screen,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  listContent: { paddingHorizontal: 18, paddingTop: 60, paddingBottom: 32 },
  hero: {
    backgroundColor: theme.surface,
    borderRadius: 28,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroLogo: {
    flexShrink: 0,
    marginTop: 2,
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: { color: theme.text, fontSize: 30, fontWeight: '900', lineHeight: 36, marginBottom: 10, flex: 1 },
  subtitle: { color: theme.textMuted, fontSize: 15, lineHeight: 22 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  primaryButton: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: theme.primaryText, fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    backgroundColor: theme.colors.inkBlack,
    borderWidth: 1,
    borderColor: theme.colors.inkBlack,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: theme.primary, fontSize: 15, fontWeight: '900' },
  tertiaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.screen,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tertiaryButtonText: { color: theme.text, fontSize: 13, fontWeight: '800' },
  profileButton: {
    flex: 1,
    backgroundColor: theme.colors.forestGreen,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  profileButtonText: {
    color: theme.colors.porcelain,
    fontSize: 15,
    fontWeight: '900',
  },
  errorText: { marginTop: 14, color: theme.colors.danger, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 3,
  },
  cardImage: { width: '100%', height: 200, backgroundColor: theme.surfaceSoft },
  imageFallback: { justifyContent: 'center', alignItems: 'center' },
  imageFallbackText: { color: theme.primary, fontWeight: '900', fontSize: 18 },
  cardBody: { padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardTitle: { flex: 1, color: theme.text, fontSize: 19, fontWeight: '900', marginRight: 12 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusLive: { backgroundColor: theme.primary },
  statusPaused: { backgroundColor: theme.colors.danger },
  statusPillText: { color: theme.primaryText, fontSize: 12, fontWeight: '900' },
  cardMeta: { color: theme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  cardPrice: { color: theme.primary, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  cardCity: { color: theme.textMuted, fontSize: 13 },
  cardOwner: { color: theme.text, fontSize: 13, fontWeight: '700' },
  emptyState: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 3,
  },
  emptyTitle: { color: theme.text, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  emptyText: { color: theme.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 18 },
  emptyButton: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyButtonText: { color: theme.primaryText, fontWeight: '900' },
})
