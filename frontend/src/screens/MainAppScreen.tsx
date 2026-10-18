import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics'
import { RouteProp, useIsFocused, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import HomeScreen from './HomeScreen'
import InboxScreen from './InboxScreen'
import MyProfileScreen from './MyProfileScreen'
import SearchScreen from './SearchScreen'
import { colors } from '../theme/colors'
import { border, radius } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import HardShadow from '../components/mockup/HardShadow'
import Badge from '../components/mockup/Badge'
import {
  TAB_BAR_GAP,
  TAB_BAR_PADDING,
  TAB_BAR_SHADOW,
  TAB_FAB_OVERFLOW,
  TAB_FAB_SIZE,
  TAB_ITEM_MIN_HEIGHT,
} from '../components/mockup/tabBarMetrics'
import { InboxFeedProvider, useConversationsFeed } from '../context/InboxContext'
import { MainTab, MainTabProvider } from '../context/MainTabContext'
import { markStartup } from '../utils/perfMarks'

const TAB_ORDER: MainTab[] = ['Home', 'Search', 'Inbox', 'MyProfile']
// Five equal columns: Home, Search, the "+" slot, Inbox, Profile.
const COLUMNS = 5
const BAR_MARGIN = 14

type ScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>
}

type MainAppRoute = RouteProp<RootStackParamList, 'MainApp'>

const TAB_ICONS: Record<MainTab, keyof typeof Feather.glyphMap> = {
  Home: 'home',
  Search: 'search',
  Inbox: 'message-square',
  MyProfile: 'user',
}

const TAB_LABELS: Record<MainTab, string> = {
  Home: 'Home',
  Search: 'Search',
  Inbox: 'Inbox',
  MyProfile: 'Profile',
}

function NavItem({
  active,
  tab,
  onPress,
  unreadCount = 0,
}: {
  active: boolean
  tab: MainTab
  onPress: () => void
  unreadCount?: number
}) {
  const color = active ? colors.ink : colors.onInk
  return (
    <Pressable
      style={styles.navItem}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={unreadCount > 0 ? `${TAB_LABELS[tab]}, ${unreadCount} unread` : TAB_LABELS[tab]}
    >
      <View>
        <Feather name={TAB_ICONS[tab]} size={20} color={color} />
        {unreadCount > 0 ? (
          <Badge label={unreadCount > 9 ? '9+' : String(unreadCount)} variant="lime" style={styles.navBadge} />
        ) : null}
      </View>
      <Text style={[styles.navLabel, { color, fontFamily: active ? fonts.black : fonts.bold }]} numberOfLines={1}>
        {TAB_LABELS[tab]}
      </Text>
    </Pressable>
  )
}

