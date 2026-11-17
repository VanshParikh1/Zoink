import React, { useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import { toast } from '../services/toast'
import { userMessage } from '../utils/userMessage'
import { useSubmit } from '../hooks/useSubmit'
import { FieldErrors, hasErrors, validatePasswordChange } from '../utils/formValidation'

// Settings › Change password. The server signs every other session out and
// hands this phone a fresh token, so it stays signed in.
export default function ChangePasswordScreen() {
  const navigation = useNavigation()
  const { setVerified } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'current' | 'next'>>({})
  const nextRef = useRef<TextInput>(null)

  const [handleSave, loading] = useSubmit(async () => {
    const nextErrors = validatePasswordChange({ current, next })
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return
    try {
      const res = await api.patch('/users/me/password', { currentPassword: current, newPassword: next })
      setVerified(res.data.token)
      toast.success('Your password is changed. Other devices have been signed out.')
      navigation.goBack()
    } catch (e: any) {
      if (e?.response?.status === 400 || e?.response?.status === 401) {
        setErrors({ current: userMessage(e, { action: "Couldn't change your password. Please try again." }) })
      } else {
        toast.failure(e, { action: "Couldn't change your password. Please try again." })
      }
    }
  })

  return (
    <Screen
      keyboardAvoiding
      header={<ScreenHeader title="Change password" back />}
      footer={<Button label="Save new password" onPress={handleSave} loading={loading} />}
    >
      <View style={styles.content}>
        <Text style={styles.body}>Changing your password signs you out on every other device.</Text>
        <TextField
          label="Current password"
          placeholder="Current password"
          kind="password"
          value={current}
          onChangeText={(value) => {
            setCurrent(value)
            if (errors.current) setErrors((e) => ({ ...e, current: undefined }))
          }}
          error={errors.current}
          validated
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => nextRef.current?.focus()}
        />
        <TextField
          ref={nextRef}
          label="New password"
          placeholder="At least 8 characters"
          kind="newPassword"
          value={next}
          onChangeText={(value) => {
            setNext(value)
            if (errors.next) setErrors((e) => ({ ...e, next: undefined }))
          }}
          error={errors.next}
          validated
          returnKeyType="go"
          onSubmitEditing={handleSave}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.lg,
    paddingTop: space.sm,
  },
  body: {
    ...type.body,
    color: colors.mutedAlt,
  },
})
