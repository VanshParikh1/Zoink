import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Animated, FlatList, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
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
import { ListingBrowseItem } from '../types'
import { browseListings, getNearbyListings } from '../services/listingsApi'
import { useTabLoad } from '../context/MainTabContext'
import { isBlockedThisSession } from '../services/blockedUsers'
import Screen from '../components/mockup/Screen'
import TextField from '../components/mockup/TextField'
import CategoryChips from '../components/mockup/CategoryChips'
import ListingCard, { ListingCardSkeleton } from '../components/mockup/ListingCard'
import StatePanel from '../components/mockup/StatePanel'

type Nav = NativeStackNavigationProp<RootStackParamList>
type MainAppRoute = RouteProp<RootStackParamList, 'MainApp'>

const CATEGORIES = ['All', ...LISTING_CATEGORIES]
const SKELETON_COUNT = 3

// Global in-memory cache for recently viewed items across the session
let sessionRecentlyViewed: ListingBrowseItem[] = []

export default function SearchScreen() {
  const tabBarClearance = useTabBarClearance()
  const nav = useNavigation<Nav>()
  const route = useRoute<MainAppRoute>()
  const [query, setQuery] = useState('')
  const [isResultsState, setIsResultsState] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')

  const [trending, setTrending] = useState<ListingBrowseItem[]>([])
  const [recent, setRecent] = useState<ListingBrowseItem[]>([])
  const [results, setResults] = useState<ListingBrowseItem[]>([])
  // True from the moment a search is scheduled until its results land, so the
  // list shows skeletons instead of flashing "Nothing found" in between.
  const [searching, setSearching] = useState(false)

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
  // Still loaded once per mount, as before.
  const trendingRequested = useRef(false)
  useTabLoad('Search', useCallback(() => {
    if (trendingRequested.current) return
    trendingRequested.current = true
    Location.getCurrentPositionAsync({}).then(loc => {
      const { latitude, longitude } = loc.coords
      // Large radius: seeded/demo listings are frequently far from wherever the
      // device actually is, so a "realistic" nearby radius silently hides everything.
      // Matches HomeScreen's DEFAULT_RADIUS_KM.
      getNearbyListings({ lat: latitude, lng: longitude, radius: 5000 })
        .then(res => {
          setTrending(res.slice(0, 5))
        }).catch(console.error)
    }).catch(() => {
      browseListings({}).then(res => {
        setTrending(res.items.slice(0, 5))
      }).catch(console.error)
    })
  }, []))

  useFocusEffect(
    useCallback(() => {
      // Drop anything from a user blocked since these were cached.
      const visible = (item: ListingBrowseItem) => !isBlockedThisSession(item.ownerId)
      sessionRecentlyViewed = sessionRecentlyViewed.filter(visible)
      setRecent([...sessionRecentlyViewed])
      setTrending((current) => current.filter(visible))
      setResults((current) => current.filter(visible))
    }, [])
  )

  useEffect(() => {
    const hasText = query.trim().length > 0 || selectedCategory !== 'All'

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

    if (hasText) {
      setSearching(true)
      const done = () => setSearching(false)
      const timer = setTimeout(() => {
        Location.getLastKnownPositionAsync().then(loc => {
          browseListings({
            query: query.trim() || undefined,
            category: selectedCategory === 'All' ? undefined : selectedCategory,
            lat: loc?.coords?.latitude,
            lng: loc?.coords?.longitude,
            // See trending-fetch comment above — don't let distance silently filter out results.
            radius: 5000,
          }).then(res => setResults(res.items)).catch(console.error).finally(done)
        }).catch(() => {
          browseListings({
            query: query.trim() || undefined,
            category: selectedCategory === 'All' ? undefined : selectedCategory,
          }).then(res => setResults(res.items)).catch(console.error).finally(done)
        })
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setSearching(false)
      setResults([])
    }
  }, [query, selectedCategory, isResultsState, fadeAnim, translateAnim])

  const handleListingPress = (item: ListingBrowseItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
    Keyboard.dismiss()

    // Add to top of recently viewed cache
    sessionRecentlyViewed = sessionRecentlyViewed.filter(i => i.id !== item.id)
    sessionRecentlyViewed.unshift(item)
    if (sessionRecentlyViewed.length > 10) sessionRecentlyViewed.pop()

    setRecent([...sessionRecentlyViewed])

    nav.navigate('ListingDetail', { listingId: item.id })
  }

  const renderSection = (title: string, items: ListingBrowseItem[]) => (
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
          onFocus={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}
          leftIcon={<Feather name="search" size={18} color={colors.mutedAlt} />}
          rightAccessory={
            query.length > 0 ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
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
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
          setSelectedCategory(cat)
        }}
      />

      {!isResultsState && (
        <Animated.View style={[styles.padded, { opacity: fadeAnim, transform: [{ translateY: translateAnim }] }]}>
          {trending.length > 0 ? renderSection('Trending near you', trending) : null}
          {recent.length > 0 ? renderSection('Recently viewed', recent) : null}
        </Animated.View>
      )}
    </View>
  )

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <FlatList
        data={isResultsState && !searching ? results : []}
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
              ) : (
                <StatePanel
                  title="Nothing found"
                  body={selectedCategory !== 'All' ? `No ${selectedCategory.toLowerCase()} listings match this search yet.` : 'Try a different search term or category.'}
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
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
})
