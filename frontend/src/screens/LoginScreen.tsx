import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import ZoinkFullLogo from '../components/ZoinkFullLogo'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>

export default function LoginScreen() {
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
    <DismissKeyboardView>
      <ScreenBackground>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.inner}>

            {/* Header & Logo */}
            <ZoinkFullLogo width={325} height={325} style={{ ...styles.logo, marginBottom: -110, marginTop: -180 }} />
            <Text style={{ ...styles.kicker, marginBottom: 120 }}>Accessibility over Ownership</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in and find useful gear nearby.</Text>

            {/* Form */}
            <View style={styles.form}>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TextInput
                style={styles.input}
                placeholder="University email"
                placeholderTextColor={theme.textDisabled}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={theme.textDisabled}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {/* Tactile stamped button */}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.75}
              >
                {loading
                  ? <ActivityIndicator color={theme.textOnPrimary} />
                  : <Text style={styles.buttonText}>Sign in</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
                <Text style={styles.link}>
                  Don't have an account?{' '}
                  <Text style={styles.linkBold}>Sign up</Text>
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </ScreenBackground>
    </DismissKeyboardView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,

    // tighter vertical spacing
    paddingTop: 10,
    paddingBottom: 10,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 6,
  },
  kicker: {
    color: theme.primaryDeep,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',

    // tighter
    marginBottom: 4,

    alignSelf: 'center',
  },
  title: {
    ...theme.type.screenTitle,

    // tighter
    marginBottom: 4,

    letterSpacing: -0.5,

    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: theme.textMuted,
    lineHeight: 22,

    textAlign: 'center',
  },
  form: {
    width: '100%',

    // MUCH tighter
    marginTop: 14,
  },
  error: {
    color: theme.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,

    // tighter
    marginBottom: 10,

    backgroundColor: theme.surface,
    color: theme.text,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',

    // tighter
    marginTop: 2,
    marginBottom: 16,

    borderBottomWidth: 4,
    borderBottomColor: theme.primaryDeep,
    borderRightWidth: 2,
    borderRightColor: theme.primaryDeep,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.textOnPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  link: {
    textAlign: 'center',
    color: theme.textMuted,
    fontSize: 14,
  },
  linkBold: {
    fontWeight: '900',
    color: theme.primary,
  },
})