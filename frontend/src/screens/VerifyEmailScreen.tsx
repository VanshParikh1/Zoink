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
import { useSubmit } from '../hooks/useSubmit'
import { toast } from '../services/toast'

const CODE_LENGTH = 6

export default function VerifyEmailScreen() {
  const { user, setVerified } = useAuth()

  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const [handleVerify, loading] = useSubmit(async () => {
    if (code.length < CODE_LENGTH) {
      setError('Enter all 6 digits of the code.')
      return
    }
    setError('')
    try {
      const res = await api.post('/auth/verify-email', { code })
      setVerified(res.data.token)
    } catch (e: any) {
      setError(userMessage(e, { action: "Couldn't check that code. Please try again." }))
    }
  })

  const [handleResend, resendLoading] = useSubmit(async () => {
    try {
      await api.post('/auth/resend-otp')
      toast.success('A new code is on its way to your email.')
    } catch (e: any) {
      toast.failure(e, { action: "Couldn't send a new code. Please try again." })
    }
  })

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
          {/* Room for two lines, so a message doesn't push the page down. */}
          <Text style={styles.error} numberOfLines={2}>
            {error}
          </Text>
        </View>

        <View style={styles.resend}>
          <Button
            label={resendLoading ? 'Sending...' : "Didn't get a code? Resend"}
            variant="link"
            onPress={handleResend}
            disabled={resendLoading}
          />
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
    minHeight: type.labelSm.lineHeight * 2,
  },
  resend: {
    gap: space.xs,
  },

})
