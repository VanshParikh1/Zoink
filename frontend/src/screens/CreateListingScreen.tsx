import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { createListing, uploadListingImage } from '../services/listingsApi'
import LogoPlaceholder from '../components/LogoPlaceholder'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

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

export default function CreateListingScreen() {
  const nav = useNavigation<Nav>()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [dailyPrice, setDailyPrice] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingLocation, setFetchingLocation] = useState(false)

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

      if (result.canceled || !result.assets[0]) return

      const nextUri = result.assets[0].uri
      setPhotos((prev) => (prev.includes(nextUri) ? prev : [...prev, nextUri].slice(0, 8)))
    } catch {
      Alert.alert('Photo picker error', 'Could not open your photo library right now.')
    }
  }

  function removePhoto(uri: string) {
    setPhotos((prev) => prev.filter((photo) => photo !== uri))
  }

  async function handleUseCurrentLocation() {
    setFetchingLocation(true)

    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== 'granted') {
        Alert.alert('Location needed', 'Please allow location access or enter coordinates manually.')
        return
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })

      setLatitude(position.coords.latitude.toFixed(6))
      setLongitude(position.coords.longitude.toFixed(6))
    } catch {
      Alert.alert('Location unavailable', 'Could not fetch your location right now.')
    } finally {
      setFetchingLocation(false)
    }
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !category || !dailyPrice || !city.trim() || !latitude || !longitude) {
      Alert.alert('Missing fields', 'Please fill in all required fields.')
      return
    }

    const price = parseFloat(dailyPrice)
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid price', 'Daily price must be a positive number.')
      return
    }

    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)

    if (isNaN(lat) || lat < -90 || lat > 90) {
      Alert.alert('Invalid latitude', 'Latitude must be between -90 and 90.')
      return
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      Alert.alert('Invalid longitude', 'Longitude must be between -180 and 180.')
      return
    }

    setLoading(true)

    try {
      const listing = await createListing({
        title: title.trim(),
        description: description.trim(),
        category,
        dailyPrice: price,
        latitude: lat,
        longitude: lng,
        city: city.trim(),
        address: address.trim() || undefined,
      })

      for (const uri of photos) {
        try {
          await uploadListingImage(listing.id, uri)
        } catch {
          // Keep creation successful even if one image upload fails.
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>

        <LogoPlaceholder size="small" style={styles.logo} />
        <Text style={styles.header}>List an Item</Text>
        <Text style={styles.subheader}>Tell nearby students what you have available to rent.</Text>

        <Text style={styles.label}>Title <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Sony a7III Camera"
          placeholderTextColor={theme.textFaint}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />

        <Text style={styles.label}>Description <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Describe the item: condition, what's included, pickup notes, and any rules."
          placeholderTextColor={theme.textFaint}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />

        <Text style={styles.label}>Category <Text style={styles.req}>*</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Daily Price (CAD) <Text style={styles.req}>*</Text></Text>
        <View style={styles.priceRow}>
          <Text style={styles.currency}>$</Text>
          <TextInput
            style={[styles.input, styles.priceInput]}
            placeholder="0.00"
            placeholderTextColor={theme.textFaint}
            value={dailyPrice}
            onChangeText={setDailyPrice}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.label}>City <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Toronto"
          placeholderTextColor={theme.textFaint}
          value={city}
          onChangeText={setCity}
        />

        <Text style={styles.label}>Address <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="Neighbourhood, residence, or meetup area"
          placeholderTextColor={theme.textFaint}
          value={address}
          onChangeText={setAddress}
        />

        <View style={styles.locationHeaderRow}>
          <Text style={styles.sectionLabel}>Coordinates <Text style={styles.req}>*</Text></Text>
          <TouchableOpacity
            style={styles.locationButton}
            onPress={handleUseCurrentLocation}
            disabled={fetchingLocation}
          >
            {fetchingLocation ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={styles.locationButtonText}>Use current location</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.coordRow}>
          <TextInput
            style={[styles.input, styles.coordInput]}
            placeholder="Latitude"
            placeholderTextColor={theme.textFaint}
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.coordInput]}
            placeholder="Longitude"
            placeholderTextColor={theme.textFaint}
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.helperText}>
          These coordinates power nearby search. Use your current location or enter them manually.
        </Text>

        <Text style={styles.label}>Photos <Text style={styles.optional}>(up to 8)</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          {photos.map((uri) => (
            <View key={uri} style={styles.photoWrapper}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(uri)}>
                <Text style={styles.photoRemoveText}>X</Text>
              </TouchableOpacity>
            </View>
          ))}

          {photos.length < 8 && (
            <TouchableOpacity style={styles.addPhoto} onPress={handlePickPhoto}>
              <Text style={styles.addPhotoIcon}>+</Text>
              <Text style={styles.addPhotoText}>Add photo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.primaryText} />
          ) : (
            <Text style={styles.submitText}>Post Listing</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.screen },
  content: { paddingHorizontal: 24, paddingTop: 60 },
  backBtn: { marginBottom: 16 },
  backText: { color: theme.primary, fontSize: 16, fontWeight: '800' },
  logo: { marginBottom: 18 },
  header: { fontSize: 30, fontWeight: '900', color: theme.text, marginBottom: 4 },
  subheader: { fontSize: 15, color: theme.textMuted, marginBottom: 28 },
  label: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 6, marginTop: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.text },
  locationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 6,
  },
  locationButton: {
    backgroundColor: theme.surfaceSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  locationButtonText: { color: theme.primary, fontSize: 12, fontWeight: '900' },
  req: { color: theme.primary },
  optional: { color: theme.textMuted, fontWeight: '400' },
  helperText: { color: theme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 1,
  },
  textarea: { height: 110, textAlignVertical: 'top', paddingTop: 13 },
  chipScroll: { marginBottom: 4 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: theme.surface,
  },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { fontSize: 13, color: theme.textMuted, fontWeight: '700' },
  chipTextActive: { color: theme.primaryText },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  currency: { fontSize: 20, color: theme.primary, marginRight: 8, fontWeight: '900' },
  priceInput: { flex: 1 },
  coordRow: { flexDirection: 'row', gap: 10 },
  coordInput: { flex: 1 },
  photoScroll: { marginTop: 4 },
  photoWrapper: { position: 'relative', marginRight: 10 },
  photoThumb: { width: 90, height: 90, borderRadius: 12 },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: theme.text, fontSize: 11, fontWeight: '900' },
  addPhoto: {
    width: 90,
    height: 90,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  addPhotoIcon: { fontSize: 24, color: theme.primary },
  addPhotoText: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  submitBtn: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: theme.primaryText, fontSize: 17, fontWeight: '900' },
})
