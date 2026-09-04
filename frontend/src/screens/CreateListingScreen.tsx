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
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LocationMapPreview from '../components/LocationMapPreview'
import LocationMapModal from '../components/LocationMapModal'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { createListing, setAvailability, uploadListingImage } from '../services/listingsApi'
import { theme } from '../theme/colors'
import ZoinkButton from '../components/ZoinkButton'
import ScreenBackground from '../components/ScreenBackground'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Step = 1 | 2 | 3 | 4 | 5

type FormData = {
  title: string
  category: string
  description: string
  dailyPrice: string
  itemValue: string
  deposit: string
  availableNow: boolean
  city: string
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
const TOTAL_STEPS = 5

type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error'

function getProgress(step: Step) {
  return (step / TOTAL_STEPS) * 100
}

export default function CreateListingScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [formData, setFormData] = useState<FormData>({
    title: '',
    category: '',
    description: '',
    dailyPrice: '',
    itemValue: '',
    deposit: '',
    availableNow: true,
    city: DEFAULT_CITY,
  })
  const [deviceCoords, setDeviceCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  const [pinOverride, setPinOverride] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearching, setLocationSearching] = useState(false)
  const [locationSearchError, setLocationSearchError] = useState('')
  const [mapModalVisible, setMapModalVisible] = useState(false)

  const effectiveCoords = pinOverride ?? deviceCoords

  useEffect(() => {
    nav.setOptions({ gestureEnabled: false })
    return () => nav.setOptions({ gestureEnabled: true })
  }, [nav])

  const refreshLocation = async (autofill: boolean) => {
    setLocationStatus('loading')

    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== 'granted') {
        setLocationStatus('denied')
        return
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const nextCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      setDeviceCoords(nextCoords)
      setLocationStatus('granted')

      if (autofill) {
        try {
          const [place] = await Location.reverseGeocodeAsync(nextCoords)
          if (place) {
            const city = place.city || place.subregion || place.region || ''
            if (city) updateForm('city', city)
          }
        } catch {
          // Reverse geocoding is a nice-to-have; keep the raw coords either way.
        }
      }
    } catch {
      setLocationStatus('error')
    }
  }

  useEffect(() => {
    if (step === 4 && locationStatus === 'idle') {
      refreshLocation(!formData.city.trim() || formData.city === DEFAULT_CITY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function useCurrentLocation() {
    setPinOverride(null)
    refreshLocation(false)
  }

  async function searchLocation() {
    const query = locationQuery.trim()
    if (!query) return

    setLocationSearching(true)
    setLocationSearchError('')
    try {
      const [result] = await Location.geocodeAsync(query)
      if (!result) {
        setLocationSearchError('Could not find that place. Try a different search.')
        return
      }
      setPinOverride({ latitude: result.latitude, longitude: result.longitude })
    } catch {
      setLocationSearchError('Could not find that place. Try a different search.')
    } finally {
      setLocationSearching(false)
    }
  }

  const progressFillStyle = useMemo(
    () => ({ width: `${getProgress(step)}%` as const }),
    [step]
  )
  const parsedDailyPrice = useMemo(() => Number.parseFloat(formData.dailyPrice || '0') || 0, [formData.dailyPrice])
  const parsedItemValue = useMemo(() => Number.parseFloat(formData.itemValue || '0') || 0, [formData.itemValue])
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

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    if (step === 1) {
      nav.goBack()
      return
    }
    setStep((current) => (current - 1) as Step)
  }

  function handleContinue() {
    if (step === 1) {
      if (!formData.title.trim() || !formData.category || !formData.description.trim()) {
        Alert.alert('Missing details', 'Add a name, pick a category, and write a short description first.')
        return
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
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

      if (formData.itemValue.trim() && (Number.isNaN(parsedItemValue) || parsedItemValue < 0)) {
        Alert.alert('Invalid item value', 'Item value must be zero or more.')
        return
      }

      if (formData.deposit.trim() && !formData.itemValue.trim()) {
        Alert.alert('Missing item value', "Add the item's value so we can validate your deposit amount.")
        return
      }

      if (formData.deposit.trim() && formData.itemValue.trim() && parsedDeposit > parsedItemValue) {
        Alert.alert('Deposit too high', 'You cannot set the deposit amount greater than the item value.')
        return
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      setStep(3)
      return
    }

    if (step === 3) {
      if (photos.length === 0) {
        Alert.alert('Photo required', 'Add at least one photo of your item before continuing.')
        return
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      setStep(4)
      return
    }

    if (step === 4) {
      if (!formData.city.trim()) {
        Alert.alert('Location required', 'Add a city so renters can find your item.')
        return
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      setStep(5)
    }
  }

  async function geocodeTypedCity() {
    const query = formData.city.trim()
    if (!query) return null

    try {
      const [result] = await Location.geocodeAsync(query)
      if (!result) return null
      return { latitude: result.latitude, longitude: result.longitude }
    } catch {
      return null
    }
  }

  async function handleGoLive() {
    if (loading) return

    setLoading(true)

    try {
      const coords = effectiveCoords ?? (await geocodeTypedCity()) ?? DEFAULT_COORDS

      const listing = await createListing({
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        dailyPrice: parsedDailyPrice,
        itemValue: formData.itemValue.trim() ? parsedItemValue : undefined,
        depositAmount: formData.deposit.trim() ? parsedDeposit : undefined,
        city: formData.city.trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
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

      nav.replace('ListingDetail', { listingId: listing.id })
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
            placeholderTextColor={theme.textDisabled}
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
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                    updateForm('category', category)
                  }}
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
            placeholderTextColor={theme.textDisabled}
            value={formData.description}
            onChangeText={(value) => updateForm('description', value)}
            multiline
            textAlignVertical="top"
            maxLength={1000}
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
              placeholderTextColor={theme.textDisabled}
              value={formData.dailyPrice}
              onChangeText={(value) => updateForm('dailyPrice', value)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.twoColumnRow}>
          <View style={[styles.fieldGroup, styles.twoColumnField]}>
            <Text style={styles.label}>Item value</Text>
            <TextInput
              style={styles.input}
              placeholder={formData.deposit.trim() ? '0' : 'Optional'}
              placeholderTextColor={theme.textDisabled}
              value={formData.itemValue}
              onChangeText={(value) => updateForm('itemValue', value)}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={[styles.fieldGroup, styles.twoColumnField]}>
            <Text style={styles.label}>Deposit</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional"
              placeholderTextColor={theme.textDisabled}
              value={formData.deposit}
              onChangeText={(value) => updateForm('deposit', value)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Available now</Text>
          <View style={styles.toggleCard}>
            <Text style={styles.toggleLabel}>{formData.availableNow ? 'Live on publish' : 'Keep paused'}</Text>
            <View style={styles.toggleSwitchWrap}>
              <Switch
                value={formData.availableNow}
                onValueChange={(value) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  updateForm('availableNow', value)
                }}
                trackColor={{ false: theme.surfaceSubdued, true: theme.primary }}
                thumbColor={formData.availableNow ? theme.textOnPrimary : theme.text}
                ios_backgroundColor={theme.surfaceSubdued}
                style={styles.toggleSwitch}
              />
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
        <Text style={styles.header}>Add photos</Text>
        <Text style={styles.subheader}>At least one photo is required. Items with clear photos rent 3x faster.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Photos ({photos.length}/8)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {photos.map((uri) => (
              <View key={uri} style={styles.photoCard}>
                <Image source={{ uri }} style={styles.photoPreview} />
                <TouchableOpacity 
                  style={styles.photoRemove} 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
                    removePhoto(uri)
                  }}
                >
                  <Text style={styles.photoRemoveText}>x</Text>
                </TouchableOpacity>
              </View>
            ))}

            {photos.length < 8 ? (
              <TouchableOpacity 
                style={[styles.addPhotoCard, photos.length === 0 && styles.addPhotoCardRequired]} 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  handlePickPhoto()
                }}
              >
                <Text style={styles.addPhotoIcon}>+</Text>
                <Text style={styles.addPhotoText}>{photos.length === 0 ? 'Add photo *' : 'Add more'}</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>

        {photos.length === 0 && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>You need at least 1 photo to continue</Text>
          </View>
        )}
      </View>
    )
  }

  function renderStepFour() {
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepEyebrow}>STEP 4</Text>
        <Text style={styles.header}>Set your location</Text>
        <Text style={styles.subheader}>Help renters find your item. Only the city is shown publicly.</Text>

        <View style={styles.mapCard}>
          <View style={styles.locationSearchRow}>
            <TextInput
              style={styles.locationSearchInput}
              placeholder="Search a place, e.g. University of Toronto"
              placeholderTextColor={theme.textDisabled}
              value={locationQuery}
              onChangeText={setLocationQuery}
              onSubmitEditing={searchLocation}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={styles.locationSearchButton}
              onPress={searchLocation}
              disabled={locationSearching}
            >
              {locationSearching ? (
                <ActivityIndicator size="small" color={theme.textOnPrimary} />
              ) : (
                <Text style={styles.locationSearchButtonText}>Go</Text>
              )}
            </TouchableOpacity>
          </View>
          {locationSearchError ? <Text style={styles.locationSearchError}>{locationSearchError}</Text> : null}

          <LocationMapPreview
            latitude={(effectiveCoords ?? DEFAULT_COORDS).latitude}
            longitude={(effectiveCoords ?? DEFAULT_COORDS).longitude}
            onPress={() => setMapModalVisible(true)}
          />
          <Text style={styles.mapCaption}>
            {locationStatus === 'loading' && !effectiveCoords
              ? 'Finding your location… tap the map or search to set it manually.'
              : locationStatus === 'denied' && !effectiveCoords
              ? 'Location permission denied — tap the map or search to set your spot.'
              : 'Tap the map to fine-tune the exact spot renters will see.'}
          </Text>

          {pinOverride ? (
            <View style={styles.locationLinksRow}>
              <TouchableOpacity onPress={useCurrentLocation}>
                <Text style={styles.locationLink}>Use my current location</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>City *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Toronto"
            placeholderTextColor={theme.textDisabled}
            value={formData.city}
            onChangeText={(value) => updateForm('city', value)}
            maxLength={60}
            returnKeyType="done"
          />
        </View>

        <LocationMapModal
          visible={mapModalVisible}
          latitude={(effectiveCoords ?? DEFAULT_COORDS).latitude}
          longitude={(effectiveCoords ?? DEFAULT_COORDS).longitude}
          onClose={() => setMapModalVisible(false)}
          onConfirm={setPinOverride}
        />
      </View>
    )
  }

  function renderStepFive() {
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepEyebrow}>STEP 5</Text>
        <Text style={styles.header}>Review before you go live</Text>
        <Text style={styles.subheader}>This is the snapshot renters will see first.</Text>

        <View style={styles.reviewCard}>
          <View style={styles.reviewThumb}>
            {photos[0] ? (
              <Image source={{ uri: photos[0] }} style={styles.reviewImage} />
            ) : (
              <Text style={styles.reviewThumbText}>No photo</Text>
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
              Item value: {formData.itemValue.trim() ? `$${parsedItemValue.toFixed(2)}` : 'None'}
            </Text>
            <Text style={styles.reviewDeposit}>
              Deposit: {formData.deposit.trim() ? `$${parsedDeposit.toFixed(2)}` : 'None'}
            </Text>
            <Text style={styles.reviewLocation}>{formData.city}</Text>
            <Text style={styles.reviewDescription}>{formData.description.trim()}</Text>
            <Text style={styles.reviewPhotoCount}>{photos.length} photo{photos.length !== 1 ? 's' : ''} attached</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScreenBackground>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Text style={styles.backText}>{'\u2190'}</Text>
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
              {step === 4 ? renderStepFour() : null}
              {step === 5 ? renderStepFive() : null}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              {step < 5 ? (
                <ZoinkButton 
                  label={'continue \u2192'} 
                  onPress={handleContinue} 
                />
              ) : (
                <ZoinkButton 
                  label="go live" 
                  onPress={handleGoLive} 
                  isLoading={loading} 
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </ScreenBackground>
    </TouchableWithoutFeedback>
  )
}

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  topBar: {
    paddingTop: theme.header.stackTop,
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
    backgroundColor: theme.surfaceSubdued,
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
    ...theme.type.screenTitle,
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
  mapCard: {
    marginBottom: 22,
  },
  mapCaption: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  locationLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  locationLink: {
    color: theme.primaryDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  locationSearchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  locationSearchInput: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 14,
  },
  locationSearchButton: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  locationSearchButtonText: {
    color: theme.textOnPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  locationSearchError: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
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
    borderRadius: 8,
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
    backgroundColor: theme.surfaceSubdued,
  },
  chipTextSelected: {
    color: theme.textOnPrimary,
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
    backgroundColor: theme.cardBackground,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 16,
    minHeight: 72,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
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
    backgroundColor: theme.cardBackground,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
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
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  reviewThumb: {
    height: 176,
    borderRadius: 16,
    backgroundColor: theme.surfaceSubdued,
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
    backgroundColor: theme.surfaceSubdued,
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
    backgroundColor: theme.surfaceSubdued,
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
    color: theme.textOnPrimary,
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
    color: theme.textOnPrimary,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  warningBanner: {
    backgroundColor: 'rgba(239, 165, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 165, 68, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 4,
  },
  warningText: {
    color: '#B45309',
    fontSize: 13,
    fontWeight: '700',
  },
  addPhotoCardRequired: {
    borderColor: theme.primary,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  reviewLocation: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  reviewPhotoCount: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '800',
  },
})
