import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RouteProp, useRoute } from '@react-navigation/native'
import { RootStackParamList } from '../navigation'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import OtpInput from '../components/mockup/OtpInput'
import TextField from '../components/mockup/TextField'
import { toast } from '../services/toast'
import { userMessage } from '../utils/userMessage'
import { useSubmit } from '../hooks/useSubmit'
import { FieldErrors, hasErrors, validateResetConfirm } from '../utils/formValidation'

// Step 2 of a password reset: the emailed code and a new password. On success
// the server signs this phone in (and every other session out).
export default function ResetPasswordScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ResetPassword'>>()
  const { setVerified } = useAuth()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'code' | 'password'>>({})

  const [handleReset, loading] = useSubmit(async () => {
    const nextErrors = validateResetConfirm({ code, password })
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return
    try {
      const res = await api.post('/auth/password-reset/confirm', { email: params.email, code, newPassword: password })
      toast.success('Your password is changed.')
      setVerified(res.data.token)
    } catch (e) {
      setErrors({ code: userMessage(e, { action: "Couldn't reset your password. Please try again." }) })
    }
  })

  const [handleResend, resendLoading] = useSubmit(async () => {
    try {
      await api.post('/auth/password-reset/request', { email: params.email })
      toast.success('A new code is on its way to your email.')
    } catch (e) {
      toast.failure(e, { action: "Couldn't send a new code. Please try again." })
    }
  })

  return (
    <Screen
      glow="topLeft"
      keyboardAvoiding
      header={<ScreenHeader title="Check your email" back />}
      footer={<Button label="Set new password" onPress={handleReset} loading={loading} />}
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.body}>
            If <Text style={styles.email}>{params.email}</Text> has an account, we sent it a 6-digit code.
          </Text>
          <Text style={styles.body}>
            Can't find it? <Text style={styles.email}>Check your junk or spam folder.</Text>
          </Text>
        </View>

        <View style={styles.codeBlock}>
          <OtpInput
            value={code}
            onChange={(value) => {
              setCode(value)
              if (errors.code) setErrors((current) => ({ ...current, code: undefined }))
            }}
            error={!!errors.code}
            autoFocus
          />
          <Text style={styles.error} numberOfLines={2}>
            {errors.code ?? ''}
          </Text>
        </View>

        <TextField
          label="New password"
          placeholder="At least 8 characters"
          kind="newPassword"
          value={password}
          onChangeText={(value) => {
            setPassword(value)
            if (errors.password) setErrors((current) => ({ ...current, password: undefined }))
          }}
          error={errors.password}
          validated
          returnKeyType="go"
          onSubmitEditing={handleReset}
        />

        <Button
          label={resendLoading ? 'Sending...' : "Didn't get a code? Resend"}
          variant="link"
          onPress={handleResend}
          disabled={resendLoading}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.screen,
    paddingTop: space.sm,
  },
  intro: {
    gap: space.sm,
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
})
