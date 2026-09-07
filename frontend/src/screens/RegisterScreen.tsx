import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { University, UNIVERSITY_DOMAINS, UNIVERSITY_LABELS } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import ZoinkLogo from '../components/ZoinkLogo'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'

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
    <DismissKeyboardView>
      <ScreenBackground>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.inner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header & Logo */}
            <Text style={styles.kicker}>join zoink</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.title}>Create account</Text>
              <ZoinkLogo size={75} style={{ marginTop: -30, marginRight: 1 }} />
            </View>
            <Text style={styles.subtitle}>
              Use your university email to unlock the student marketplace.
            </Text>

            {/* Form */}
            <View style={styles.form}>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="First name"
                  placeholderTextColor={theme.textDisabled}
                  value={firstName}
                  onChangeText={setFirstName}
                  maxLength={50}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Last name"
                  placeholderTextColor={theme.textDisabled}
                  value={lastName}
                  onChangeText={setLastName}
                  maxLength={50}
                />
              </View>

              <TouchableOpacity
                style={styles.input}
                onPress={() => setPickerVisible(true)}
                activeOpacity={0.75}
              >
                <Text style={university ? styles.selectValue : styles.selectPlaceholder}>
                  {university ? UNIVERSITY_LABELS[university] : 'University'}
                </Text>
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                placeholder={university ? `Student email (@${UNIVERSITY_DOMAINS[university]})` : 'University email'}
                placeholderTextColor={theme.textDisabled}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor={theme.textDisabled}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <TextInput
                style={styles.input}
                placeholder="Password (min 8 characters)"
                placeholderTextColor={theme.textDisabled}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {/* Tactile stamped button */}
              <TouchableOpacity
                style={styles.button}
                onPress={handleRegister}
                activeOpacity={0.75}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.7}>
                <Text style={styles.link}>
                  Already have an account?{' '}
                  <Text style={styles.linkBold}>Sign in</Text>
                </Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        <Modal
          visible={pickerVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Choose your university</Text>
              {UNIVERSITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.modalRow}
                  onPress={() => {
                    setUniversity(option)
                    setPickerVisible(false)
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalRowText}>{UNIVERSITY_LABELS[option]}</Text>
                  {university === option ? <Text style={styles.modalRowCheck}>✓</Text> : null}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setPickerVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScreenBackground>
    </DismissKeyboardView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  logo: {
    marginBottom: 16,
    alignSelf: 'center',
  },
  kicker: {
    color: theme.primaryDeep,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    ...theme.type.screenTitle,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: theme.textMuted,
    lineHeight: 22,
  },
  form: {
    width: '100%',
    marginTop: 16,
  },
  error: {
    color: theme.danger,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: theme.surface,
    color: theme.text,
  },
  halfInput: {
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: 16,
    color: theme.textDisabled,
  },
  selectValue: {
    fontSize: 16,
    color: theme.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: theme.hard.border,
    borderLeftWidth: theme.hard.border,
    borderRightWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalRowText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
  },
  modalRowCheck: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.primary,
  },
  modalCancel: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.textMuted,
  },
  // Tactile stamped style
  button: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 24,
    borderBottomWidth: 4,
    borderBottomColor: theme.primaryDeep,
    borderRightWidth: 2,
    borderRightColor: theme.primaryDeep,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.textOnPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  link: {
    textAlign: 'center',
    color: theme.textMuted,
    fontSize: 14,
  },
  linkBold: {
    fontWeight: '900',
    color: theme.primary,
  },
})