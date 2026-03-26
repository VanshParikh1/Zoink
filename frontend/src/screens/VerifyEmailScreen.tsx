import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function VerifyEmailScreen() {
  const { user, setVerified } = useAuth()

  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const inputs = useRef<Array<TextInput | null>>([])

  function handleChange(text: string, index: number) {
    // Only allow digits
    if (!/^\d*$/.test(text)) return

    const newCode = [...code]
    newCode[index] = text
    setCode(newCode)

    // Auto-advance to next input
    if (text && index < 5) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handleKeyPress(key: string, index: number) {
    // On backspace, go back to previous input
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
      // Navigator automatically switches to Home since status is now VERIFIED
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
    <View style={styles.container}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to{'\n'}
        <Text style={styles.email}>{user?.email}</Text>
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.codeRow}>
        {code.map((digit, i) => (
          <TextInput
            key={i}
            ref={ref => { inputs.current[i] = ref }}
            style={styles.codeInput}
            value={digit}
            onChangeText={text => handleChange(text, i)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Verify email</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
        <Text style={styles.link}>
          {resendLoading ? 'Sending...' : "Didn't get a code? Resend"}
        </Text>
      </TouchableOpacity>

      {resendMessage ? <Text style={styles.resendMessage}>{resendMessage}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32, lineHeight: 24 },
  email: { fontWeight: '600', color: '#333' },
  error: { color: '#e53e3e', marginBottom: 16, fontSize: 14 },
  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 32, justifyContent: 'center' },
  codeInput: {
    width: 48, height: 56, borderWidth: 1, borderColor: '#ddd',
    borderRadius: 12, textAlign: 'center', fontSize: 22,
    fontWeight: '600', backgroundColor: '#fafafa'
  },
  button: {
    backgroundColor: '#6C47FF', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 24
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#6C47FF', fontSize: 14, fontWeight: '500' },
  resendMessage: { textAlign: 'center', color: '#666', fontSize: 14, marginTop: 12 },
})