import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { createListing, setAvailability, uploadListingImage } from '../services/listingsApi'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Step = 1 | 2 | 3

type FormData = {
  title: string
  category: string
  description: string
  dailyPrice: string
  deposit: string
  availableNow: boolean
}

const CATEGORIES = [
  'Electronics',
  'Tools',
  'Sports',
  'Outdoors',
  'Audio/Video',
  'Cameras',
  'Clothing',
  'Books',
  'Other',
]

const DEFAULT_CITY = 'Toronto'
const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const TOTAL_STEPS = 3

function getProgress(step: Step) {
  return (step / TOTAL_STEPS) * 100
}

export default function CreateListingScreen() {
  const nav = useNavigation<Nav>()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [formData, setFormData] = useState<FormData>({
    title: '',
    category: '',
    description: '',
    dailyPrice: '',
    deposit: '',
    availableNow: true,
  })

  useEffect(() => {
    nav.setOptions({ gestureEnabled: false })
    return () => nav.setOptions({ gestureEnabled: true })
  }, [nav])

  const progressFillStyle = useMemo(
    () => ({ width: `${getProgress(step)}%` as const }),
    [step]
  )
  const parsedDailyPrice = useMemo(() => Number.parseFloat(formData.dailyPrice || '0') || 0, [formData.dailyPrice])
  const parsedDeposit = useMemo(() => Number.parseFloat(formData.deposit || '0') || 0, [formData.deposit])

  function updateForm<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((current) => ({ ...current, [key]: value }))
  }

  async function handlePickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photo library.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
      })

      if (result.canceled || !result.assets[0]?.uri) return

      const nextUri = result.assets[0].uri
      setPhotos((current) => (current.includes(nextUri) ? current : [...current, nextUri].slice(0, 8)))
    } catch {
      Alert.alert('Photo picker error', 'Could not open your photo library right now.')
    }
  }

  function removePhoto(uri: string) {
    setPhotos((current) => current.filter((photo) => photo !== uri))
  }

  function handleBack() {
    if (step === 1) {
      nav.goBack()
      return
    }
    setStep((current) => (current === 3 ? 2 : 1))
  }

  function handleContinue() {
    if (step === 1) {
      if (!formData.title.trim() || !formData.category || !formData.description.trim()) {
        Alert.alert('Missing details', 'Add a name, pick a category, and write a short description first.')
        return
      }
      setStep(2)
      return
    }

    if (step === 2) {
      if (!formData.dailyPrice.trim()) {
        Alert.alert('Missing price', 'Add a daily price before continuing.')
        return
      }

      if (Number.isNaN(parsedDailyPrice) || parsedDailyPrice <= 0) {
        Alert.alert('Invalid price', 'Daily price must be a positive number.')
        return
      }

      if (formData.deposit.trim() && (Number.isNaN(parsedDeposit) || parsedDeposit < 0)) {
        Alert.alert('Invalid deposit', 'Deposit must be zero or more.')
        return
      }

      setStep(3)
    }
  }

  async function handleGoLive() {
    if (loading) return

    setLoading(true)

    try {
      const listing = await createListing({
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        dailyPrice: parsedDailyPrice,
        city: DEFAULT_CITY,
        latitude: DEFAULT_COORDS.latitude,
        longitude: DEFAULT_COORDS.longitude,
      })

      if (!formData.availableNow) {
        await setAvailability(listing.id, false)
      }

      for (const uri of photos) {
        try {
          await uploadListingImage(listing.id, uri)
        } catch {
          // Keep the listing live even if one photo upload fails.
        }
      }

      nav.navigate('ListingDetail', { listingId: listing.id })
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Something went wrong.'
      Alert.alert('Error', msg)
    } finally {
      setLoading(false)
    }
  }

  function renderStepOne() {
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepEyebrow}>STEP 1</Text>
        <Text style={styles.header}>Start with the basics</Text>
        <Text style={styles.subheader}>Name it clearly, pick the right category, and add a quick description.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Item name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sony a7III Camera"
            placeholderTextColor={theme.textFaint}
            value={formData.title}
            onChangeText={(value) => updateForm('title', value)}
            maxLength={80}
            returnKeyType="next"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContainer}
          >
            {CATEGORIES.map((category) => {
              const isSelected = formData.category === category
              return (
                <TouchableOpacity
                  key={category}
                  activeOpacity={0.75}
                  style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
                  onPress={() => updateForm('category', category)}
                >
                  <Text style={isSelected ? styles.chipTextSelected : styles.chipTextUnselected}>
                    {category}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Short description</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="What is it, what condition is it in, and what should renters know?"
            placeholderTextColor={theme.textFaint}
            value={formData.description}
            onChangeText={(value) => updateForm('description', value)}
            multiline
            textAlignVertical="top"
            maxLength={240}
          />
        </View>
      </View>
    )
  }

  function renderStepTwo() {
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepEyebrow}>STEP 2</Text>
        <Text style={styles.header}>Set your pricing</Text>
        <Text style={styles.subheader}>Keep it simple now. You can always fine-tune pricing and photos later.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Daily price</Text>
          <View style={styles.priceCard}>
            <Text style={styles.pricePrefix}>$</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="0"
              placeholderTextColor={theme.textFaint}
              value={formData.dailyPrice}
              onChangeText={(value) => updateForm('dailyPrice', value)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.twoColumnRow}>
          <View style={[styles.fieldGroup, styles.twoColumnField]}>
            <Text style={styles.label}>Deposit</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional"
              placeholderTextColor={theme.textFaint}
              value={formData.deposit}
              onChangeText={(value) => updateForm('deposit', value)}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={[styles.fieldGroup, styles.twoColumnField]}>
            <Text style={styles.label}>Available now</Text>
            <View style={styles.toggleCard}>
              <Text style={styles.toggleLabel}>{formData.availableNow ? 'Live on publish' : 'Keep paused'}</Text>
              <View style={styles.toggleSwitchWrap}>
                <Switch
                  value={formData.availableNow}
                  onValueChange={(value) => updateForm('availableNow', value)}
                  trackColor={{ false: theme.surfaceAlt, true: theme.primary }}
                  thumbColor={formData.availableNow ? theme.primaryText : theme.text}
                  ios_backgroundColor={theme.surfaceAlt}
                  style={styles.toggleSwitch}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
    )
  }

  function renderStepThree() {
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepEyebrow}>STEP 3</Text>
        <Text style={styles.header}>Review before you go live</Text>
        <Text style={styles.subheader}>This is the snapshot renters will see first.</Text>

        <View style={styles.reviewCard}>
          <View style={styles.reviewThumb}>
            {photos[0] ? (
              <Image source={{ uri: photos[0] }} style={styles.reviewImage} />
            ) : (
              <>
                <Text style={styles.reviewThumbIcon}>📸</Text>
                <Text style={styles.reviewThumbText}>Add photo before you publish</Text>
              </>
            )}
          </View>

          <View style={styles.reviewBody}>
            <Text style={styles.reviewName}>{formData.title.trim() || 'Untitled item'}</Text>
            <View style={styles.reviewMetaRow}>
              <Text style={styles.reviewCategory}>{formData.category || 'No category'}</Text>
              <Text style={styles.reviewAvailability}>
                {formData.availableNow ? 'Available now' : 'Starts paused'}
              </Text>
            </View>
            <Text style={styles.reviewPrice}>${parsedDailyPrice.toFixed(2)} / day</Text>
            <Text style={styles.reviewDeposit}>
              Deposit: {formData.deposit.trim() ? `$${parsedDeposit.toFixed(2)}` : 'None'}
            </Text>
            <Text style={styles.reviewDescription}>{formData.description.trim()}</Text>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Photos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {photos.map((uri) => (
              <View key={uri} style={styles.photoCard}>
                <Image source={{ uri }} style={styles.photoPreview} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(uri)}>
                  <Text style={styles.photoRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}

            {photos.length < 8 ? (
              <TouchableOpacity style={styles.addPhotoCard} onPress={handlePickPhoto}>
                <Text style={styles.addPhotoIcon}>+</Text>
                <Text style={styles.addPhotoText}>Add photo</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>
    )
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, progressFillStyle]} />
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 1 ? renderStepOne() : null}
            {step === 2 ? renderStepTwo() : null}
            {step === 3 ? renderStepThree() : null}
          </ScrollView>

          <View style={styles.footer}>
            {step < 3 ? (
              <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
                <Text style={styles.continueButtonText}>continue →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.goLiveButton} onPress={handleGoLive} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <Text style={styles.goLiveButtonText}>go live</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  )
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.screen,
  },
  topBar: {
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 18,
    gap: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  backText: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  progressTrack: {
    height: 3,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.primary,
    borderRadius: 999,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  stepBody: {
    paddingTop: 6,
  },
  stepEyebrow: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  header: {
    color: theme.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  subheader: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 26,
  },
  fieldGroup: {
    marginBottom: 22,
  },
  label: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 15,
  },
  descriptionInput: {
    minHeight: 132,
    textAlignVertical: 'top',
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsContainer: {
    gap: 8,
    flexDirection: 'row',
    paddingRight: 24,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipSelected: {
    backgroundColor: theme.primary,
  },
  chipUnselected: {
    backgroundColor: theme.surfaceAlt,
  },
  chipTextSelected: {
    color: theme.primaryText,
    fontWeight: '700',
    fontSize: 14,
  },
  chipTextUnselected: {
    color: theme.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  pricePrefix: {
    color: theme.textMuted,
    fontSize: 24,
    fontWeight: '700',
    marginRight: 10,
  },
  priceInput: {
    flex: 1,
    color: theme.primary,
    fontSize: 28,
    fontWeight: '900',
    paddingVertical: 14,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  twoColumnField: {
    flex: 1,
  },
  toggleCard: {
    minHeight: 56,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 10,
    flex: 1,
  },
  toggleSwitchWrap: {
    minHeight: 40,
    justifyContent: 'center',
  },
  toggleSwitch: {
    alignSelf: 'center',
  },
  reviewCard: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
  },
  reviewThumb: {
    height: 176,
    borderRadius: 16,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  reviewThumbIcon: {
    fontSize: 42,
    marginBottom: 10,
  },
  reviewThumbText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  reviewBody: {
    gap: 10,
  },
  reviewName: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '900',
  },
  reviewMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  reviewCategory: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  reviewAvailability: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  reviewPrice: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
  },
  reviewDeposit: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  reviewDescription: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  photoRow: {
    gap: 12,
    paddingRight: 24,
  },
  photoCard: {
    width: 120,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.surfaceAlt,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(4, 15, 15, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
  },
  addPhotoCard: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceAlt,
  },
  addPhotoIcon: {
    color: theme.primary,
    fontSize: 28,
    fontWeight: '400',
    marginBottom: 6,
  },
  addPhotoText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: theme.screen,
  },
  continueButton: {
    width: '100%',
    backgroundColor: theme.primary,
    borderRadius: 12,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: theme.primaryText,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  goLiveButton: {
    width: '100%',
    backgroundColor: theme.primary,
    borderRadius: 12,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goLiveButtonText: {
    color: theme.primaryText,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
})
