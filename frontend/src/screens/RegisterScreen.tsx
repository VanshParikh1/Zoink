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
  ScrollView,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import ScreenBackground from '../components/ScreenBackground'
import ZoinkFullLogo from '../components/ZoinkFullLogo'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Register'>

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>()
  const { register } = useAuth()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setError('')
    if (!firstName || !lastName || !email || !phone || !password) {
      setError('Please fill in all fields.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      await register(email.trim().toLowerCase(), password, firstName.trim(), lastName.trim(), phone.trim())
    } catch (e: any) {
      setError(e.response?.data?.error || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header & Logo */}
          <ZoinkFullLogo width={280} height={80} style={styles.logo} />
          <Text style={styles.kicker}>join zoink</Text>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Use your university email to unlock the student marketplace.
          </Text>

          {/* Form */}
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="First name"
                placeholderTextColor={theme.textDisabled}
                value={firstName}
                onChangeText={setFirstName}
                maxLength={50}
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Last name"
                placeholderTextColor={theme.textDisabled}
                value={lastName}
                onChangeText={setLastName}
                maxLength={50}
              />
            </View>

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
              placeholder="Phone number"
              placeholderTextColor={theme.textDisabled}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <TextInput
              style={styles.input}
              placeholder="Password (min 8 characters)"
              placeholderTextColor={theme.textDisabled}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {/* Tactile stamped button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.75}
            >
              {loading
                ? <ActivityIndicator color={theme.textOnPrimary} />
                : <Text style={styles.buttonText}>Create account</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.7}>
              <Text style={styles.link}>
                Already have an account?{' '}
                <Text style={styles.linkBold}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  logo: {
    marginBottom: 16,
    alignSelf: 'center',
  },
  kicker: {
    color: theme.primaryDeep,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    ...theme.type.screenTitle,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: theme.textMuted,
    lineHeight: 22,
  },
  form: {
    width: '100%',
    marginTop: 16,
  },
  error: {
    color: theme.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: theme.surface,
    color: theme.text,
  },
  halfInput: {
    flex: 1,
  },
  // Tactile stamped style
  button: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 24,
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