import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import LogoPlaceholder from '../components/LogoPlaceholder'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList, 'VerificationGate'>

export default function VerificationGateScreen() {
  const navigation = useNavigation<Nav>()
  const { user, logout } = useAuth()

  return (
    <ScreenBackground>
      <LogoPlaceholder size="large" style={styles.logo} />
      <Text style={styles.kicker}>one quick step</Text>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>
        We need to confirm your university email before you can start renting on Zoink.
      </Text>
      <Text style={styles.email}>{user?.email}</Text>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('VerifyEmail')}>
        <Text style={styles.buttonText}>Enter verification code</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={logout}>
        <Text style={styles.link}>Sign out</Text>
      </TouchableOpacity>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logo: { marginBottom: 26 },
  kicker: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: { fontSize: 30, fontWeight: '900', color: theme.text, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, color: theme.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  email: { fontSize: 15, fontWeight: '800', color: theme.primary, marginBottom: 32 },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  buttonText: { color: theme.primaryText, fontSize: 16, fontWeight: '900' },
  link: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
})
