import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  Animated,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics'
import { RouteProp, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import HomeScreen from './HomeScreen'
import InboxScreen from './InboxScreen'
import MyProfileScreen from './MyProfileScreen'
import SearchScreen from './SearchScreen'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'

type MainTab = 'Home' | 'Search' | 'Inbox' | 'MyProfile'

const TAB_ORDER: MainTab[] = ['Home', 'Search', 'Inbox', 'MyProfile']
const CENTER_SLOT_WIDTH = 72
const BAR_HORIZONTAL_PADDING = 14

type ScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>
}

type MainAppRoute = RouteProp<RootStackParamList, 'MainApp'>

const TAB_ICONS: Record<MainTab, keyof typeof Feather.glyphMap> = {
  Home: 'home',
  Search: 'search',
  Inbox: 'mail',
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
}: {
  active: boolean
  tab: MainTab
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
      <Feather
        name={TAB_ICONS[tab]}
        size={20}
        color={active ? theme.primary : 'rgba(255, 255, 255, 0.55)'}
      />
      <Text style={[styles.navLabel, active ? styles.navLabelActive : styles.navLabelInactive]}>
        {TAB_LABELS[tab]}
      </Text>
    </TouchableOpacity>
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

  const tabWidth = bottomBarWidth
    ? (bottomBarWidth - CENTER_SLOT_WIDTH - BAR_HORIZONTAL_PADDING * 2) / 4
    : 0

  const tabHighlightX = scrollX.interpolate({
    inputRange: contentWidth > 0 ? [0, contentWidth, contentWidth * 2, contentWidth * 3] : [0, 1, 2, 3],
    outputRange: [
      0,
      tabWidth,
      tabWidth * 2 + CENTER_SLOT_WIDTH,
      tabWidth * 3 + CENTER_SLOT_WIDTH,
    ],
    extrapolate: 'clamp',
  })

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

      <View style={styles.centerSlot} />

      <NavItem active={activeTab === 'Inbox'} tab="Inbox" onPress={() => transitionToTab('Inbox')} />
      <NavItem active={activeTab === 'MyProfile'} tab="MyProfile" onPress={() => transitionToTab('MyProfile')} />
    </View>
  )

  return (
    <ScreenBackground>
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
              <InboxScreen />
            </View>
            <View style={[styles.tabPanel, { width: contentWidth }]}>
              <MyProfileScreen />
            </View>
          </Animated.ScrollView>
        )}
      </View>

      <View style={[styles.bottomWrap, { bottom: insets.bottom + 16 }]}>
        <View style={styles.tabShadowWrapper}>
          <BlurView intensity={75} style={styles.blurWrapper} tint="dark">
            {renderBottomBarContent()}
          </BlurView>
        </View>

        <TouchableOpacity 
          style={styles.createButton} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { })
            navigation.navigate('CreateListing')
          }} 
          activeOpacity={0.9}
        >
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
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
    left: 16,
    right: 16,
    backgroundColor: 'transparent',
  },
  tabShadowWrapper: {
    borderRadius: 32,
    shadowColor: theme.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  blurWrapper: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(15, 255, 80, 0.12)',
    overflow: 'hidden',
  },
  bottomBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BAR_HORIZONTAL_PADDING,
  },
  activeTabHighlight: {
    position: 'absolute',
    left: BAR_HORIZONTAL_PADDING,
    top: 6,
    bottom: 6,
    borderRadius: 14,
    backgroundColor: theme.primarySurface,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  navLabelActive: {
    color: theme.primary,
  },
  navLabelInactive: {
    color: 'rgba(255, 255, 255, 0.55)',
  },
  centerSlot: {
    width: CENTER_SLOT_WIDTH,
  },
  createButton: {
    position: 'absolute',
    alignSelf: 'center',
    top: -24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  createButtonText: {
    color: '#050A05',
    fontSize: 32,
    fontWeight: '400',
    lineHeight: 34,
    marginTop: -2,
  },
})
