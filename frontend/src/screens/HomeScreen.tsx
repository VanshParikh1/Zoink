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
} from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { ListingBrowseItem } from '../types'
import { getNearbyListings } from '../services/listingsApi'
import { theme } from '../theme/colors'
import ZoinkFullLogo from '../components/ZoinkFullLogo'
import HardBlock from '../components/HardBlock'
import ScreenBackground from '../components/ScreenBackground'

type Nav = NativeStackNavigationProp<RootStackParamList>

const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const DEFAULT_RADIUS_KM = 5000

export default function HomeScreen() {
  const { user, logout } = useAuth()
  const nav = useNavigation<Nav>()

  const [listings, setListings] = useState<ListingBrowseItem[]>([])
  const [coords, setCoords] = useState(DEFAULT_COORDS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

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

  const renderListing = ({ item }: { item: ListingBrowseItem }) => {
    const imageUrl = item.images[0]?.url

    return (
      <View style={styles.cardWrap}>
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
      </View>
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
    <ScreenBackground>
      <FlatList
        data={listings}
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

            {/* ── Hero card ── */}
            <HardBlock radius={theme.radius.sm} offset={theme.hard.offset.md} style={styles.heroCardWrap} contentStyle={styles.heroCard}>
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
                    <Feather name="plus" size={20} color={theme.primaryDeep} />
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
                    <Feather name="package" size={20} color={theme.text} />
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
                    <Feather name="calendar" size={20} color={theme.text} />
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
                    <Feather name="inbox" size={20} color={theme.text} />
                  </View>
                  <Text style={styles.heroActionLabel}>Requests</Text>
                </TouchableOpacity>
              </View>
            </HardBlock>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No listings found</Text>
            <Text style={styles.emptyText}>
              Nothing nearby right now — pull to refresh.
            </Text>
          </View>
        }
      />
    </ScreenBackground>
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
  greetingText: { color: theme.textMuted, fontSize: 13, marginBottom: 4, fontWeight: '600' },
  headerTitle: { color: theme.text, fontSize: 30, fontWeight: '900', lineHeight: 36 },
  headerTitleAccent: { color: theme.primary },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  bellIcon: { fontSize: 18 },
  // ── Hero card ──────────────────────────────────────────
  heroCardWrap: {
    marginBottom: 16,
  },
  heroCard: {
    padding: 20,
  },
  heroCardInner: {
    marginBottom: 20,
  },
  heroCardLabel: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroCardSub: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
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
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  heroActionLabel: {
    color: theme.text,
    fontSize: 11,
    fontWeight: '700',
  },
  errorText: { marginTop: 14, color: theme.colors.danger, fontSize: 13 },
  // ── Listing grid ──────────────────────────────────────
  rowWrapper: { gap: 14, justifyContent: 'space-between', marginBottom: 14 },
  cardWrap: {
    flex: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
  },
  card: {
    backgroundColor: theme.cardBackground,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
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
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  badgeText: { color: theme.text, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  cardBody: { padding: 12 },
  cardTitle: { color: theme.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  cardMeta: { color: theme.textMuted, fontSize: 11, marginBottom: 6 },
  cardPrice: { color: theme.primaryDeep, fontSize: 15, fontWeight: '900' },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '900', marginBottom: 8 },
  emptyText: { color: theme.textMuted, fontSize: 14 },
})
