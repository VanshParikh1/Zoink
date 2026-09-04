import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import ZoinkFullLogo from '../components/ZoinkFullLogo'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'

type Nav = NativeStackNavigationProp<RootStackParamList, 'VerificationGate'>

export default function VerificationGateScreen() {
  const navigation = useNavigation<Nav>()
  const { user, logout } = useAuth()

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <ZoinkFullLogo width={160} height={50} style={styles.logo} />
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
      </View>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  logo: { marginBottom: 20 },
  kicker: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: { ...theme.type.screenTitle, marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 15, color: theme.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 14 },
  email: { fontSize: 14, fontWeight: '800', color: theme.primary, marginBottom: 28 },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  buttonText: { color: theme.textOnPrimary, fontSize: 15, fontWeight: '900' },
  link: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
})

