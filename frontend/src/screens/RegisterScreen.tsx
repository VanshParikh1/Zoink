import React, { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { University, UNIVERSITY_DOMAINS, UNIVERSITY_LABELS } from '@zoink/shared'
import { FieldErrors, hasErrors, validateRegistration } from '../utils/formValidation'
import { toast } from '../services/toast'
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

type Field = 'email' | 'university' | 'firstName' | 'lastName' | 'phone' | 'password'

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
  // The client mirrors the server's checks (utils/formValidation.ts) so each
  // problem shows under its field before a round trip; the server re-checks.
  const [errors, setErrors] = useState<FieldErrors<Field>>({})

  // Sign-up failed on the terms step and came back here to be fixed.
  const returnedError = route.params?.errorMessage
  useEffect(() => {
    if (returnedError) {
      toast.error(returnedError)
      navigation.setParams({ errorMessage: undefined })
    }
  }, [returnedError, navigation])

  function clearError(field: Field) {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleRegister() {
    const nextErrors = validateRegistration({ email, university, firstName, lastName, phone, password })
    setErrors(nextErrors)
    if (hasErrors(nextErrors) || !university) return

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
            <TextField
              label="Student email"
              placeholder={university ? `Student email (@${UNIVERSITY_DOMAINS[university]})` : 'University email'}
              kind="email"
              value={email}
              onChangeText={(value) => {
                setEmail(value)
                clearError('email')
              }}
              error={errors.email}
              validated
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
                  error={errors.university}
                  validated
                />
              </View>
            </Pressable>

            <View style={styles.row}>
              <TextField
                label="First name"
                placeholder="First name"
                kind="givenName"
                value={firstName}
                onChangeText={(value) => {
                  setFirstName(value)
                  clearError('firstName')
                }}
                maxLength={50}
                error={errors.firstName}
                validated={2}
                style={styles.half}
              />
              <TextField
                label="Last name"
                placeholder="Last name"
                kind="familyName"
                value={lastName}
                onChangeText={(value) => {
                  setLastName(value)
                  clearError('lastName')
                }}
                maxLength={50}
                error={errors.lastName}
                validated={2}
                style={styles.half}
              />
            </View>

            <TextField
              label="Phone number"
              placeholder="Phone number"
              kind="phone"
              value={phone}
              onChangeText={(value) => {
                setPhone(value)
                clearError('phone')
              }}
              error={errors.phone}
              validated
            />
            <TextField
              label="Password"
              placeholder="Password (min 8 characters)"
              kind="newPassword"
              value={password}
              onChangeText={(value) => {
                setPassword(value)
                clearError('password')
              }}
              error={errors.password}
              validated
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
                  clearError('university')
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
