import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

const SCREEN_WIDTH = Dimensions.get('window').width
const CATEGORIES = ['All', 'Tech', 'Tools', 'Rides', 'Clothes', 'Music']

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
  { id: 't1', title: 'Sony A7III Camera', category: '📷', distanceKm: 1.2, dailyPrice: 45, isAvailable: true, owner: { id: 'o1', name: 'Alex M.', rating: 4.8, verified: true } },
  { id: 't2', title: 'Makita Power Drill', category: '🛠️', distanceKm: 3.4, dailyPrice: 15, isAvailable: false, owner: { id: 'o2', name: 'Sam K.', rating: 4.9, verified: false } },
  { id: 't3', title: 'DJI Mavic Mini', category: '🚁', distanceKm: 0.8, dailyPrice: 30, isAvailable: true, owner: { id: 'o3', name: 'Jordan P.', rating: 5.0, verified: true } },
]

const MOCK_RECENT: MockListing[] = [
  { id: 'r1', title: 'JBL PartyBox 310', category: '🎵', distanceKm: 2.1, dailyPrice: 25, isAvailable: true, owner: { id: 'o4', name: 'Casey R.', rating: 4.7, verified: true } },
  { id: 'r2', title: 'North Face Tent', category: '🏕️', distanceKm: 5.5, dailyPrice: 20, isAvailable: true, owner: { id: 'o5', name: 'Taylor W.', rating: 4.6, verified: false } },
]

const MOCK_RESULTS: MockListing[] = [
  { id: 's1', title: 'Sony A7III Camera', category: '📷', distanceKm: 1.2, dailyPrice: 45, isAvailable: true, owner: { id: 'o1', name: 'Alex M.', rating: 4.8, verified: true } },
  { id: 's2', title: 'Canon EOS R5', category: '📷', distanceKm: 2.8, dailyPrice: 65, isAvailable: true, owner: { id: 'o6', name: 'Morgan L.', rating: 4.9, verified: true } },
  { id: 's3', title: 'Vintage Film Camera', category: '📷', distanceKm: 4.1, dailyPrice: 18, isAvailable: false, owner: { id: 'o7', name: 'Drew T.', rating: 4.5, verified: false } },
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
          <Text style={styles.verifiedTick}> ✓</Text>
        ) : null}
      </Text>
      <Text style={styles.miniRating}>★ {owner.rating.toFixed(1)}</Text>
    </View>
  )
}

function ListRow({ item, onPress }: { item: MockListing; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.listRow} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.rowThumbnail}>
        <Text style={styles.rowThumbnailEmoji}>{item.category}</Text>
      </View>
      <View style={styles.rowMiddle}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <MiniProfile owner={item.owner} />
        <Text style={styles.rowDistance}>{item.distanceKm.toFixed(1)} km away</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowPrice}>${item.dailyPrice.toFixed(0)} / day</Text>
        <View style={[styles.availabilityDot, item.isAvailable ? styles.dotAvailable : styles.dotUnavailable]} />
      </View>
    </TouchableOpacity>
  )
}

function HorizontalRow({ item, onPress }: { item: MockListing; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.horizontalRow} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.horizontalThumbnail}>
        <Text style={styles.rowThumbnailEmoji}>{item.category}</Text>
      </View>
      <View style={styles.horizontalMiddle}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <MiniProfile owner={item.owner} />
        <Text style={styles.rowDistance}>{item.distanceKm.toFixed(1)} km away</Text>
      </View>
      <View style={styles.horizontalRight}>
        <Text style={styles.rowPrice}>${item.dailyPrice.toFixed(0)} / day</Text>
        <View style={[styles.availabilityDot, item.isAvailable ? styles.dotAvailable : styles.dotUnavailable]} />
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
        duration: 100,
        useNativeDriver: true,
      }).start(() => {
        setIsResultsState(hasText)
        translateAnim.setValue(20)
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          })
        ]).start()
      })
    }
  }, [query, isResultsState, fadeAnim, translateAnim])

  const handleListingPress = (item: MockListing) => {
    Keyboard.dismiss()
    nav.navigate('ListingDetail', { listingId: item.id })
  }

  const renderIdleState = () => (
    <Animated.ScrollView
      style={{ opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}
      contentContainerStyle={styles.idleContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionHeader}>TRENDING NEAR YOU</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScrollContent}
        snapToInterval={(SCREEN_WIDTH - 32) * 0.85 + 12}
        decelerationRate="fast"
      >
        {MOCK_TRENDING.map((item) => (
          <HorizontalRow key={item.id} item={item} onPress={() => handleListingPress(item)} />
        ))}
      </ScrollView>

      <Text style={[styles.sectionHeader, { marginTop: 32 }]}>RECENTLY VIEWED</Text>
      <View style={styles.verticalRowsContainer}>
        {MOCK_RECENT.map((item) => (
          <HorizontalRow key={item.id} item={item} onPress={() => handleListingPress(item)} />
        ))}
      </View>
    </Animated.ScrollView>
  )

  const renderResultsState = () => (
    <Animated.View style={[styles.resultsContainer, { opacity: fadeAnim, transform: [{ translateY: translateAnim }] }]}>
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

      <FlatList
        data={MOCK_RESULTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ListRow item={item} onPress={() => handleListingPress(item)} />}
        contentContainerStyle={styles.resultsListContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </Animated.View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search items, tools, rides..."
          placeholderTextColor={theme.textFaint}
          style={styles.searchInput}
          autoFocus={false}
          autoCorrect={false}
        />
      </View>

      <View style={styles.contentArea}>
        {isResultsState ? renderResultsState() : renderIdleState()}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.screen,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: theme.screen,
    zIndex: 10,
  },
  searchInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 16,
  },
  contentArea: {
    flex: 1,
  },
  idleContent: {
    paddingTop: 8,
    paddingBottom: 120,
  },
  sectionHeader: {
    color: theme.textFaint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  horizontalScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  horizontalRow: {
    width: (SCREEN_WIDTH - 32) * 0.85,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  horizontalThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  horizontalMiddle: {
    flex: 1,
    gap: 4,
  },
  horizontalRight: {
    paddingLeft: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  verticalRowsContainer: {
    paddingHorizontal: 16,
  },
  resultsContainer: {
    flex: 1,
  },
  chipsScroll: {
    flexGrow: 0,
    marginBottom: 16,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
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
  resultsListContent: {
    paddingBottom: 120,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    backgroundColor: theme.screen,
  },
  rowThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowThumbnailEmoji: {
    fontSize: 24,
  },
  rowMiddle: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  rowDistance: {
    color: theme.textFaint,
    fontSize: 12,
  },
  rowRight: {
    paddingLeft: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  rowPrice: {
    color: theme.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotAvailable: {
    backgroundColor: theme.primary,
  },
  dotUnavailable: {
    backgroundColor: theme.textFaint,
  },
  miniProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: {
    color: theme.primary,
    fontSize: 9,
    fontWeight: '700',
  },
  miniName: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  verifiedTick: {
    color: theme.primary,
    fontWeight: '700',
  },
  miniRating: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '700',
  },
})
