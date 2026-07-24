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
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { ListingBrowseItem } from '../types'
import { getNearbyListings } from '../services/listingsApi'
import { theme } from '../theme/colors'
import ZoinkFullLogo from '../components/ZoinkFullLogo'

type Nav = NativeStackNavigationProp<RootStackParamList>

const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const DEFAULT_RADIUS_KM = 5000
const CATEGORIES = ['All', 'Electronics', 'Tools', 'Sports', 'Outdoors', 'Audio/Video', 'Cameras', 'Clothing', 'Books', 'Other']

export default function HomeScreen() {
  const { user, logout } = useAuth()
  const nav = useNavigation<Nav>()

  const [listings, setListings] = useState<ListingBrowseItem[]>([])
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
      console.log(`Fetched ${data.length} listings at radius ${DEFAULT_RADIUS_KM}km`)
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

  const renderListing = ({ item }: { item: ListingBrowseItem }) => {
    const imageUrl = item.images[0]?.url

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
          nav.navigate('ListingDetail', { listingId: item.id })
        }}
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
    <View style={{ flex: 1 }}>
      <FlatList
        data={filteredListings}
        keyExtractor={(item) => item.id}
        renderItem={renderListing}
        numColumns={2}
        columnWrapperStyle={styles.rowWrapper}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* ── Top row: greeting ── */}
            <View style={styles.headerTopRow}>
              <View>
                <Text style={styles.greetingText}>Good morning{user?.firstName ? `, ${user.firstName}` : ''} 👋</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.headerTitle}>Don't buy, </Text>
                  <ZoinkFullLogo width={160} height={75} style={{ marginHorizontal: 5, marginTop: -20, marginBottom: -15 }} />
                  <Text style={styles.headerTitle}>it.</Text>
                </View>
              </View>
            </View>

            {/* ── Glassy hero card ── */}
            <View style={styles.heroCard}>
              <View style={styles.heroCardInner}>
                <Text style={styles.heroCardLabel}>peer-to-peer rentals</Text>
                <Text style={styles.heroCardSub}>Your campus marketplace</Text>
              </View>
              <View style={styles.heroCardActions}>
                <TouchableOpacity
                  style={styles.heroActionBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { })
                    nav.navigate('CreateListing')
                  }}
                >
                  <View style={styles.heroActionIconWrap}>
                    <Text style={[styles.heroActionIcon, { color: theme.primaryDeep }]}>＋</Text>
                  </View>
                  <Text style={styles.heroActionLabel}>List item</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroActionBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
                    nav.navigate('MyListings')
                  }}
                >
                  <View style={styles.heroActionIconWrap}>
                    <Text style={styles.heroActionIcon}>📦</Text>
                  </View>
                  <Text style={styles.heroActionLabel}>My listings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroActionBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
                    nav.navigate('BookingHistory')
                  }}
                >
                  <View style={styles.heroActionIconWrap}>
                    <Text style={styles.heroActionIcon}>🗓</Text>
                  </View>
                  <Text style={styles.heroActionLabel}>Bookings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroActionBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
                    nav.navigate('BookingRequests')
                  }}
                >
                  <View style={styles.heroActionIconWrap}>
                    <Text style={styles.heroActionIcon}>📨</Text>
                  </View>
                  <Text style={styles.heroActionLabel}>Requests</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Category chips ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContainer}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat
                return (
                  <TouchableOpacity
                    key={cat}
                    activeOpacity={0.75}
                    style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
                      setSelectedCategory(cat)
                    }}
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
  container: { flex: 1 },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  listContent: { paddingHorizontal: 16, paddingTop: 90, paddingBottom: 120 },
  headerBlock: { marginBottom: 20 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  greetingText: { color: theme.textMuted, fontSize: 13, marginBottom: 4, fontWeight: '300' },
  headerTitle: { color: theme.text, fontSize: 30, fontWeight: '500', lineHeight: 36 },
  headerTitleAccent: { color: theme.primary },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  bellIcon: { fontSize: 18 },
  // ── Hero card ──────────────────────────────────────────
  heroCard: {
    backgroundColor: theme.cardBackground,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  heroCardInner: {
    marginBottom: 20,
  },
  heroCardLabel: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroCardSub: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '300',
  },
  heroCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroActionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  heroActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(109, 216, 50, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionIcon: {
    fontSize: 20,
  },
  heroActionLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  // ── Category chips ──────────────────────────────────────
  chipsScroll: { marginHorizontal: -16, marginBottom: 18 },
  chipsContainer: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: theme.primarySurface,
    borderColor: theme.borderFocus,
    borderTopColor: 'rgba(22, 255, 110, 0.4)',
  },
  chipUnselected: { 
    backgroundColor: theme.surfaceSubdued,
    borderColor: theme.border,
    borderTopColor: theme.border,
    borderBottomColor: theme.borderBottom,
  },
  chipTextSelected: { color: theme.primary, fontWeight: '600', fontSize: 14 },
  chipTextUnselected: { color: theme.textMuted, fontWeight: '400', fontSize: 14 },
  errorText: { marginTop: 14, color: theme.colors.danger, fontSize: 13 },
  // ── Listing grid ──────────────────────────────────────
  rowWrapper: { gap: 14, justifyContent: 'space-between', marginBottom: 14 },
  card: {
    flex: 1,
    backgroundColor: theme.cardBackground,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  thumbnailContainer: {
    width: '100%',
    height: 130,
    backgroundColor: theme.surfaceSubdued,
    position: 'relative',
  },
  cardImage: { width: '100%', height: '100%' },
  imageFallback: { justifyContent: 'center', alignItems: 'center' },
  imageFallbackText: { color: theme.primary, fontWeight: '900', fontSize: 14 },
  badgePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: theme.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.primaryLight,
  },
  badgeText: { color: theme.primaryDeep, fontSize: 10, fontWeight: '500', textTransform: 'uppercase' },
  cardBody: { padding: 12 },
  cardTitle: { color: theme.text, fontSize: 14, fontWeight: '500', marginBottom: 4 },
  cardMeta: { color: theme.textMuted, fontSize: 11, marginBottom: 6 },
  cardPrice: { color: theme.primaryDeep, fontSize: 15, fontWeight: '500' },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '500', marginBottom: 8 },
  emptyText: { color: theme.textMuted, fontSize: 14 },
})
