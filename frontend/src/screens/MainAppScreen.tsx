import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import * as Haptics from 'expo-haptics'
import { RouteProp, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import HomeScreen from './HomeScreen'
import InboxScreen from './InboxScreen'
import MyProfileScreen from './MyProfileScreen'
import SearchScreen from './SearchScreen'
import { theme } from '../theme/colors'

type MainTab = 'Home' | 'Search' | 'Inbox' | 'MyProfile'

const TAB_ORDER: MainTab[] = ['Home', 'Search', 'Inbox', 'MyProfile']
const CENTER_SLOT_WIDTH = 72
const BAR_HORIZONTAL_PADDING = 14

type ScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>
}

type MainAppRoute = RouteProp<RootStackParamList, 'MainApp'>

function getTabOffset(index: number, tabWidth: number) {
  return index < 2 ? index * tabWidth : index * tabWidth + CENTER_SLOT_WIDTH
}

function NavItem({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean
  icon: string
  label: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={[styles.navItem, active && styles.navItemActive]} onPress={onPress}>
      <Text style={[styles.navIcon, active ? styles.navIconActive : styles.navIconInactive]}>{icon}</Text>
      <Text style={[styles.navLabel, active ? styles.navLabelActive : styles.navLabelInactive]}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function MainAppScreen({ navigation }: ScreenProps) {
  const route = useRoute<MainAppRoute>()
  const [activeTab, setActiveTab] = useState<MainTab>(route.params?.tab ?? 'Home')
  const [contentWidth, setContentWidth] = useState(0)
  const [bottomBarWidth, setBottomBarWidth] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const scrollViewRef = useRef<ScrollView>(null)

  const activeIndex = TAB_ORDER.indexOf(activeTab)
  const tabWidth = bottomBarWidth
    ? (bottomBarWidth - CENTER_SLOT_WIDTH - BAR_HORIZONTAL_PADDING * 2) / 4
    : 0

  // Map scroll position directly to the bottom bar highlight
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

  // Sync scroll position on initial load
  useEffect(() => {
    if (contentWidth > 0 && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: activeIndex * contentWidth,
        animated: false,
      })
    }
  }, [contentWidth]) // Only run once when contentWidth is first determined

  // Handle route params
  useEffect(() => {
    if (route.params?.tab) {
      transitionToTab(route.params.tab)
      navigation.setParams({ tab: undefined })
    }
  }, [route.params?.tab, navigation])

  const transitionToTab = useCallback((nextTab: MainTab) => {
    if (nextTab === activeTab) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    
    setActiveTab(nextTab)
    const nextIndex = TAB_ORDER.indexOf(nextTab)
    
    if (contentWidth > 0 && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: nextIndex * contentWidth,
        animated: true,
      })
    }
  }, [activeTab, contentWidth])

  const handleScrollEnd = (e: any) => {
    if (!contentWidth) return
    const offsetX = e.nativeEvent.contentOffset.x
    const newIndex = Math.round(offsetX / contentWidth)
    
    if (newIndex >= 0 && newIndex < TAB_ORDER.length) {
      const nextTab = TAB_ORDER[newIndex]
      if (nextTab !== activeTab) {
        setActiveTab(nextTab)
      }
    }
  }

  const handleBottomBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    if (nextWidth !== bottomBarWidth) {
      setBottomBarWidth(nextWidth)
    }
  }, [bottomBarWidth])

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
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
              showsHorizontalScrollIndicator={false}
              directionalLockEnabled={true}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
              scrollEventThrottle={16}
              onMomentumScrollEnd={handleScrollEnd}
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

        <View style={styles.bottomWrap}>
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

            <NavItem active={activeTab === 'Home'} icon="⌂" label="Home" onPress={() => transitionToTab('Home')} />
            <NavItem active={activeTab === 'Search'} icon="⌕" label="Search" onPress={() => transitionToTab('Search')} />

            <View style={styles.centerSlot} />

            <NavItem active={activeTab === 'Inbox'} icon="✉︎" label="Inbox" onPress={() => transitionToTab('Inbox')} />
            <NavItem active={activeTab === 'MyProfile'} icon="◉" label="Profile" onPress={() => transitionToTab('MyProfile')} />
          </View>

          <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('CreateListing')}>
            <Text style={styles.createButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
    paddingHorizontal: 16,
    paddingBottom: 24,
    backgroundColor: 'transparent',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBar: {
    height: 72,
    backgroundColor: theme.surface,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(22,255,110,0.10)',
    borderRadius: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BAR_HORIZONTAL_PADDING,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  activeTabHighlight: {
    position: 'absolute',
    left: BAR_HORIZONTAL_PADDING,
    top: 10,
    bottom: 10,
    borderRadius: 26,
    backgroundColor: theme.surfaceSoft,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    borderRadius: 18,
  },
  navItemActive: {},
  navIcon: {
    fontSize: 20,
    fontWeight: '900',
  },
  navIconActive: {
    color: theme.primary,
  },
  navIconInactive: {
    color: theme.textFaint,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  navLabelActive: {
    color: theme.primary,
  },
  navLabelInactive: {
    color: theme.textFaint,
  },
  centerSlot: {
    width: CENTER_SLOT_WIDTH,
  },
  createButton: {
    position: 'absolute',
    alignSelf: 'center',
    top: -18,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: theme.screen,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  createButtonText: {
    color: theme.primaryText,
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 34,
    marginTop: -2,
  },
})
