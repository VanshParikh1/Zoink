import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import Badge from '../components/mockup/Badge'
import LogoPill from '../components/mockup/LogoPill'

type Nav = NativeStackNavigationProp<RootStackParamList, 'VerificationGate'>

export default function VerificationGateScreen() {
  const navigation = useNavigation<Nav>()
  const { user, logout } = useAuth()

  return (
    <Screen
      glow="topLeft"
      footer={
        <View style={styles.footer}>
          <Button label="Enter verification code" onPress={() => navigation.navigate('VerifyEmail')} />
          <Button label="Sign out" variant="link" onPress={logout} style={styles.signOut} />
        </View>
      }
    >
      <View style={styles.content}>
        <LogoPill size="lg" />
        <Badge label="ONE QUICK STEP" variant="lime" />
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.body}>
          We need to confirm your university email before you can start renting on Zoink.
        </Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.xxl,
    paddingTop: space.sm,
  },
  title: {
    ...type.h1,
    color: colors.ink,
  },
  body: {
    ...type.body,
    color: colors.mutedAlt,
  },
  email: {
    ...type.body,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  footer: {
    gap: space.xs,
  },
  signOut: {
    alignSelf: 'center',
  },
})
