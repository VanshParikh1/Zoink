import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
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
import { useKeyboardVisible } from '../hooks/useKeyboardVisible'
import { AuthIntro, LegalCaption, UniversitiesCard } from '../components/mockup/AuthEntry'
import { markStartup } from '../utils/perfMarks'
import { toast } from '../services/toast'
import { useSubmit } from '../hooks/useSubmit'
import { FieldErrors, hasErrors, validateSignIn } from '../utils/formValidation'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>

export default function LoginScreen() {
  useEffect(() => {
    markStartup('login')
  }, [])
  const navigation = useNavigation<Nav>()
  const keyboardOpen = useKeyboardVisible()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'email' | 'password'>>({})
  const passwordRef = useRef<TextInput>(null)

  const [handleLogin, loading] = useSubmit(async () => {
    const nextErrors = validateSignIn({ email, password })
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return
    try {
      await login(email.trim().toLowerCase(), password)
    } catch (e) {
      toast.failure(e, { action: "Couldn't sign in. Please try again." })
    }
  })

  const footer = (
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
  )

  return (
    <Screen
      glow="topLeft"
      keyboardAvoiding
      // Pinned only while the keyboard is down; with it up the footer joins the scroll
      // below the form, so it can't sit on top of the field being typed in.
      footer={keyboardOpen ? undefined : footer}
    >
      <View style={styles.content}>
        <AuthIntro />

        <View style={styles.form}>
          <TextField
            label="Student email"
            placeholder="University email"
            kind="email"
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              if (errors.email) setErrors((current) => ({ ...current, email: undefined }))
            }}
            error={errors.email}
            validated
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            placeholder="Password"
            kind="password"
            value={password}
            onChangeText={(value) => {
              setPassword(value)
              if (errors.password) setErrors((current) => ({ ...current, password: undefined }))
            }}
            error={errors.password}
            validated
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
          <Text
            style={styles.forgot}
            onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() || undefined })}
            accessibilityRole="link"
          >
            Forgot password?
          </Text>
        </View>

        {keyboardOpen ? footer : null}

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
  footer: {
    gap: space.md,
  },
  switchText: {
    ...type.bodySm,
    color: colors.mutedAlt,
    textAlign: 'center',
  },
  forgot: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
    textDecorationLine: 'underline',
    alignSelf: 'flex-end',
    marginTop: -space.sm,
  },
  switchLink: {
    fontFamily: fonts.bold,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
})
