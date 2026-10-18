import React, { useCallback, useRef, useState } from 'react'
import { FlatList, LayoutChangeEvent, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import Feather from '@expo/vector-icons/Feather'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { ListingBrowseItem } from '../types'
import { getNearbyListings } from '../services/listingsApi'
import { useTabLoad } from '../context/MainTabContext'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import { LISTING_CATEGORIES } from '../config/categories'
import { useTabBarClearance } from '../components/mockup/tabBarMetrics'
import Screen from '../components/mockup/Screen'
import LogoPill from '../components/mockup/LogoPill'
import HighlightText from '../components/mockup/HighlightText'
import TextField from '../components/mockup/TextField'
import CategoryChips from '../components/mockup/CategoryChips'
import Card from '../components/mockup/Card'
import IconButton from '../components/mockup/IconButton'
import ListingGridCard from '../components/mockup/ListingGridCard'
import StatePanel from '../components/mockup/StatePanel'
import { markStartup, useScrollPerfProbe } from '../utils/perfMarks'

type Nav = NativeStackNavigationProp<RootStackParamList>

const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const DEFAULT_RADIUS_KM = 5000
const HOME_CATEGORIES = ['All', ...LISTING_CATEGORIES]
const SKELETON_COUNT = 4

// Listing grid: two equal columns. Each cell includes its card's hard-shadow
// padding, so the right column's shadow lands inside the screen gutter.
const GRID_COLUMNS = 2
const COLUMN_GAP = space.lg
const ROW_GAP = space.xl

// "Need it once? Zoink it." in h1 (32) measures about 280pt, so it fits on one
// line on a 375pt phone (335pt inside the gutters). Anything narrower drops to
// 24 instead of wrapping.
const HEADLINE_COMPACT_BELOW = 360
const HEADLINE_COMPACT_SIZE = 24

type QuickAction = { label: string; icon: keyof typeof Feather.glyphMap; route: 'CreateListing' | 'MyListings' | 'BookingHistory' | 'BookingRequests' }

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'List item', icon: 'plus', route: 'CreateListing' },
  { label: 'My listings', icon: 'package', route: 'MyListings' },
  { label: 'Bookings', icon: 'calendar', route: 'BookingHistory' },
  { label: 'Requests', icon: 'inbox', route: 'BookingRequests' },
]

