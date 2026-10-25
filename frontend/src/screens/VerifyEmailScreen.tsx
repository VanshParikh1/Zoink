import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import OtpInput from '../components/mockup/OtpInput'
import { userMessage } from '../utils/userMessage'

const CODE_LENGTH = 6

export default function VerifyEmailScreen() {
  const { user, setVerified } = useAuth()

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  async function handleVerify() {
    if (code.length < CODE_LENGTH) {
      setError('Please enter the full 6-digit code.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await api.post('/auth/verify-email', { code })
      setVerified(res.data.token)
    } catch (e: any) {
      setError(userMessage(e, { action: 'Something went wrong.' }))
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
      setResendMessage(userMessage(e, { action: 'Could not resend code.' }))
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <Screen
      glow="topLeft"
      keyboardAvoiding
      header={<ScreenHeader title="Check your email" back />}
      footer={<Button label="Verify email" onPress={handleVerify} loading={loading} />}
    >
      <View style={styles.content}>
        <Text style={styles.body}>
          We sent a 6-digit code to <Text style={styles.email}>{user?.email}</Text>
        </Text>

        <View style={styles.codeBlock}>
          <OtpInput value={code} onChange={setCode} error={!!error} autoFocus />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.resend}>
          <Button
            label={resendLoading ? 'Sending...' : "Didn't get a code? Resend"}
            variant="link"
            onPress={handleResend}
            disabled={resendLoading}
          />
          {resendMessage ? <Text style={styles.resendMessage}>{resendMessage}</Text> : null}
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.screen,
    paddingTop: space.sm,
  },
  body: {
    ...type.body,
    color: colors.mutedAlt,
  },
  email: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  codeBlock: {
    gap: space.sm,
  },
  error: {
    ...type.labelSm,
    color: colors.danger,
  },
  resend: {
    gap: space.xs,
  },
  resendMessage: {
    ...type.caption,
    color: colors.mutedAlt,
  },
})