export default function MainAppScreen({ navigation }: ScreenProps) {
  const route = useRoute<MainAppRoute>()
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<MainTab>(route.params?.tab ?? 'Home')
  const [contentWidth, setContentWidth] = useState(0)
  const [bottomBarWidth, setBottomBarWidth] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const scrollViewRef = useRef<ScrollView>(null)
  // Track the last haptic-fired index to avoid double-fires
  const lastHapticIndex = useRef(TAB_ORDER.indexOf(route.params?.tab ?? 'Home'))

  // One conversations feed for the Inbox tab's list and the green dot on its
  // icon. MainAppScreen stays mounted behind pushed screens, so it refetches
  // when focus returns (e.g. ConversationThread pops back) and polls only while
  // this screen is focused and the app is in the foreground.
  const inboxFeed = useConversationsFeed(useIsFocused())
  const unreadInboxCount = inboxFeed.conversations.filter((conversation) => conversation.unread).length

  const tabWidth = bottomBarWidth ? (bottomBarWidth - TAB_BAR_PADDING * 2) / COLUMNS : 0

  // Column index per tab: the "+" takes column 2, so Inbox and Profile skip it.
  const tabHighlightX = scrollX.interpolate({
    inputRange: contentWidth > 0 ? [0, contentWidth, contentWidth * 2, contentWidth * 3] : [0, 1, 2, 3],
    outputRange: [0, tabWidth, tabWidth * 3, tabWidth * 4],
    extrapolate: 'clamp',
  })

  useEffect(() => {
    markStartup('main-app')
  }, [])

  useEffect(() => {
    if (contentWidth > 0 && scrollViewRef.current) {
      const idx = TAB_ORDER.indexOf(activeTab)
      scrollViewRef.current.scrollTo({
        x: idx * contentWidth,
        animated: false,
      })
    }
  }, [contentWidth])

  useEffect(() => {
    if (route.params?.tab) {
      transitionToTab(route.params.tab)
      navigation.setParams({ tab: undefined })
    }
  }, [route.params?.tab, navigation])

  const transitionToTab = useCallback((nextTab: MainTab) => {
    if (nextTab === activeTab) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })

    const nextIndex = TAB_ORDER.indexOf(nextTab)
    lastHapticIndex.current = nextIndex

    if (contentWidth > 0 && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: nextIndex * contentWidth,
        animated: true,
      })
    }
  }, [activeTab, contentWidth])

  // Runs on every scroll frame (via the native-driven Animated.event listener),
  // so it must stay cheap: no setState here — that would re-render MainAppScreen
  // plus all 4 NavItems ~60x/sec mid-drag, fighting the 4 mounted tab screens
  // for the JS thread. Just fire the crossing haptic; the visual ring tracks
  // scrollX natively already, and the logical activeTab commits on settle.
  const handleScroll = useCallback((e: any) => {
    if (!contentWidth) return
    const offsetX = e.nativeEvent.contentOffset.x
    const currentIndex = Math.round(offsetX / contentWidth)

    if (
      currentIndex >= 0 &&
      currentIndex < TAB_ORDER.length &&
      lastHapticIndex.current !== currentIndex
    ) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
      lastHapticIndex.current = currentIndex
    }
  }, [contentWidth])

  // Commits the logical active tab once the scroll actually settles, instead
  // of on every frame — cheap, single re-render per swipe.
  const commitSettledTab = useCallback((e: any) => {
    if (!contentWidth) return
    const offsetX = e.nativeEvent.contentOffset.x
    const settledIndex = Math.round(offsetX / contentWidth)
    const nextTab = TAB_ORDER[settledIndex]
    if (nextTab && nextTab !== activeTab) {
      setActiveTab(nextTab)
    }
  }, [contentWidth, activeTab])

  const handleBottomBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    if (nextWidth !== bottomBarWidth) {
      setBottomBarWidth(nextWidth)
    }
  }, [bottomBarWidth])

  const renderBottomBarContent = () => (
    <View style={styles.bottomBar} onLayout={handleBottomBarLayout}>
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeTabHighlight,
            {
              width: tabWidth,
              transform: [{ translateX: tabHighlightX }],
            },
          ]}
        />
      ) : null}

      <NavItem active={activeTab === 'Home'} tab="Home" onPress={() => transitionToTab('Home')} />
      <NavItem active={activeTab === 'Search'} tab="Search" onPress={() => transitionToTab('Search')} />

      <View style={styles.navItem} />

      <NavItem active={activeTab === 'Inbox'} tab="Inbox" onPress={() => transitionToTab('Inbox')} unreadCount={unreadInboxCount} />
      <NavItem active={activeTab === 'MyProfile'} tab="MyProfile" onPress={() => transitionToTab('MyProfile')} />
    </View>
  )

  return (
    <View style={styles.screen}>
      <View
        style={styles.content}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width
          if (nextWidth !== contentWidth && nextWidth > 0) {
            setContentWidth(nextWidth)
          }
        }}
      >
        {contentWidth > 0 && (
          <MainTabProvider value={activeTab}>
            <Animated.ScrollView
              ref={scrollViewRef as any}
              horizontal
              pagingEnabled
              decelerationRate="fast"
              overScrollMode="never"
              showsHorizontalScrollIndicator={false}
              directionalLockEnabled={true}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                {
                  useNativeDriver: true,
                  listener: handleScroll,
                }
              )}
              onMomentumScrollEnd={commitSettledTab}
              onScrollEndDrag={commitSettledTab}
              scrollEventThrottle={16}
              style={styles.tabStrip}
            >
              <View style={[styles.tabPanel, { width: contentWidth }]}>
                <HomeScreen />
              </View>
              <View style={[styles.tabPanel, { width: contentWidth }]}>
                <SearchScreen />
              </View>
              <View style={[styles.tabPanel, { width: contentWidth }]}>
                <InboxFeedProvider value={inboxFeed}>
                  <InboxScreen />
                </InboxFeedProvider>
              </View>
              <View style={[styles.tabPanel, { width: contentWidth }]}>
                <MyProfileScreen />
              </View>
            </Animated.ScrollView>
          </MainTabProvider>
        )}
      </View>

      {/*
        The wrapper's top padding makes room for the raised "+", so the button
        sits inside its parent's bounds. Android only delivers touches inside a
        view's bounds, so a "+" hanging outside the bar wouldn't be tappable
        there.
      */}
      <View style={[styles.bottomWrap, { bottom: insets.bottom + TAB_BAR_GAP }]} pointerEvents="box-none">
        <HardShadow offset={TAB_BAR_SHADOW} color={colors.green} radius={radius.pill}>
          {renderBottomBarContent()}
        </HardShadow>

        <View style={styles.fabSlot} pointerEvents="box-none">
          <HardShadow
            pressable
            offset={TAB_BAR_SHADOW}
            radius={TAB_FAB_SIZE / 2}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { })
              navigation.navigate('CreateListing')
            }}
            accessibilityRole="button"
            accessibilityLabel="List an item"
            // Balances the shadow's right padding so the circle itself is centred.
            style={{ marginLeft: TAB_BAR_SHADOW }}
          >
            <View style={styles.fab}>
              <Feather name="plus" size={28} color={colors.ink} />
            </View>
          </HardShadow>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Each tab paints its own mockup Screen; this only shows during the first layout.
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  tabPanel: {
    flex: 1,
  },
  tabStrip: {
    flex: 1,
    flexDirection: 'row',
  },
  bottomWrap: {
    position: 'absolute',
    left: BAR_MARGIN,
    right: BAR_MARGIN,
    paddingTop: TAB_FAB_OVERFLOW,
  },
  bottomBar: {
    minHeight: TAB_ITEM_MIN_HEIGHT + TAB_BAR_PADDING * 2,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: TAB_BAR_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  activeTabHighlight: {
    position: 'absolute',
    left: TAB_BAR_PADDING,
    top: TAB_BAR_PADDING,
    bottom: TAB_BAR_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
  },
  navItem: {
    flex: 1,
    minHeight: TAB_ITEM_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navBadge: {
    position: 'absolute',
    top: -9,
    left: 12,
    paddingHorizontal: 5,
    paddingVertical: 0,
  },
  navLabel: {
    ...type.tab,
  },
  fabSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    // The bar's own hard shadow pads its right edge, so centre the "+" on the
    // bar itself, not on the wrapper.
    right: TAB_BAR_SHADOW,
    alignItems: 'center',
  },
  fab: {
    width: TAB_FAB_SIZE,
    height: TAB_FAB_SIZE,
    borderRadius: TAB_FAB_SIZE / 2,
    backgroundColor: colors.green,
    borderWidth: border.thick,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
