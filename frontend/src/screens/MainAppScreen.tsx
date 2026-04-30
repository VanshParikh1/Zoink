import React from 'react'
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
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
const TAB_TRANSITION_MS = 520
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
      <Text style={styles.navIcon}>{icon}</Text>
      <Text style={styles.navLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function MainAppScreen({ navigation }: ScreenProps) {
  const route = useRoute<MainAppRoute>()
  const [activeTab, setActiveTab] = React.useState<MainTab>(route.params?.tab ?? 'Home')
  const [contentWidth, setContentWidth] = React.useState(0)
  const [bottomBarWidth, setBottomBarWidth] = React.useState(0)
  const translateX = React.useRef(new Animated.Value(0)).current
  const tabHighlightX = React.useRef(new Animated.Value(0)).current
  const isTransitioningRef = React.useRef(false)
  const activeIndex = TAB_ORDER.indexOf(activeTab)
  const tabWidth = bottomBarWidth
    ? (bottomBarWidth - CENTER_SLOT_WIDTH - BAR_HORIZONTAL_PADDING * 2) / 4
    : 0

  const transitionToTab = React.useCallback((nextTab: MainTab) => {
    if (nextTab === activeTab || isTransitioningRef.current) {
      setActiveTab(nextTab)
      return
    }

    if (!contentWidth) {
      setActiveTab(nextTab)
      return
    }

    const nextIndex = TAB_ORDER.indexOf(nextTab)
    const animations = [
      Animated.timing(translateX, {
        toValue: -(nextIndex * contentWidth),
        duration: TAB_TRANSITION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]

    if (tabWidth > 0) {
      animations.push(
        Animated.timing(tabHighlightX, {
          toValue: getTabOffset(nextIndex, tabWidth),
          duration: TAB_TRANSITION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    }

    isTransitioningRef.current = true
    setActiveTab(nextTab)

    Animated.parallel(animations).start(() => {
      isTransitioningRef.current = false
    })
  }, [activeTab, contentWidth, tabHighlightX, tabWidth, translateX])

  React.useEffect(() => {
    if (route.params?.tab) {
      transitionToTab(route.params.tab)
    }
  }, [route.params?.tab, transitionToTab])

  React.useEffect(() => {
    if (!contentWidth) return
    translateX.setValue(-(activeIndex * contentWidth))
  }, [contentWidth, translateX])

  React.useEffect(() => {
    if (!tabWidth) return
    tabHighlightX.setValue(getTabOffset(activeIndex, tabWidth))
  }, [tabHighlightX, tabWidth])

  const handleBottomBarLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    if (nextWidth !== bottomBarWidth) {
      setBottomBarWidth(nextWidth)
    }
  }, [bottomBarWidth])

  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        style={styles.content}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width
          if (nextWidth !== contentWidth) {
            setContentWidth(nextWidth)
          }
        }}
      >
        <Animated.View
          style={[
            styles.tabStrip,
            {
              width: contentWidth ? contentWidth * TAB_ORDER.length : '100%',
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={[styles.tabPanel, { width: contentWidth || '100%' }]}>
            <HomeScreen />
          </View>
          <View style={[styles.tabPanel, { width: contentWidth || '100%' }]}>
            <SearchScreen />
          </View>
          <View style={[styles.tabPanel, { width: contentWidth || '100%' }]}>
            <InboxScreen />
          </View>
          <View style={[styles.tabPanel, { width: contentWidth || '100%' }]}>
            <MyProfileScreen />
          </View>
        </Animated.View>
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

          <NavItem active={activeTab === 'Inbox'} icon="✉︎" label="Messages" onPress={() => transitionToTab('Inbox')} />
          <NavItem active={activeTab === 'MyProfile'} icon="◉" label="Profile" onPress={() => transitionToTab('MyProfile')} />
        </View>

        <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('CreateListing')}>
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.screen,
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
    position: 'relative',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: theme.screen,
  },
  bottomBar: {
    height: 78,
    backgroundColor: theme.colors.inkBlack,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: BAR_HORIZONTAL_PADDING,
    overflow: 'hidden',
  },
  activeTabHighlight: {
    position: 'absolute',
    left: BAR_HORIZONTAL_PADDING,
    top: 12,
    bottom: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    color: theme.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  navLabel: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  centerSlot: {
    width: CENTER_SLOT_WIDTH,
  },
  createButton: {
    position: 'absolute',
    alignSelf: 'center',
    top: -22,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: theme.screen,
  },
  createButtonText: {
    color: theme.primaryText,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 34,
    marginTop: -1,
  },
})