export default function HomeScreen() {
  const tabBarClearance = useTabBarClearance()
  const nav = useNavigation<Nav>()
  const { width } = useWindowDimensions()
  const compactHeadline = width < HEADLINE_COMPACT_BELOW

  const [listings, setListings] = useState<ListingBrowseItem[]>([])
  const [coords, setCoords] = useState(DEFAULT_COORDS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [listWidth, setListWidth] = useState(0)
  const scrollProbe = useScrollPerfProbe('home-grid')
  const cellWidth = listWidth
    ? Math.floor((listWidth - space.screen * 2 - COLUMN_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS)
    : 0

  const fetchListings = useCallback(async (currentCoords: typeof DEFAULT_COORDS) => {
    try {
      setError('')
      const data = await getNearbyListings({
        lat: currentCoords.latitude,
        lng: currentCoords.longitude,
        radius: DEFAULT_RADIUS_KM,
      })
      setListings(data)
      markStartup('home-content')
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

  // The first visit resolves location and loads; coming back to the tab after
  // another screen was on top reloads at the coordinates already found.
  const locationResolved = useRef(false)
  useTabLoad('Home', useCallback(() => {
    if (locationResolved.current) {
      fetchListings(coords)
    } else {
      locationResolved.current = true
      loadLocationAndListings()
    }
  }, [coords, fetchListings, loadLocationAndListings]))

  const onRefresh = () => {
    setRefreshing(true)
    fetchListings(coords)
  }

  // Home has no search or category filter of its own: both hand off to the
  // Search tab, which owns that logic.
  const openSearch = (category?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
    nav.navigate('MainApp', { tab: 'Search', searchCategory: category })
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.padded}>
        <View style={styles.topRow}>
          <LogoPill size="md" />
        </View>

        <View style={styles.headlineRow}>
          <Text style={[styles.headline, compactHeadline && styles.headlineCompact]}>Need it once? </Text>
          <HighlightText style={[styles.headline, compactHeadline && styles.headlineCompact]}>Zoink it.</HighlightText>
        </View>

        <Pressable onPress={() => openSearch()} accessibilityRole="search" accessibilityLabel="Search near you">
          <View pointerEvents="none">
            <TextField
              label="Search near you"
              placeholder="Cameras, speakers, tools…"
              editable={false}
              leftIcon={<Feather name="search" size={18} color={colors.mutedAlt} />}
            />
          </View>
        </Pressable>
      </View>

      <CategoryChips
        categories={HOME_CATEGORIES}
        selected="All"
        onSelect={(category) => {
          if (category !== 'All') openSearch(category)
        }}
      />

      <View style={styles.padded}>
        <Card contentStyle={styles.quickCard}>
          <Text style={styles.quickEyebrow}>Peer-to-peer rentals</Text>
          <Text style={styles.quickTitle}>Your campus marketplace</Text>
          <View style={styles.quickRow}>
            {QUICK_ACTIONS.map((action) => (
              <View key={action.route} style={styles.quickAction}>
                <IconButton
                  accessibilityLabel={action.label}
                  onPress={() => {
                    Haptics.impactAsync(
                      action.route === 'CreateListing' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
                    ).catch(() => { })
                    nav.navigate(action.route)
                  }}
                >
                  <Feather name={action.icon} size={20} color={colors.ink} />
                </IconButton>
                <Text style={styles.quickLabel}>{action.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Near you</Text>
        {error && listings.length > 0 ? <Text style={styles.inlineError}>{error}</Text> : null}
      </View>
    </View>
  )

  const emptyState = loading ? (
    <View style={styles.skeletonGrid}>
      {cellWidth > 0
        ? Array.from({ length: SKELETON_COUNT }, (_, i) => <ListingGridCard.Skeleton key={i} width={cellWidth} />)
        : null}
    </View>
  ) : error ? (
    <StatePanel
      title="Couldn't load listings"
      body={error}
      action={{ label: 'Try again', onPress: onRefresh, variant: 'primary' }}
    />
  ) : (
    <StatePanel title="No listings found" body="Nothing nearby right now — pull to refresh." />
  )

  return (
    <Screen glow="topLeft" scroll={false} contentStyle={styles.screenContent}>
      <FlatList
        data={loading ? [] : listings}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        onLayout={(e: LayoutChangeEvent) => setListWidth(e.nativeEvent.layout.width)}
        renderItem={({ item }) =>
          cellWidth > 0 ? (
            <ListingGridCard
              listing={item}
              width={cellWidth}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
                nav.navigate('ListingDetail', { listingId: item.id })
              }}
            />
          ) : null
        }
        ItemSeparatorComponent={Separator}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenText} colors={[colors.green]} />}
        contentContainerStyle={{ paddingBottom: tabBarClearance + space.xxl }}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.padded}>{emptyState}</View>}
        style={styles.flatList}
        showsVerticalScrollIndicator={false}
        {...scrollProbe}
      />
    </Screen>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  flatList: {
    flex: 1,
  },
  header: {
    gap: space.xxl,
    marginBottom: space.lg,
  },
  padded: {
    paddingHorizontal: space.screen,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xxl,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: space.xxl,
  },
  headline: {
    ...type.h1,
    color: colors.ink,
  },
  headlineCompact: {
    fontSize: HEADLINE_COMPACT_SIZE,
    lineHeight: HEADLINE_COMPACT_SIZE + 4,
    letterSpacing: -1.2,
  },
  quickCard: {
    gap: space.sm,
  },
  quickEyebrow: {
    ...type.eyebrow,
    color: colors.greenText,
  },
  quickTitle: {
    ...type.section,
    color: colors.ink,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  quickAction: {
    alignItems: 'center',
    gap: space.xs,
  },
  quickLabel: {
    ...type.labelSm,
    color: colors.ink,
  },
  sectionTitle: {
    ...type.section,
    color: colors.ink,
    marginTop: space.screen,
  },
  inlineError: {
    ...type.labelSm,
    color: colors.danger,
    marginTop: space.xs,
  },
  gridRow: {
    paddingHorizontal: space.screen,
    gap: COLUMN_GAP,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: COLUMN_GAP,
    rowGap: ROW_GAP,
  },
  separator: {
    height: ROW_GAP,
  },
})
