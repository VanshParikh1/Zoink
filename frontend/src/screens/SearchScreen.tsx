import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { theme } from '../theme/colors'
import SearchBar from '../components/SearchBar'
import StateCard from '../components/StateCard'
import ScreenBackground from '../components/ScreenBackground'
import { ListingBrowseItem } from '../types'
import { browseListings, getNearbyListings } from '../services/listingsApi'

type Nav = NativeStackNavigationProp<RootStackParamList>

const SCREEN_WIDTH = Dimensions.get('window').width
const CATEGORIES = ['All', 'Electronics', 'Tools', 'Sports', 'Outdoors', 'Audio/Video', 'Cameras', 'Clothing', 'Books', 'Other']

// Global in-memory cache for recently viewed items across the session
let sessionRecentlyViewed: ListingBrowseItem[] = []

function MiniProfile({ owner }: { owner: ListingBrowseItem['owner'] }) {
  const name = `${owner.firstName} ${owner.lastName}`
  const initials = `${owner.firstName?.[0] || ''}${owner.lastName?.[0] || ''}`.toUpperCase()
  return (
    <View style={styles.miniProfile}>
      <View style={styles.miniAvatar}>
        <Text style={styles.miniAvatarText}>{initials}</Text>
      </View>
      <Text style={styles.miniName}>
        {name}
        {owner.verificationStatus === 'VERIFIED' ? (
          <Text style={styles.verifiedTick}> {"\u2713"}</Text>
        ) : null}
      </Text>
      <Text style={styles.miniRating}>{"\u2605"} {((owner as any).rating || 5.0).toFixed(1)}</Text>
    </View>
  )
}

function GlassCardVertical({ item, onPress }: { item: ListingBrowseItem; onPress: () => void }) {
  const imageUrl = item.images?.[0]?.url
  return (
    <View style={styles.glassCardVerticalWrap}>
    <TouchableOpacity style={styles.glassCardVertical} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.glassThumbnailLarge}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
        ) : (
          <Text style={styles.glassThumbnailFallbackText}>{item.category || '📦'}</Text>
        )}
        <View style={[styles.availabilityBadge, item.isAvailable ? styles.badgeAvailable : styles.badgeUnavailable]}>
          <Text style={[styles.badgeText, item.isAvailable ? styles.badgeTextAvailable : styles.badgeTextUnavailable]}>
            {item.isAvailable ? 'Available' : 'Paused'}
          </Text>
        </View>
      </View>
      
      <View style={styles.glassCardBody}>
        <Text style={styles.glassTitle} numberOfLines={1}>{item.title}</Text>
        <MiniProfile owner={item.owner} />
        
        <View style={styles.glassCardFooter}>
          <Text style={styles.glassPrice}>${Number(item.dailyPrice).toFixed(0)} <Text style={styles.glassPriceUnit}>/ day</Text></Text>
          <Text style={styles.glassDistance}>{(item.distanceKm || 0).toFixed(1)} km</Text>
        </View>
      </View>
    </TouchableOpacity>
    </View>
  )
}

function GlassCardHorizontal({ item, onPress }: { item: ListingBrowseItem; onPress: () => void }) {
  const imageUrl = item.images?.[0]?.url
  return (
    <View style={styles.glassCardHorizontalWrap}>
    <TouchableOpacity style={styles.glassCardHorizontal} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.glassThumbnailSmall}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
        ) : (
          <Text style={styles.glassThumbnailFallbackTextSmall}>{item.category || '📦'}</Text>
        )}
      </View>
      
      <View style={styles.glassRowMiddle}>
        <Text style={styles.glassTitle} numberOfLines={1}>{item.title}</Text>
        <MiniProfile owner={item.owner} />
      </View>
      
      <View style={styles.glassRowRight}>
        <Text style={styles.glassPrice}>${Number(item.dailyPrice).toFixed(0)}</Text>
        <Text style={styles.glassDistance}>{(item.distanceKm || 0).toFixed(1)} km</Text>
      </View>
    </TouchableOpacity>
    </View>
  )
}

