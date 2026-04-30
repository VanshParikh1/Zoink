import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
} from 'react-native'
import * as Location from 'expo-location'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { Listing } from '../types'
import { getNearbyListings } from '../services/listingsApi'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const DEFAULT_RADIUS_KM = 25
const CATEGORIES = ['All', 'Tech', 'Tools', 'Rides', 'Clothes', 'Music']

export default function HomeScreen() {
  const { user } = useAuth()
  const nav = useNavigation<Nav>()

  const [listings, setListings] = useState<Listing[]>([])
  const [coords, setCoords] = useState(DEFAULT_COORDS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

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
      await fetchListings(nextCoords)
    } catch {
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
        activeOpacity={0.75}
        onPress={() => nav.navigate('ListingDetail', { listingId: item.id })}
      >
        <View style={styles.thumbnailContainer}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.cardImage} />
          ) : (
            <View style={[styles.cardImage, styles.imageFallback]}>
              <Text style={styles.imageFallbackText}>{item.category}</Text>
            </View>
          )}
          <View style={styles.badgePill}>
            <Text style={styles.badgeText}>{item.isAvailable ? 'popular' : 'paused'}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {typeof item.distanceKm === 'number' ? `${item.distanceKm.toFixed(1)} km · ` : ''}{item.owner.firstName}
          </Text>
          <Text style={styles.cardPrice}>${Number(item.dailyPrice).toFixed(2)} / day</Text>
        </View>
      </TouchableOpacity>
    )
  }

  const filteredListings = listings.filter(
    (l) => selectedCategory === 'All' || l.category.toLowerCase() === selectedCategory.toLowerCase()
  )

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
        data={filteredListings}
        keyExtractor={(item) => item.id}
        renderItem={renderListing}
        numColumns={2}
        columnWrapperStyle={styles.rowWrapper}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerTopRow}>
              <View>
                <Text style={styles.greetingText}>good morning{user?.firstName ? `, ${user.firstName}` : ''}</Text>
                <Text style={styles.headerTitle}>Don't buy, Zoink it.</Text>
              </View>
              <TouchableOpacity style={styles.bellButton} activeOpacity={0.75} onPress={() => nav.navigate('MainApp', { tab: 'Inbox' })}>
                <Text style={styles.bellIcon}>🔔</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.shortcutsGrid}>
              <TouchableOpacity style={styles.shortcutPrimary} activeOpacity={0.75} onPress={() => nav.navigate('CreateListing')}>
                <Text style={styles.shortcutPrimaryText}>Create listing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shortcutSecondary} activeOpacity={0.75} onPress={() => nav.navigate('MyListings')}>
                <Text style={styles.shortcutSecondaryText}>My listings</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.shortcutsGrid}>
              <TouchableOpacity style={styles.shortcutTertiary} activeOpacity={0.75} onPress={() => nav.navigate('BookingHistory')}>
                <Text style={styles.shortcutTertiaryText}>My bookings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shortcutTertiary} activeOpacity={0.75} onPress={() => nav.navigate('BookingRequests')}>
                <Text style={styles.shortcutTertiaryText}>Requests</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shortcutTertiary} activeOpacity={0.75} onPress={() => nav.navigate('MainApp', { tab: 'Inbox' })}>
                <Text style={styles.shortcutTertiaryText}>Inbox</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContainer}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat
                return (
                  <TouchableOpacity
                    key={cat}
                    activeOpacity={0.75}
                    style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text style={isSelected ? styles.chipTextSelected : styles.chipTextUnselected}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No listings found</Text>
            <Text style={styles.emptyText}>
              Try another category or pull to refresh.
            </Text>
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
  },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  listContent: { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 120 },
  headerBlock: { marginBottom: 24 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greetingText: { color: theme.textMuted, fontSize: 14, marginBottom: 4 },
  headerTitle: { color: theme.text, fontSize: 32, fontWeight: 'bold' },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  bellIcon: { fontSize: 20 },
  shortcutsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  shortcutPrimary: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shortcutPrimaryText: {
    color: theme.primaryText,
    fontSize: 14,
    fontWeight: '900',
  },
  shortcutSecondary: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  shortcutSecondaryText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  shortcutTertiary: {
    flex: 1,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  shortcutTertiaryText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  chipsScroll: { marginHorizontal: -16 },
  chipsContainer: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipSelected: { backgroundColor: theme.primary },
  chipUnselected: { backgroundColor: theme.surfaceAlt },
  chipTextSelected: { color: theme.primaryText, fontWeight: '700', fontSize: 14 },
  chipTextUnselected: { color: theme.textMuted, fontWeight: '600', fontSize: 14 },
  errorText: { marginTop: 14, color: theme.colors.danger, fontSize: 13 },
  rowWrapper: { gap: 16, justifyContent: 'space-between', marginBottom: 16 },
  card: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  thumbnailContainer: {
    width: '100%',
    height: 140,
    backgroundColor: theme.surfaceAlt,
    position: 'relative',
  },
  cardImage: { width: '100%', height: '100%' },
  imageFallback: { justifyContent: 'center', alignItems: 'center' },
  imageFallbackText: { color: theme.primary, fontWeight: '900', fontSize: 14 },
  badgePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: theme.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: theme.primary, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  cardBody: { padding: 12 },
  cardTitle: { color: theme.text, fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  cardMeta: { color: theme.textFaint, fontSize: 12, marginBottom: 8 },
  cardPrice: { color: theme.primary, fontSize: 15, fontWeight: 'bold' },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptyText: { color: theme.textMuted, fontSize: 14 },
})
