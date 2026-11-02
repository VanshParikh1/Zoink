import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Animated, FlatList, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native'
import { haptics } from '../utils/haptics'
import * as Location from 'expo-location'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useFocusEffect, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import { LISTING_CATEGORIES } from '../config/categories'
import { useTabBarClearance } from '../components/mockup/tabBarMetrics'
import type { ListingCardItem } from '@zoink/shared'
import { useQuery } from '@tanstack/react-query'
import { browseListingsPage } from '../services/listingsApi'
import { queryKeys } from '../services/queryKeys'
import { usePagedList } from '../hooks/usePagedList'
import { useTabLoad } from '../context/MainTabContext'
import { isBlockedThisSession } from '../services/blockedUsers'
import Screen from '../components/mockup/Screen'
import TextField from '../components/mockup/TextField'
import CategoryChips from '../components/mockup/CategoryChips'
import ListingCard, { ListingCardSkeleton } from '../components/mockup/ListingCard'
import StatePanel from '../components/mockup/StatePanel'
import { useScrollPerfProbe, useRenderProbe } from '../utils/perfMarks'
import { prefetchListingHero } from '../utils/cloudinaryImage'
import { isWaitingOffline, LoadFailedPanel } from '../components/LoadStates'

type Nav = NativeStackNavigationProp<RootStackParamList>
type MainAppRoute = RouteProp<RootStackParamList, 'MainApp'>

const CATEGORIES = ['All', ...LISTING_CATEGORIES]
const SKELETON_COUNT = 3

// Large radius: seeded/demo listings are frequently far from wherever the
// device actually is, so a "realistic" nearby radius silently hides
// everything. Matches HomeScreen's DEFAULT_RADIUS_KM.
const SEARCH_RADIUS_KM = 5000
const SEARCH_DEBOUNCE_MS = 300

// Global in-memory cache for recently viewed items across the session
let sessionRecentlyViewed: ListingCardItem[] = []

