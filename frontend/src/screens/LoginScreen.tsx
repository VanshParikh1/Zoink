import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import { AuthIntro, LegalCaption, UniversitiesCard } from '../components/mockup/AuthEntry'
import { markStartup } from '../utils/perfMarks'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>

export default function LoginScreen() {
  useEffect(() => {
    markStartup('login')
  }, [])
  const navigation = useNavigation<Nav>()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    if (!email || !password) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen
      glow="topLeft"
      keyboardAvoiding
      footer={
        <View style={styles.footer}>
          <Button label="Sign in" onPress={handleLogin} loading={loading} />
          <Text style={styles.switchText} onPress={() => navigation.navigate('Register')} accessibilityRole="link">
            Don't have an account? <Text style={styles.switchLink}>Sign up</Text>
          </Text>
          <LegalCaption
            onTerms={() => navigation.navigate('TermsAcceptance', { mode: 'view', initialTab: 'terms' })}
            onPrivacy={() => navigation.navigate('TermsAcceptance', { mode: 'view', initialTab: 'privacy' })}
          />
        </View>
      }
    >
      <View style={styles.content}>
        <AuthIntro />

        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextField
            label="Student email"
            placeholder="University email"
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <TextField
            label="Password"
            placeholder="Password"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <UniversitiesCard />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.screen,
    paddingTop: space.sm,
  },
  form: {
    gap: space.lg,
  },
  error: {
    ...type.labelSm,
    color: colors.danger,
  },
  footer: {
    gap: space.md,
  },
  switchText: {
    ...type.bodySm,
    color: colors.mutedAlt,
    textAlign: 'center',
  },
  switchLink: {
    fontFamily: fonts.bold,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
})