export default function SearchScreen() {
  const nav = useNavigation<Nav>()
  const [query, setQuery] = useState('')
  const [isResultsState, setIsResultsState] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')

  const [trending, setTrending] = useState<ListingBrowseItem[]>([])
  const [recent, setRecent] = useState<ListingBrowseItem[]>([])
  const [results, setResults] = useState<ListingBrowseItem[]>([])

  const fadeAnim = useRef(new Animated.Value(1)).current
  const translateAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
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
  }, [])

  useFocusEffect(
    useCallback(() => {
      setRecent([...sessionRecentlyViewed])
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
      const timer = setTimeout(() => {
        Location.getLastKnownPositionAsync().then(loc => {
           browseListings({
             query: query.trim() || undefined,
             category: selectedCategory === 'All' ? undefined : selectedCategory,
             lat: loc?.coords?.latitude,
             lng: loc?.coords?.longitude,
             // See trending-fetch comment above — don't let distance silently filter out results.
             radius: 5000,
           }).then(res => setResults(res.items)).catch(console.error)
        }).catch(() => {
           browseListings({
             query: query.trim() || undefined,
             category: selectedCategory === 'All' ? undefined : selectedCategory,
           }).then(res => setResults(res.items)).catch(console.error)
        })
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setResults([])
    }
  }, [query, selectedCategory, isResultsState, fadeAnim, translateAnim])

  const handleListingPress = (item: ListingBrowseItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    Keyboard.dismiss()

    // Add to top of recently viewed cache
    sessionRecentlyViewed = sessionRecentlyViewed.filter(i => i.id !== item.id)
    sessionRecentlyViewed.unshift(item)
    if (sessionRecentlyViewed.length > 10) sessionRecentlyViewed.pop()
    
    setRecent([...sessionRecentlyViewed])
    
    nav.navigate('ListingDetail', { listingId: item.id })
  }

  const renderCategoryChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chipsContainer}
      keyboardShouldPersistTaps="handled"
    >
      {CATEGORIES.map((cat) => {
        const isSelected = selectedCategory === cat
        return (
          <TouchableOpacity
            key={cat}
            activeOpacity={0.75}
            style={[styles.glassChip, isSelected ? styles.glassChipSelected : styles.glassChipUnselected]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
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
  )

  const renderHeaderComponent = () => (
    <View>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Text style={styles.headerTitle}>Discover</Text>
          <SearchBar value={query} onChange={setQuery} />
        </View>
      </View>

      {renderCategoryChips()}

      {!isResultsState && (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}>
          {trending.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>TRENDING NEAR YOU</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
                snapToInterval={(SCREEN_WIDTH - 48) * 0.75 + 16}
                decelerationRate="fast"
              >
                {trending.map((item) => (
                  <GlassCardVertical key={item.id} item={item} onPress={() => handleListingPress(item)} />
                ))}
              </ScrollView>
            </>
          )}

          {recent.length > 0 && (
            <>
              <Text style={[styles.sectionHeader, { marginTop: 32 }]}>RECENTLY VIEWED</Text>
              <View style={styles.verticalRowsContainer}>
                {recent.map((item) => (
                  <GlassCardHorizontal key={item.id} item={item} onPress={() => handleListingPress(item)} />
                ))}
              </View>
            </>
          )}
        </Animated.View>
      )}
    </View>
  )

  return (
    <ScreenBackground>
      <FlatList
        data={isResultsState ? results : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeaderComponent}
        ListEmptyComponent={
          isResultsState ? (
            <View style={styles.emptyStateWrap}>
              <StateCard
                eyebrow="NO MATCHES"
                title="Nothing found"
                body={selectedCategory !== 'All' ? `No ${selectedCategory.toLowerCase()} listings match this search yet.` : 'Try a different search term or category.'}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}>
            <GlassCardHorizontal item={item} onPress={() => handleListingPress(item)} />
          </Animated.View>
        )}
        contentContainerStyle={styles.idleContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingTop: theme.header.tabTop,
    paddingBottom: 12,
    zIndex: 10,
  },
  headerInner: {
    paddingHorizontal: 0,
  },
  headerTitle: {
    ...theme.type.screenTitle,
    paddingHorizontal: 24,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  contentArea: {
    flex: 1,
  },
  idleContent: {
    paddingTop: 16,
    paddingBottom: 120,
  },
  emptyStateWrap: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  sectionHeader: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    paddingHorizontal: 24,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  horizontalScrollContent: {
    paddingHorizontal: 24,
    gap: 16,
  },
  separator: {
    height: 1,
    backgroundColor: theme.border,
    marginHorizontal: 24,
    marginVertical: 4,
  },
  
  /* --- Listing cards (neobrutalist, matches Home) --- */
  glassCardVerticalWrap: {
    width: (SCREEN_WIDTH - 48) * 0.75,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
  },
  glassCardVertical: {
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    overflow: 'hidden',
    padding: 16,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  glassThumbnailLarge: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  glassThumbnailFallbackText: {
    color: theme.primary,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  availabilityBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: theme.hard.borderThin,
  },
  badgeAvailable: {
    backgroundColor: theme.primarySurface,
    borderColor: theme.hard.ink,
  },
  badgeUnavailable: {
    backgroundColor: theme.surfaceSubdued,
    borderColor: theme.hard.ink,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  badgeTextAvailable: {
    color: theme.primary,
  },
  badgeTextUnavailable: {
    color: theme.textDisabled,
  },
  glassCardBody: {
    flex: 1,
    gap: 8,
  },
  glassTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  glassCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  glassPrice: {
    color: theme.primaryDeep,
    fontSize: 18,
    fontWeight: '900',
  },
  glassPriceUnit: {
    color: theme.textDisabled,
    fontSize: 12,
    fontWeight: '300',
  },
  glassDistance: {
    color: theme.textDisabled,
    fontSize: 13,
    fontWeight: '300',
  },

  /* --- Horizontal listing cards (neobrutalist, matches Home) --- */
  verticalRowsContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  glassCardHorizontalWrap: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
  },
  glassCardHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  glassThumbnailSmall: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  glassThumbnailFallbackTextSmall: {
    color: theme.primary,
    fontWeight: '900',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  glassRowMiddle: {
    flex: 1,
    gap: 4,
  },
  glassRowRight: {
    paddingLeft: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },

  /* --- Chips --- */
  chipsScroll: {
    flexGrow: 0,
    marginBottom: 20,
    marginTop: 8,
  },
  chipsContainer: {
    paddingHorizontal: 24,
    gap: 8,
    flexDirection: 'row',
  },
  glassChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  glassChipSelected: {
    backgroundColor: theme.primary,
  },
  glassChipUnselected: {
    backgroundColor: theme.surface,
  },
  chipTextSelected: {
    color: theme.textOnPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  chipTextUnselected: {
    color: theme.text,
    fontWeight: '700',
    fontSize: 14,
  },

  /* --- Mini Profile --- */
  miniProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.hard.ink,
  },
  miniAvatarText: {
    color: theme.text,
    fontSize: 9,
    fontWeight: '600',
  },
  miniName: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
  verifiedTick: {
    color: theme.primary,
    fontWeight: '600',
  },
  miniRating: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '600',
  },

  resultsContainer: {
    flex: 1,
  },
  resultsListContent: {
    paddingHorizontal: 24,
    gap: 12,
    paddingBottom: 120,
    paddingTop: 16,
  },
})