export default function SearchScreen() {
  useRenderProbe('search')
  const tabBarClearance = useTabBarClearance()
  const nav = useNavigation<Nav>()
  const route = useRoute<MainAppRoute>()
  const [query, setQuery] = useState('')
  const [isResultsState, setIsResultsState] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const scrollProbe = useScrollPerfProbe('search-list')

  const [recent, setRecent] = useState<ListingCardItem[]>([])
  // Where to measure distance from: undefined until the tab first opens and
  // asks, null if no location is available.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null | undefined>(undefined)
  // The search actually sent, SEARCH_DEBOUNCE_MS after the last keystroke.
  const [sent, setSent] = useState<{ query?: string; category?: string } | null>(null)
  const [, setBlockedVersion] = useState(0)
  const fadeAnim = useRef(new Animated.Value(1)).current
  const translateAnim = useRef(new Animated.Value(0)).current

  // Home's category chips hand off here with the category to show.
  const requestedCategory = route.params?.searchCategory
  useEffect(() => {
    if (requestedCategory) {
      setSelectedCategory(requestedCategory)
      nav.setParams({ searchCategory: undefined })
    }
  }, [requestedCategory, nav])

  // Trending needs a location fix and a wide browse, so it waits until the
  // Search tab is first opened rather than running behind Home at launch.
  const locationRequested = useRef(false)
  useTabLoad('Search', useCallback(() => {
    if (locationRequested.current) return
    locationRequested.current = true
    // The last known fix answers at once; a fresh one only if there's none.
    Location.getLastKnownPositionAsync()
      .then((loc) => loc ?? Location.getCurrentPositionAsync({}))
      .then((loc) => setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude }))
      .catch(() => setCoords(null))
  }, []))

  const near = coords ? { lat: coords.lat, lng: coords.lng, radius: SEARCH_RADIUS_KM } : {}
  const trendingQuery = useQuery({
    queryKey: queryKeys.browse({ ...near, limit: 5 }),
    queryFn: () => browseListingsPage({ ...near, limit: 5 }).then((page) => page.items),
    enabled: coords !== undefined,
  })

  const resultsParams = { ...sent, ...near }
  const results = usePagedList<ListingCardItem>(
    queryKeys.browse(resultsParams),
    (cursor) => browseListingsPage(resultsParams, cursor),
    { enabled: sent !== null && coords !== undefined, refreshOnFocus: false }
  )

  // Drop anything from a user blocked since these were cached.
  const visible = (item: ListingCardItem) => !isBlockedThisSession(item.ownerId)
  const trending = (trendingQuery.data ?? []).filter(visible)
  const trendingOffline = isWaitingOffline(trendingQuery)
  // Waiting for a location, then for the first answer.
  const trendingLoading = coords === undefined || (trendingQuery.isPending && !trendingOffline)
  const resultItems = results.items.filter(visible)

  useFocusEffect(
    useCallback(() => {
      sessionRecentlyViewed = sessionRecentlyViewed.filter((item) => !isBlockedThisSession(item.ownerId))
      setRecent([...sessionRecentlyViewed])
      setBlockedVersion((version) => version + 1)
    }, [])
  )

  const hasText = query.trim().length > 0 || selectedCategory !== 'All'
  // From the keystroke until its results land, the list shows skeletons
  // instead of flashing "Nothing found" in between.
  const pendingSearch = hasText && (sent?.query !== (query.trim() || undefined) || sent?.category !== (selectedCategory === 'All' ? undefined : selectedCategory))
  const searching = hasText && (pendingSearch || coords === undefined || results.loading)

  useEffect(() => {
    if (hasText !== isResultsState) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setIsResultsState(hasText)
        translateAnim.setValue(20)
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(translateAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          })
        ]).start()
      })
    }

    if (!hasText) {
      setSent(null)
      return
    }
    const timer = setTimeout(() => {
      setSent({
        query: query.trim() || undefined,
        category: selectedCategory === 'All' ? undefined : selectedCategory,
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, selectedCategory, hasText, isResultsState, fadeAnim, translateAnim])

  const handleListingPress = (item: ListingCardItem) => {
    haptics.tap()
    Keyboard.dismiss()

    // Add to top of recently viewed cache
    sessionRecentlyViewed = sessionRecentlyViewed.filter(i => i.id !== item.id)
    sessionRecentlyViewed.unshift(item)
    if (sessionRecentlyViewed.length > 10) sessionRecentlyViewed.pop()

    setRecent([...sessionRecentlyViewed])

    prefetchListingHero(item.images[0]?.url)
    nav.navigate('ListingDetail', { listingId: item.id })
  }

  const renderSection = (title: string, items: ListingCardItem[]) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <ListingCard key={item.id} listing={item} onPress={() => handleListingPress(item)} />
        ))}
      </View>
    </View>
  )

  const renderHeaderComponent = () => (
    <View style={styles.header}>
      <View style={styles.padded}>
        <Text style={styles.title}>Discover</Text>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search items, tools, rides..."
          accessibilityLabel="Search listings"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          leftIcon={<Feather name="search" size={18} color={colors.mutedAlt} />}
          rightAccessory={
            query.length > 0 ? (
              <Pressable
                onPress={() => {
                  haptics.tap()
                  setQuery('')
                }}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Feather name="x-circle" size={18} color={colors.mutedAlt} />
              </Pressable>
            ) : null
          }
        />
      </View>

      <CategoryChips
        categories={CATEGORIES}
        selected={selectedCategory}
        onSelect={(cat) => {
          haptics.tap()
          setSelectedCategory(cat)
        }}
      />

      {!isResultsState && (
        <Animated.View style={[styles.padded, { opacity: fadeAnim, transform: [{ translateY: translateAnim }] }]}>
          {trending.length > 0 ? (
            renderSection('Trending near you', trending)
          ) : trendingLoading ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trending near you</Text>
              <View style={styles.list}>
                {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </View>
            </View>
          ) : trendingQuery.isError || trendingOffline ? (
            <View style={styles.section}>
              <LoadFailedPanel error={trendingQuery.error} offline={trendingOffline} what="what's trending" onRetry={trendingQuery.refetch} />
            </View>
          ) : recent.length === 0 ? (
            <StatePanel
              style={styles.section}
              title="Find what you need."
              body="Search for a camera, a drill or a speaker, or pick a category above."
            />
          ) : null}
          {recent.length > 0 ? renderSection('Recently viewed', recent) : null}
        </Animated.View>
      )}
    </View>
  )

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <FlatList
        data={isResultsState && !searching ? resultItems : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeaderComponent()}
        ListEmptyComponent={
          isResultsState ? (
            <View style={styles.padded}>
              {searching ? (
                <View style={styles.list}>
                  {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                    <ListingCardSkeleton key={i} />
                  ))}
                </View>
              ) : results.error || results.offline ? (
                <LoadFailedPanel error={results.error} offline={results.offline} what="results" onRetry={results.retry} />
              ) : (
                <StatePanel
                  title="Nothing found"
                  body={selectedCategory !== 'All' ? `No ${selectedCategory.toLowerCase()} listings match this search yet. Try other words, or clear the search to browse.` : 'Try other words or another category.'}
                  action={{
                    label: 'Clear search',
                    onPress: () => {
                      setQuery('')
                      setSelectedCategory('All')
                    },
                  }}
                />
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.padded}>
            <ListingCard listing={item} onPress={() => handleListingPress(item)} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: tabBarClearance + space.xxl }}
        ItemSeparatorComponent={Separator}
        onEndReached={isResultsState ? results.loadMore : undefined}
        onEndReachedThreshold={1}
        ListFooterComponent={
          isResultsState && results.loadingMore ? (
            <View style={[styles.padded, styles.footer]}>
              <ListingCardSkeleton />
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
  header: {
    gap: space.lg,
    marginBottom: space.lg,
  },
  padded: {
    paddingHorizontal: space.screen,
  },
  title: {
    ...type.h1,
    color: colors.ink,
    marginBottom: space.lg,
  },
  section: {
    gap: space.lg,
    marginTop: space.lg,
  },
  sectionTitle: {
    ...type.section,
    color: colors.ink,
  },
  list: {
    gap: space.lg,
  },
  separator: {
    height: space.lg,
  },
  footer: {
    marginTop: space.lg,
  },
})
