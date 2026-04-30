import React from 'react'
import {
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

type ScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>
}

type MainAppRoute = RouteProp<RootStackParamList, 'MainApp'>

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

  React.useEffect(() => {
    if (route.params?.tab) {
      setActiveTab(route.params.tab)
    }
  }, [route.params?.tab])

  let content: React.ReactNode
  switch (activeTab) {
    case 'Search':
      content = <SearchScreen />
      break
    case 'Inbox':
      content = <InboxScreen />
      break
    case 'MyProfile':
      content = <MyProfileScreen />
      break
    default:
      content = <HomeScreen />
      break
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>{content}</View>

      <View style={styles.bottomWrap}>
        <View style={styles.bottomBar}>
          <NavItem active={activeTab === 'Home'} icon="⌂" label="Home" onPress={() => setActiveTab('Home')} />
          <NavItem active={activeTab === 'Search'} icon="⌕" label="Search" onPress={() => setActiveTab('Search')} />

          <View style={styles.centerSlot} />

          <NavItem active={activeTab === 'Inbox'} icon="✉" label="Messages" onPress={() => setActiveTab('Inbox')} />
          <NavItem active={activeTab === 'MyProfile'} icon="◉" label="Profile" onPress={() => setActiveTab('MyProfile')} />
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
    paddingHorizontal: 14,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    borderRadius: 18,
  },
  navItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
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
    width: 72,
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
