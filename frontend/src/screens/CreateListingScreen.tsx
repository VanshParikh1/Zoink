import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { LISTING_PHOTOS_MAX } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { createListing, setAvailability, uploadListingImage } from '../services/listingsApi'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import LocationMapPreview from '../components/LocationMapPreview'
import LocationMapModal from '../components/LocationMapModal'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import ListingForm, { ListingFormErrors, ListingFormHeader } from '../components/mockup/ListingForm'

type Nav = NativeStackNavigationProp<RootStackParamList>

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

const DEFAULT_CITY = 'Toronto'
const DEFAULT_COORDS = { latitude: 43.6532, longitude: -79.3832 }
const MIN_PHOTOS = 1

type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error'

export default function CreateListingScreen() {
  const nav = useNavigation<Nav>()
  const [loading, setLoading] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [errors, setErrors] = useState<ListingFormErrors>({})
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

  // The wizard asked for location when its location step opened. With one
  // page, only use it automatically when permission is already granted, so
  // opening the form never pops a permission prompt; otherwise the user taps
  // "Use my current location".
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (permission.status === 'granted') refreshLocation(true)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const parsedDailyPrice = useMemo(() => Number.parseFloat(formData.dailyPrice || '0') || 0, [formData.dailyPrice])
  const parsedItemValue = useMemo(() => Number.parseFloat(formData.itemValue || '0') || 0, [formData.itemValue])
  const parsedDeposit = useMemo(() => Number.parseFloat(formData.deposit || '0') || 0, [formData.deposit])

  function updateForm<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((current) => ({ ...current, [key]: value }))
    // Editing a field clears its own error; the rest wait for the next submit.
    setErrors((current) => (key in current ? { ...current, [key]: undefined } : current))
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
      setPhotos((current) => (current.includes(nextUri) ? current : [...current, nextUri].slice(0, LISTING_PHOTOS_MAX)))
      setErrors((current) => ({ ...current, photos: undefined }))
    } catch {
      Alert.alert('Photo picker error', 'Could not open your photo library right now.')
    }
  }

  function removePhoto(uri: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setPhotos((current) => current.filter((photo) => photo !== uri))
  }

  // The wizard's per-step checks, all at once: same rules, one message per
  // field, shown under that field.
  function validate(): ListingFormErrors {
    const next: ListingFormErrors = {}
    if (photos.length < MIN_PHOTOS) next.photos = 'Add at least one photo of your item.'
    if (!formData.title.trim()) next.title = 'Add a name for your item.'
    if (!formData.category) next.category = 'Pick a category.'
    if (!formData.description.trim()) next.description = 'Write a short description.'

    if (!formData.dailyPrice.trim()) next.dailyPrice = 'Add a daily price.'
    else if (Number.isNaN(parsedDailyPrice) || parsedDailyPrice <= 0) next.dailyPrice = 'Daily price must be a positive number.'

    if (formData.deposit.trim() && (Number.isNaN(parsedDeposit) || parsedDeposit < 0)) {
      next.deposit = 'Deposit must be zero or more.'
    }
    if (formData.itemValue.trim() && (Number.isNaN(parsedItemValue) || parsedItemValue < 0)) {
      next.itemValue = 'Item value must be zero or more.'
    } else if (formData.deposit.trim() && !formData.itemValue.trim()) {
      next.itemValue = "Add the item's value so we can validate your deposit amount."
    } else if (formData.deposit.trim() && formData.itemValue.trim() && parsedDeposit > parsedItemValue) {
      next.deposit = 'You cannot set the deposit amount greater than the item value.'
    }

    if (!formData.city.trim()) next.city = 'Add a city so renters can find your item.'
    return next
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

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      return
    }

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

  const hasErrors = Object.values(errors).some(Boolean)
  const mapCoords = effectiveCoords ?? DEFAULT_COORDS

  return (
    <Screen
      keyboardAvoiding
      header={<ListingFormHeader title="Your stuff earns while you're in class." onBack={() => nav.goBack()} />}
      footer={
        <View style={styles.footer}>
          {hasErrors ? <Text style={styles.error}>Fix the highlighted fields to list your item.</Text> : null}
          <Button label="List it" onPress={handleGoLive} loading={loading} />
        </View>
      }
    >
      <ListingForm
        photos={photos.map((uri) => ({ key: uri, uri, onRemove: () => removePhoto(uri) }))}
        photoMin={MIN_PHOTOS}
        photoMax={LISTING_PHOTOS_MAX}
        onAddPhoto={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          handlePickPhoto()
        }}
        title={formData.title}
        onTitle={(v) => updateForm('title', v)}
        category={formData.category}
        onCategory={(v) => updateForm('category', v)}
        description={formData.description}
        onDescription={(v) => updateForm('description', v)}
        dailyPrice={formData.dailyPrice}
        onDailyPrice={(v) => updateForm('dailyPrice', v)}
        deposit={formData.deposit}
        onDeposit={(v) => updateForm('deposit', v)}
        itemValue={formData.itemValue}
        onItemValue={(v) => updateForm('itemValue', v)}
        errors={errors}
      >
        <View style={styles.field}>
          <Text style={styles.label}>Availability</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>{formData.availableNow ? 'Live as soon as you list it' : 'Keep paused for now'}</Text>
            <Switch
              value={formData.availableNow}
              onValueChange={(value) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                updateForm('availableNow', value)
              }}
              trackColor={{ false: colors.tan, true: colors.green }}
              ios_backgroundColor={colors.tan}
              accessibilityLabel="Available now"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Pickup area</Text>
          <Text style={styles.caption}>Help renters find your item. Only the city is shown publicly.</Text>
          <TextField
            placeholder="Search a place, e.g. University of Toronto"
            value={locationQuery}
            onChangeText={setLocationQuery}
            onSubmitEditing={searchLocation}
            returnKeyType="search"
            leftIcon={<Feather name="search" size={18} color={colors.mutedAlt} />}
            rightAccessory={
              <Pressable onPress={searchLocation} disabled={locationSearching} hitSlop={12} accessibilityRole="button" accessibilityLabel="Search">
                <Text style={styles.go}>{locationSearching ? '…' : 'Go'}</Text>
              </Pressable>
            }
            error={locationSearchError || undefined}
          />
          <LocationMapPreview latitude={mapCoords.latitude} longitude={mapCoords.longitude} onPress={() => setMapModalVisible(true)} />
          <Text style={styles.caption}>
            {locationStatus === 'loading' && !effectiveCoords
              ? 'Finding your location… tap the map or search to set it manually.'
              : locationStatus === 'denied' && !effectiveCoords
                ? 'Location permission denied — tap the map or search to set your spot.'
                : 'Tap the map to fine-tune the exact spot renters will see.'}
          </Text>
          {pinOverride || !deviceCoords ? (
            <Button label="Use my current location" variant="link" onPress={useCurrentLocation} />
          ) : null}
        </View>

        <TextField
          label="City"
          placeholder="e.g. Toronto"
          value={formData.city}
          onChangeText={(value) => updateForm('city', value)}
          maxLength={60}
          returnKeyType="done"
          error={errors.city}
        />
      </ListingForm>

      <LocationMapModal
        visible={mapModalVisible}
        latitude={mapCoords.latitude}
        longitude={mapCoords.longitude}
        onClose={() => setMapModalVisible(false)}
        onConfirm={setPinOverride}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  footer: { gap: space.sm },
  field: { gap: space.sm },
  label: { ...type.labelSm, color: colors.ink },
  caption: { ...type.caption, color: colors.mutedAlt },
  error: { ...type.caption, color: colors.danger, textAlign: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.xxl,
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: border.base,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  toggleText: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink, flex: 1 },
  go: { ...type.label, fontFamily: fonts.black, color: colors.greenText },
})
