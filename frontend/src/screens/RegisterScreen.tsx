import React, { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { University, UNIVERSITY_DOMAINS, UNIVERSITY_LABELS } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import { AuthIntro, LegalCaption, UniversitiesCard } from '../components/mockup/AuthEntry'

type Nav = NativeStackNavigationProp<RootStackParamList, 'Register'>
type ScreenRoute = RouteProp<RootStackParamList, 'Register'>

const UNIVERSITY_OPTIONS = Object.keys(UNIVERSITY_LABELS) as University[]

// Client-side mirror of the backend's Zod check (auth.schema.ts) — a UX
// nicety only. The server re-validates the same domain match and is the
// one that's actually trusted; this just surfaces the error before submit
// instead of making the user wait for a round trip.
function emailMatchesUniversity(email: string, university: University | null): boolean {
  if (!university) return false
  const domain = UNIVERSITY_DOMAINS[university]
  return email.trim().toLowerCase().endsWith(`@${domain}`)
}

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const insets = useSafeAreaInsets()
  const pending = route.params?.pendingRegistration

  const [firstName, setFirstName] = useState(pending?.firstName ?? '')
  const [lastName, setLastName] = useState(pending?.lastName ?? '')
  const [email, setEmail] = useState(pending?.email ?? '')
  const [phone, setPhone] = useState(pending?.phone ?? '')
  const [password, setPassword] = useState(pending?.password ?? '')
  const [university, setUniversity] = useState<University | null>(pending?.university ?? null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [error, setError] = useState(route.params?.errorMessage ?? '')

  function handleRegister() {
    setError('')
    if (!firstName || !lastName || !email || !phone || !password || !university) {
      setError('Please fill in all fields.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!emailMatchesUniversity(email, university)) {
      setError(`Please use your ${UNIVERSITY_LABELS[university]} student email (@${UNIVERSITY_DOMAINS[university]}).`)
      return
    }

    // The account isn't created here — acceptance of the Terms and Privacy
    // Policy has to happen first, so registerUser() only fires after the
    // user gets through TermsAcceptanceScreen.
    navigation.navigate('TermsAcceptance', {
      mode: 'register',
      pendingRegistration: {
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        university,
      },
    })
  }

  return (
    <>
      <Screen
        glow="topLeft"
        keyboardAvoiding
        footer={
          <View style={styles.footer}>
            <Button label="Continue" onPress={handleRegister} />
            <Text style={styles.switchText} onPress={() => navigation.navigate('Login')} accessibilityRole="link">
              Already have an account? <Text style={styles.switchLink}>Sign in</Text>
            </Text>
            <LegalCaption
              onTerms={() => navigation.navigate('TermsAcceptance', { mode: 'view', initialTab: 'terms' })}
              onPrivacy={() => navigation.navigate('TermsAcceptance', { mode: 'view', initialTab: 'privacy' })}
            />
          </View>
        }
      >
        <View style={styles.content}>
          <AuthIntro />

          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TextField
              label="Student email"
              placeholder={university ? `Student email (@${UNIVERSITY_DOMAINS[university]})` : 'University email'}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
            />

            {/* Opens the picker; the field itself is display-only. */}
            <Pressable
              onPress={() => setPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={university ? `University, ${UNIVERSITY_LABELS[university]}` : 'Choose your university'}
            >
              <View pointerEvents="none">
                <TextField
                  label="University"
                  placeholder="University"
                  value={university ? UNIVERSITY_LABELS[university] : ''}
                  editable={false}
                  leftIcon={<Feather name="book-open" size={18} color={colors.mutedAlt} />}
                />
              </View>
            </Pressable>

            <View style={styles.row}>
              <TextField
                label="First name"
                placeholder="First name"
                value={firstName}
                onChangeText={setFirstName}
                maxLength={50}
                style={styles.half}
              />
              <TextField
                label="Last name"
                placeholder="Last name"
                value={lastName}
                onChangeText={setLastName}
                maxLength={50}
                style={styles.half}
              />
            </View>

            <TextField
              label="Phone number"
              placeholder="Phone number"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={setPhone}
            />
            <TextField
              label="Password"
              placeholder="Password (min 8 characters)"
              secureTextEntry
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <UniversitiesCard />
        </View>
      </Screen>

      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + space.screen }]}>
            <Text style={styles.modalTitle}>Choose your university</Text>
            {UNIVERSITY_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={({ pressed }) => [styles.modalRow, pressed ? styles.modalRowPressed : null]}
                onPress={() => {
                  setUniversity(option)
                  setPickerVisible(false)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: university === option }}
              >
                <Text style={styles.modalRowText}>{UNIVERSITY_LABELS[option]}</Text>
                {university === option ? <Feather name="check" size={18} color={colors.greenText} /> : null}
              </Pressable>
            ))}
            <Button label="Cancel" variant="secondary" onPress={() => setPickerVisible(false)} style={styles.modalCancel} />
          </View>
        </View>
      </Modal>
    </>
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
  row: {
    flexDirection: 'row',
    gap: space.lg,
  },
  half: {
    flex: 1,
  },
  error: {
    ...type.labelSm,
    color: colors.danger,
  },
  footer: {
    gap: space.md,
  },
  switchText: {
    ...type.bodySm,
    color: colors.mutedAlt,
    textAlign: 'center',
  },
  switchLink: {
    fontFamily: fonts.bold,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    borderTopWidth: border.base,
    borderLeftWidth: border.base,
    borderRightWidth: border.base,
    borderColor: colors.ink,
    paddingHorizontal: space.screen,
    paddingTop: space.screen,
  },
  modalTitle: {
    ...type.section,
    color: colors.ink,
    marginBottom: space.sm,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.divider,
  },
  modalRowPressed: {
    backgroundColor: colors.tan,
  },
  modalRowText: {
    ...type.label,
    color: colors.ink,
  },
  modalCancel: {
    marginTop: space.xxl,
  },
})
