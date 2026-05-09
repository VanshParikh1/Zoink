import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import ZoinkLogo from '../components/ZoinkLogo'
import { theme } from '../theme/colors'

export default function VerifyEmailScreen() {
  const { user, setVerified } = useAuth()

  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const inputs = useRef<Array<TextInput | null>>([])

  function handleChange(text: string, index: number) {
    if (!/^\d*$/.test(text)) return

    const newCode = [...code]
    newCode[index] = text
    setCode(newCode)

    if (text && index < 5) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  async function handleVerify() {
    const fullCode = code.join('')

    if (fullCode.length < 6) {
      setError('Please enter the full 6-digit code.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await api.post('/auth/verify-email', { code: fullCode })
      setVerified(res.data.token)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResendMessage('')
    setResendLoading(true)

    try {
      await api.post('/auth/resend-otp')
      setResendMessage('A new code has been sent to your email.')
    } catch (e: any) {
      setResendMessage(e.response?.data?.error || 'Could not resend code.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <ZoinkLogo size={40} style={styles.logo} />
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit Zoink code to{'\n'}
          <Text style={styles.email}>{user?.email}</Text>
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.codeRow}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputs.current[i] = ref }}
              style={styles.codeInput}
              value={digit}
              onChangeText={(text) => handleChange(text, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={theme.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Verify email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
          <Text style={styles.link}>
            {resendLoading ? 'Sending...' : "Didn't get a code? Resend"}
          </Text>
        </TouchableOpacity>

        {resendMessage ? <Text style={styles.resendMessage}>{resendMessage}</Text> : null}
      </View>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logo: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '900', color: theme.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: theme.textMuted, marginBottom: 28, lineHeight: 22 },
  email: { fontWeight: '800', color: theme.primary },
  error: { color: theme.colors.danger, marginBottom: 14, fontSize: 13, fontWeight: '600' },
  codeRow: { flexDirection: 'row', gap: 6, marginBottom: 28, justifyContent: 'center' },
  codeInput: {
    width: 42,
    height: 50,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    backgroundColor: theme.surface,
    color: theme.text,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: { color: theme.textOnPrimary, fontSize: 15, fontWeight: '900' },
  link: { textAlign: 'center', color: theme.primary, fontSize: 14, fontWeight: '800' },
  resendMessage: { textAlign: 'center', color: theme.textMuted, fontSize: 14, marginTop: 12 },
})

