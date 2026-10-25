import React, { useCallback, useState } from 'react'
import { FlatList, LayoutChangeEvent, Platform, RefreshControl, StyleSheet, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootStackParamList } from '../navigation'
import type { MyListingItem } from '@zoink/shared'
import { getMyListingsPage } from '../services/listingsApi'
import { queryKeys } from '../services/queryKeys'
import { usePagedList } from '../hooks/usePagedList'
import { userMessage } from '../utils/userMessage'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import IconButton from '../components/mockup/IconButton'
import ListingGridCard from '../components/mockup/ListingGridCard'
import StatePanel from '../components/mockup/StatePanel'
import { BadgeVariant } from '../components/mockup/Badge'
import { prefetchListingHero } from '../utils/cloudinaryImage'

type Nav = NativeStackNavigationProp<RootStackParamList>

// Same grid as Home: two equal columns sized from the list's measured width.
const GRID_COLUMNS = 2
const COLUMN_GAP = space.lg
const ROW_GAP = space.xl
const SKELETON_COUNT = 4

function statusBadge(listing: MyListingItem): { label: string; variant: BadgeVariant } {
  if (listing.activeBookingId) return { label: 'Rented out', variant: 'green' }
  return listing.isAvailable ? { label: 'Active', variant: 'lime' } : { label: 'Paused', variant: 'surface' }
}

export default function MyListingsScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const [listWidth, setListWidth] = useState(0)
  const cellWidth = listWidth ? Math.floor((listWidth - COLUMN_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS) : 0

  // Each listing arrives with the booking it's rented out on, if any, so this
  // screen no longer loads the owner's whole booking list.
  const feed = usePagedList<MyListingItem>(queryKeys.myListings, getMyListingsPage)
  const { items: listings, loading, refreshing } = feed
  const error = feed.error ? userMessage(feed.error, { action: 'Could not load your listings right now.' }) : ''
  const onRefresh = feed.refresh

  const openListing = useCallback(
    (listing: MyListingItem) => {
      if (listing.activeBookingId) return nav.navigate('ActiveRental', { bookingId: listing.activeBookingId })
      prefetchListingHero(listing.images[0]?.url)
      nav.navigate('ListingDetail', { listingId: listing.id })
    },
    [nav]
  )
  const renderItem = useCallback(
    ({ item }: { item: MyListingItem }) =>
      cellWidth > 0 ? <GridCell listing={item} width={cellWidth} onOpen={openListing} /> : null,
    [cellWidth, openListing]
  )

  return (
    <Screen
      scroll={false}
      contentStyle={styles.screenContent}
      header={
        <ScreenHeader
          title="My listings"
          back
          right={
            <IconButton accessibilityLabel="List an item" onPress={() => nav.navigate('CreateListing')}>
              <Feather name="plus" size={22} color={colors.ink} />
            </IconButton>
          }
        />
      }
    >
      <FlatList
        data={loading && !refreshing ? [] : listings}
        keyExtractor={keyExtractor}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        onLayout={(e: LayoutChangeEvent) => setListWidth(e.nativeEvent.layout.width)}
        renderItem={renderItem}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={1}
        ListFooterComponent={
          feed.loadingMore && cellWidth > 0 ? (
            <View style={[styles.skeletonGrid, styles.footerRow]}>
              {Array.from({ length: GRID_COLUMNS }, (_, i) => <ListingGridCard.Skeleton key={i} width={cellWidth} />)}
            </View>
          ) : null
        }
        ItemSeparatorComponent={Separator}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenText} colors={[colors.green]} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonGrid}>
              {cellWidth > 0
                ? Array.from({ length: SKELETON_COUNT }, (_, i) => <ListingGridCard.Skeleton key={i} width={cellWidth} />)
                : null}
            </View>
          ) : error ? (
            <StatePanel
              title="Your listings couldn't load"
              body={error}
              action={{ label: 'Try again', onPress: () => feed.retry(), variant: 'primary' }}
            />
          ) : (
            <StatePanel
              title="You have not listed anything yet."
              body="Post your first item to start getting requests from nearby students."
              action={{ label: 'List an item', onPress: () => nav.navigate('CreateListing'), variant: 'primary' }}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

function keyExtractor(item: MyListingItem) {
  return item.id
}

/** One grid card; re-renders only when its listing or width changes. */
const GridCell = React.memo(function GridCell({
  listing,
  width,
  onOpen,
}: {
  listing: MyListingItem
  width: number
  onOpen: (listing: MyListingItem) => void
}) {
  return <ListingGridCard listing={listing} width={width} badge={statusBadge(listing)} onPress={() => onOpen(listing)} />
})

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 0 },
  gridRow: { gap: COLUMN_GAP },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: COLUMN_GAP, rowGap: ROW_GAP },
  footerRow: { marginTop: ROW_GAP },
  separator: { height: ROW_GAP },
})
