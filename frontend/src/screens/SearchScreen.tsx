import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Location from 'expo-location'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { browseListings, getListingCategories } from '../services/listingsApi'
import { Listing } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type SortOption = 'nearest' | 'priceLow' | 'priceHigh' | 'newest'

const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const DEFAULT_RADIUS_KM = 25

function sortListings(items: Listing[], sortBy: SortOption) {
  const next = [...items]

  switch (sortBy) {
    case 'priceLow':
      return next.sort((a, b) => a.dailyPrice - b.dailyPrice)
    case 'priceHigh':
      return next.sort((a, b) => b.dailyPrice - a.dailyPrice)
    case 'newest':
      return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    default:
      return next.sort((a, b) => (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER))
  }
}

export default function SearchScreen() {
  const nav = useNavigation<Nav>()
  const [listings, setListings] = useState<Listing[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [coords, setCoords] = useState(DEFAULT_COORDS)
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('nearest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const loadCategories = useCallback(async () => {
    const nextCategories = await getListingCategories()
    setCategories(nextCategories)
  }, [])

  const loadListings = useCallback(async () => {
    try {
      setError('')
      const result = await browseListings({
        query: query.trim() || undefined,
        category: selectedCategory || undefined,
        minPrice: minPrice.trim() ? Number(minPrice) : undefined,
        maxPrice: maxPrice.trim() ? Number(maxPrice) : undefined,
        lat: coords.latitude,
        lng: coords.longitude,
        radius: DEFAULT_RADIUS_KM,
      })
      setListings(sortListings(result.items, sortBy))
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load filtered listings right now.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [coords.latitude, coords.longitude, maxPrice, minPrice, query, selectedCategory, sortBy])

  useEffect(() => {
    async function setup() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (permission.status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          setCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        }
      } catch {
        // Use default fallback coords silently.
      } finally {
        loadCategories().catch(() => undefined)
      }
    }

    setup()
  }, [loadCategories])

  useEffect(() => {
    loadListings()
  }, [loadListings])

  const activeFilterCount =
    (selectedCategory ? 1 : 0) +
    (minPrice.trim() ? 1 : 0) +
    (maxPrice.trim() ? 1 : 0)

  const sortLabel =
    sortBy === 'nearest'
      ? 'Nearest'
      : sortBy === 'priceLow'
        ? 'Price: Low to high'
        : sortBy === 'priceHigh'
          ? 'Price: High to low'
          : 'Newest'

  const renderListing = ({ item }: { item: Listing }) => {
    const imageUrl = item.images[0]?.url

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => nav.navigate('ListingDetail', { listingId: item.id })}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.imageFallback]}>
            <Text style={styles.imageFallbackText}>{item.category}</Text>
          </View>
        )}

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardMeta} numberOfLines={2}>{item.description}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardPrice}>${Number(item.dailyPrice).toFixed(2)} / day</Text>
            <Text style={styles.cardDistance}>
              {typeof item.distanceKm === 'number' ? `${item.distanceKm.toFixed(1)} km away` : item.city}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={renderListing}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadListings()
            }}
            tintColor={theme.primary}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>SEARCH</Text>
              <Text style={styles.title}>Find the right rental fast</Text>
              <Text style={styles.subtitle}>
                Search by item, open a filter menu when you need precision, and sort the marketplace your way.
              </Text>
            </View>

            <View style={styles.searchBarShell}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={loadListings}
                placeholder="Search cameras, tools, speakers..."
                placeholderTextColor={theme.textFaint}
                style={styles.searchInput}
              />
              <TouchableOpacity style={styles.searchAction} onPress={loadListings}>
                <Text style={styles.searchActionText}>Go</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toolbar}>
              <TouchableOpacity style={styles.toolButton} onPress={() => setFiltersOpen(true)}>
                <Text style={styles.toolIcon}>⫶</Text>
                <Text style={styles.toolText}>Filters</Text>
                {activeFilterCount > 0 ? (
                  <View style={styles.toolCount}>
                    <Text style={styles.toolCountText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolButton} onPress={() => setSortOpen(true)}>
                <Text style={styles.toolIcon}>↕</Text>
                <Text style={styles.toolText}>Sort</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                {selectedCategory || 'All categories'}
                {minPrice.trim() || maxPrice.trim() ? ` • $${minPrice.trim() || '0'}-$${maxPrice.trim() || 'any'}` : ''}
              </Text>
              <Text style={styles.summaryText}>{sortLabel}</Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No matches yet</Text>
              <Text style={styles.emptyText}>
                Try widening the price range or clearing the category to see more nearby listings.
              </Text>
            </View>
          )
        }
      />

      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>Filters</Text>
                <Text style={styles.modalMeta}>Narrow by category and price range.</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setFiltersOpen(false)}>
                <Text style={styles.closeButtonText}>X</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Categories</Text>
            <View style={styles.categoryWrap}>
              <TouchableOpacity
                style={[styles.chip, !selectedCategory && styles.chipActive]}
                onPress={() => setSelectedCategory('')}
              >
                <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {categories.map((category) => {
                const active = selectedCategory === category
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setSelectedCategory(active ? '' : category)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{category}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.sectionLabel}>Price range</Text>
            <View style={styles.priceRow}>
              <TextInput
                value={minPrice}
                onChangeText={setMinPrice}
                placeholder="Min $"
                placeholderTextColor={theme.textFaint}
                keyboardType="numeric"
                style={[styles.input, styles.priceInput]}
              />
              <TextInput
                value={maxPrice}
                onChangeText={setMaxPrice}
                placeholder="Max $"
                placeholderTextColor={theme.textFaint}
                keyboardType="numeric"
                style={[styles.input, styles.priceInput]}
              />
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setSelectedCategory('')
                  setMinPrice('')
                  setMaxPrice('')
                }}
              >
                <Text style={styles.secondaryButtonText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  setFiltersOpen(false)
                  loadListings()
                }}
              >
                <Text style={styles.primaryButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>Sort</Text>
                <Text style={styles.modalMeta}>Choose how results should be ordered.</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setSortOpen(false)}>
                <Text style={styles.closeButtonText}>X</Text>
              </TouchableOpacity>
            </View>

            {[
              { key: 'nearest', label: 'Nearest' },
              { key: 'priceLow', label: 'Price: Low to high' },
              { key: 'priceHigh', label: 'Price: High to low' },
              { key: 'newest', label: 'Newest' },
            ].map((option) => {
              const active = sortBy === option.key
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.sortOption, active && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy(option.key as SortOption)
                    setSortOpen(false)
                  }}
                >
                  <Text style={[styles.sortOptionText, active && styles.sortOptionTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.screen },
  listContent: { paddingHorizontal: 18, paddingTop: 56, paddingBottom: 28 },
  hero: {
    backgroundColor: theme.surface,
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.border,
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  title: { color: theme.text, fontSize: 29, fontWeight: '900', lineHeight: 34 },
  subtitle: { color: theme.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  searchBarShell: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 15,
  },
  searchAction: {
    minWidth: 60,
    backgroundColor: theme.colors.inkBlack,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  searchActionText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  toolButton: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  toolIcon: {
    color: theme.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  toolText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  toolCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  toolCountText: {
    color: theme.primaryText,
    fontSize: 11,
    fontWeight: '900',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  summaryText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  input: {
    backgroundColor: theme.screen,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.text,
    fontSize: 15,
    marginBottom: 12,
  },
  priceRow: { flexDirection: 'row', gap: 10 },
  priceInput: { flex: 1 },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.screen,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: {
    backgroundColor: theme.colors.inkBlack,
    borderColor: theme.colors.inkBlack,
  },
  chipText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  chipTextActive: {
    color: theme.primary,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: theme.primaryText, fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    paddingHorizontal: 18,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { color: theme.text, fontSize: 14, fontWeight: '800' },
  errorText: { marginTop: 12, color: theme.colors.danger, fontSize: 13, marginBottom: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 15, 15, 0.36)',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  modalHeaderCopy: {
    flex: 1,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
  },
  modalMeta: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.screen,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '900',
  },
  sectionLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },
  sortOption: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: theme.screen,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  sortOptionActive: {
    backgroundColor: theme.colors.inkBlack,
    borderColor: theme.colors.inkBlack,
  },
  sortOptionText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  sortOptionTextActive: {
    color: theme.primary,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardImage: { width: '100%', height: 180, backgroundColor: theme.surfaceSoft },
  imageFallback: { justifyContent: 'center', alignItems: 'center' },
  imageFallbackText: { color: theme.primary, fontWeight: '900', fontSize: 17 },
  cardBody: { padding: 16 },
  cardTitle: { color: theme.text, fontSize: 18, fontWeight: '900', marginBottom: 8 },
  cardMeta: { color: theme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardPrice: { color: theme.primary, fontSize: 15, fontWeight: '900' },
  cardDistance: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '900', marginBottom: 8 },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
})
