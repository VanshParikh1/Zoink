import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import api from '../services/api'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import { toast } from '../services/toast'
import { useSubmit } from '../hooks/useSubmit'
import { FieldErrors, hasErrors, validateResetRequest } from '../utils/formValidation'

type Nav = NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>

// Step 1 of a password reset: ask for a code by email. The server answers the
// same way whether or not the address has an account, so this always moves on.
export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<RouteProp<RootStackParamList, 'ForgotPassword'>>()
  const [email, setEmail] = useState(route.params?.email ?? '')
  const [errors, setErrors] = useState<FieldErrors<'email'>>({})

  const [handleSend, loading] = useSubmit(async () => {
    const nextErrors = validateResetRequest({ email })
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return
    const address = email.trim().toLowerCase()
    try {
      await api.post('/auth/password-reset/request', { email: address })
      navigation.navigate('ResetPassword', { email: address })
    } catch (e) {
      toast.failure(e, { action: "Couldn't send a code. Please try again." })
    }
  })

  return (
    <Screen
      glow="topLeft"
      keyboardAvoiding
      header={<ScreenHeader title="Reset your password" back />}
      footer={<Button label="Send code" onPress={handleSend} loading={loading} />}
    >
      <View style={styles.content}>
        <Text style={styles.body}>
          Enter your student email. If it has a Zoink account, we'll send it a 6-digit code to set a new password.
        </Text>
        <TextField
          label="Student email"
          placeholder="University email"
          kind="email"
          value={email}
          onChangeText={(value) => {
            setEmail(value)
            if (errors.email) setErrors({})
          }}
          error={errors.email}
          validated
          returnKeyType="send"
          onSubmitEditing={handleSend}
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
  body: {
    ...type.body,
    color: colors.mutedAlt,
  },
})
