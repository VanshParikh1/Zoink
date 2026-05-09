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
  Platform,
  Image,
} from 'react-native'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { theme } from '../theme/colors'
import SearchBar from '../components/SearchBar'
import { Listing } from '../types'
import { browseListings, getNearbyListings } from '../services/listingsApi'

type Nav = NativeStackNavigationProp<RootStackParamList>

const SCREEN_WIDTH = Dimensions.get('window').width
const CATEGORIES = ['All', 'Electronics', 'Tools', 'Sports', 'Outdoors', 'Audio/Video', 'Cameras', 'Clothing', 'Books', 'Other']

// Global in-memory cache for recently viewed items across the session
let sessionRecentlyViewed: Listing[] = []

function MiniProfile({ owner }: { owner: Listing['owner'] }) {
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

function GlassCardVertical({ item, onPress }: { item: Listing; onPress: () => void }) {
  const imageUrl = item.images?.[0]?.url
  return (
    <TouchableOpacity style={styles.glassCardVertical} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.glassThumbnailLarge}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
        ) : (
          <Text style={styles.glassThumbnailEmojiLarge}>{item.category?.[0] || '📦'}</Text>
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
  )
}

function GlassCardHorizontal({ item, onPress }: { item: Listing; onPress: () => void }) {
  const imageUrl = item.images?.[0]?.url
  return (
    <TouchableOpacity style={styles.glassCardHorizontal} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.glassThumbnailSmall}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
        ) : (
          <Text style={styles.glassThumbnailEmojiSmall}>{item.category?.[0] || '📦'}</Text>
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
  )
}

export default function SearchScreen() {
  const nav = useNavigation<Nav>()
  const [query, setQuery] = useState('')
  const [isResultsState, setIsResultsState] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')

  const [trending, setTrending] = useState<Listing[]>([])
  const [recent, setRecent] = useState<Listing[]>([])
  const [results, setResults] = useState<Listing[]>([])

  const fadeAnim = useRef(new Animated.Value(1)).current
  const translateAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Location.getCurrentPositionAsync({}).then(loc => {
      const { latitude, longitude } = loc.coords
      getNearbyListings({ lat: latitude, lng: longitude, radius: 50 })
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

  const handleListingPress = (item: Listing) => {
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
    <View style={{ flex: 1 }}>
      <FlatList
        data={isResultsState ? results : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeaderComponent}
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
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 56,
    paddingBottom: 12,
    zIndex: 10,
  },
  headerInner: {
    paddingHorizontal: 0,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '500',
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
  sectionHeader: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '300',
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
  
  /* --- Glass Cards --- */
  glassCardVertical: {
    width: (SCREEN_WIDTH - 48) * 0.75,
    backgroundColor: theme.surfaceSubdued,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    borderTopColor: theme.border,
    borderBottomColor: theme.borderBottom,
    overflow: 'hidden',
    padding: 16,
    shadowColor: theme.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  glassThumbnailLarge: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  glassThumbnailEmojiLarge: {
    fontSize: 48,
  },
  availabilityBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeAvailable: {
    backgroundColor: theme.primarySurface,
    borderColor: theme.borderFocus,
  },
  badgeUnavailable: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderColor: theme.border,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
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
    fontWeight: '500',
  },
  glassCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  glassPrice: {
    color: theme.primary,
    fontSize: 18,
    fontWeight: '600',
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

  /* --- Horizontal Glass Cards --- */
  verticalRowsContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  glassCardHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: theme.surfaceSubdued,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    borderTopColor: theme.border,
    borderBottomColor: theme.borderBottom,
    shadowColor: theme.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  glassThumbnailSmall: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  glassThumbnailEmojiSmall: {
    fontSize: 28,
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
    borderRadius: 12,
    borderWidth: 1,
  },
  glassChipSelected: {
    backgroundColor: theme.primarySurface,
    borderColor: theme.borderFocus,
    borderTopColor: 'rgba(22, 255, 110, 0.4)',
  },
  glassChipUnselected: {
    backgroundColor: theme.surfaceSubdued,
    borderColor: theme.border,
    borderTopColor: theme.border,
    borderBottomColor: theme.borderBottom,
  },
  chipTextSelected: {
    color: theme.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  chipTextUnselected: {
    color: theme.textMuted,
    fontWeight: '400',
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
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

