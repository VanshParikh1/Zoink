import React, { useEffect, useRef, useState } from 'react'
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
} from 'react-native'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { theme } from '../theme/colors'
import SearchBar from '../components/SearchBar'

type Nav = NativeStackNavigationProp<RootStackParamList>

const SCREEN_WIDTH = Dimensions.get('window').width
const CATEGORIES = ['All', 'Electronics', 'Tools', 'Sports', 'Outdoors', 'Audio/Video', 'Cameras', 'Clothing', 'Books', 'Other']

type MockOwner = {
  id: string
  name: string
  rating: number
  verified: boolean
}

type MockListing = {
  id: string
  title: string
  category: string
  distanceKm: number
  dailyPrice: number
  isAvailable: boolean
  owner: MockOwner
}

const MOCK_TRENDING: MockListing[] = [
  { id: 't1', title: 'Sony A7III Camera', category: '\u{1F4F7}', distanceKm: 1.2, dailyPrice: 45, isAvailable: true, owner: { id: 'o1', name: 'Alex M.', rating: 4.8, verified: true } },
  { id: 't2', title: 'Makita Power Drill', category: '\u{1F6E0}', distanceKm: 3.4, dailyPrice: 15, isAvailable: false, owner: { id: 'o2', name: 'Sam K.', rating: 4.9, verified: false } },
  { id: 't3', title: 'DJI Mavic Mini', category: '\u{1F681}', distanceKm: 0.8, dailyPrice: 30, isAvailable: true, owner: { id: 'o3', name: 'Jordan P.', rating: 5.0, verified: true } },
]

const MOCK_RECENT: MockListing[] = [
  { id: 'r1', title: 'JBL PartyBox 310', category: '\u{1F3B5}', distanceKm: 2.1, dailyPrice: 25, isAvailable: true, owner: { id: 'o4', name: 'Casey R.', rating: 4.7, verified: true } },
  { id: 'r2', title: 'North Face Tent', category: '\u{26FA}', distanceKm: 5.5, dailyPrice: 20, isAvailable: true, owner: { id: 'o5', name: 'Taylor W.', rating: 4.6, verified: false } },
]

const MOCK_RESULTS: MockListing[] = [
  { id: 's1', title: 'Sony A7III Camera', category: '\u{1F4F7}', distanceKm: 1.2, dailyPrice: 45, isAvailable: true, owner: { id: 'o1', name: 'Alex M.', rating: 4.8, verified: true } },
  { id: 's2', title: 'Canon EOS R5', category: '\u{1F4F7}', distanceKm: 2.8, dailyPrice: 65, isAvailable: true, owner: { id: 'o6', name: 'Morgan L.', rating: 4.9, verified: true } },
  { id: 's3', title: 'Vintage Film Camera', category: '\u{1F4F7}', distanceKm: 4.1, dailyPrice: 18, isAvailable: false, owner: { id: 'o7', name: 'Drew T.', rating: 4.5, verified: false } },
]

function MiniProfile({ owner }: { owner: MockOwner }) {
  const initials = owner.name.split(' ').map(n => n[0]).join('').toUpperCase()
  return (
    <View style={styles.miniProfile}>
      <View style={styles.miniAvatar}>
        <Text style={styles.miniAvatarText}>{initials}</Text>
      </View>
      <Text style={styles.miniName}>
        {owner.name}
        {owner.verified ? (
          <Text style={styles.verifiedTick}> {"\u2713"}</Text>
        ) : null}
      </Text>
      <Text style={styles.miniRating}>{"\u2605"} {owner.rating.toFixed(1)}</Text>
    </View>
  )
}

function GlassCardVertical({ item, onPress }: { item: MockListing; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.glassCardVertical} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.glassThumbnailLarge}>
        <Text style={styles.glassThumbnailEmojiLarge}>{item.category}</Text>
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
          <Text style={styles.glassPrice}>${item.dailyPrice.toFixed(0)} <Text style={styles.glassPriceUnit}>/ day</Text></Text>
          <Text style={styles.glassDistance}>{item.distanceKm.toFixed(1)} km</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function GlassCardHorizontal({ item, onPress }: { item: MockListing; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.glassCardHorizontal} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.glassThumbnailSmall}>
        <Text style={styles.glassThumbnailEmojiSmall}>{item.category}</Text>
      </View>
      
      <View style={styles.glassRowMiddle}>
        <Text style={styles.glassTitle} numberOfLines={1}>{item.title}</Text>
        <MiniProfile owner={item.owner} />
      </View>
      
      <View style={styles.glassRowRight}>
        <Text style={styles.glassPrice}>${item.dailyPrice.toFixed(0)}</Text>
        <Text style={styles.glassDistance}>{item.distanceKm.toFixed(1)} km</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function SearchScreen() {
  const nav = useNavigation<Nav>()
  const [query, setQuery] = useState('')
  const [isResultsState, setIsResultsState] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')

  const fadeAnim = useRef(new Animated.Value(1)).current
  const translateAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const hasText = query.trim().length > 0
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
  }, [query, isResultsState, fadeAnim, translateAnim])

  const handleListingPress = (item: MockListing) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    Keyboard.dismiss()
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
          <Text style={styles.sectionHeader}>TRENDING NEAR YOU</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollContent}
            snapToInterval={(SCREEN_WIDTH - 48) * 0.75 + 16}
            decelerationRate="fast"
          >
            {MOCK_TRENDING.map((item) => (
              <GlassCardVertical key={item.id} item={item} onPress={() => handleListingPress(item)} />
            ))}
          </ScrollView>

          <Text style={[styles.sectionHeader, { marginTop: 32 }]}>RECENTLY VIEWED</Text>
          <View style={styles.verticalRowsContainer}>
            {MOCK_RECENT.map((item) => (
              <GlassCardHorizontal key={item.id} item={item} onPress={() => handleListingPress(item)} />
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={isResultsState ? MOCK_RESULTS : []}
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

