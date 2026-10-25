import React from 'react'
import { StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import StatePanel from '../components/mockup/StatePanel'

type Nav = NativeStackNavigationProp<RootStackParamList>

/** Where a zoink:// link that doesn't match anything in the app lands (navigation/deepLinks.ts). */
export default function LinkNotFoundScreen() {
  const nav = useNavigation<Nav>()
  return (
    <Screen scroll={false} header={<ScreenHeader title="Link not found" back />} contentStyle={styles.content}>
      <StatePanel
        title="This link doesn't go anywhere."
        body="It may be mistyped or from an older version of Zoink. You can find listings, rentals and messages from Home."
        action={{ label: 'Go to Home', onPress: () => nav.navigate('MainApp', { tab: 'Home' }), variant: 'primary' }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
  },
})
