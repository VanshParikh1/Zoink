import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import {
  getListing,
  updateListing,
  uploadListingImage,
  deleteListingImage,
} from '../services/listingsApi'
import { Listing } from '../types'
import ZoinkLogo from '../components/ZoinkLogo'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'EditListing'>

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

export default function EditListingScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<Route>()
  const listingId = route.params.listingId

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [dailyPrice, setDailyPrice] = useState('')
  const [deposit, setDeposit] = useState('')
  const [city, setCity] = useState('')

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setLoading(true)

        try {
          const data = await getListing(listingId)
          setListing(data)
          setTitle(data.title)
          setDescription(data.description)
          setCategory(data.category)
          setDailyPrice(String(Number(data.dailyPrice)))
          setDeposit(Number(data.depositAmount) ? String(Number(data.depositAmount)) : '')
          setCity(data.city)
        } catch {
          Alert.alert('Error', 'Could not load listing.')
          nav.goBack()
        } finally {
          setLoading(false)
        }
      }

      load()
    }, [listingId, nav])
  )

  async function handleSave() {
    if (!title.trim() || !description.trim() || !category || !dailyPrice || !city.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields.')
      return
    }

    const price = parseFloat(dailyPrice)
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid price', 'Daily price must be a positive number.')
      return
    }

    const parsedDeposit = deposit.trim() ? parseFloat(deposit) : 0
    if (deposit.trim() && (isNaN(parsedDeposit) || parsedDeposit < 0)) {
      Alert.alert('Invalid deposit', 'Deposit must be zero or more.')
      return
    }

    setSaving(true)

    try {
      await updateListing(listingId, {
        title: title.trim(),
        description: description.trim(),
        category,
        dailyPrice: price,
        depositAmount: deposit.trim() ? parsedDeposit : 0,
        city: city.trim(),
      })

      Alert.alert('Saved', 'Your listing has been updated.', [
        { text: 'OK', onPress: () => nav.navigate('ListingDetail', { listingId }) },
      ])
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddPhoto() {
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

      setUploadingImg(true)

      await uploadListingImage(listingId, result.assets[0].uri)
      // Re-fetch from backend so the UI shows the real persisted Cloudinary URL
      const updated = await getListing(listingId)
      setListing(updated)
    } catch {
      Alert.alert('Upload failed', 'Could not upload the photo.')
    } finally {
      setUploadingImg(false)
    }
  }

  async function handleRemovePhoto(imageId: string) {
    Alert.alert('Remove photo?', 'This will delete the photo permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListingImage(listingId, imageId)
            setListing((prev) =>
              prev ? { ...prev, images: prev.images.filter((image) => image.id !== imageId) } : prev
            )
          } catch {
            Alert.alert('Error', 'Could not remove photo.')
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>

        <ZoinkLogo size={40} style={styles.logo} />
        <Text style={styles.header}>Edit Listing</Text>

        <Text style={styles.label}>Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          {listing?.images.map((img) => (
            <View key={img.id} style={styles.photoWrapper}>
              <Image source={{ uri: img.url }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemovePhoto(img.id)}>
                <Text style={styles.photoRemoveText}>X</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addPhoto} onPress={handleAddPhoto} disabled={uploadingImg}>
            {uploadingImg ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <>
                <Text style={styles.addPhotoIcon}>+</Text>
                <Text style={styles.addPhotoLabel}>Add</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>

        <Text style={styles.label}>Title <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholderTextColor={theme.textDisabled}
          maxLength={80}
        />

        <Text style={styles.label}>Description <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholderTextColor={theme.textDisabled}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />

        <Text style={styles.label}>Category <Text style={styles.req}>*</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
            style={[styles.input, { flex: 1 }]}
            value={dailyPrice}
            onChangeText={setDailyPrice}
            placeholderTextColor={theme.textDisabled}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.label}>Deposit <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.priceRow}>
          <Text style={styles.currency}>$</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={deposit}
            onChangeText={setDeposit}
            placeholder="0"
            placeholderTextColor={theme.textDisabled}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.label}>City <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholderTextColor={theme.textDisabled}
          maxLength={60}
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  content: { paddingHorizontal: 24, paddingTop: theme.header.stackTop },
  backBtn: { marginBottom: 16 },
  backText: { color: theme.primary, fontSize: 16, fontWeight: '800' },
  logo: { marginBottom: 16 },
  header: { ...theme.type.screenTitle, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 6, marginTop: 18 },
  req: { color: theme.primary },
  optional: { color: theme.textMuted, fontWeight: '400' },
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
  chipTextActive: { color: theme.textOnPrimary },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  currency: { fontSize: 20, color: theme.primary, marginRight: 8, fontWeight: '900' },
  photoScroll: { marginTop: 4 },
  photoWrapper: { position: 'relative', marginRight: 10 },
  photoThumb: { width: 90, height: 90, borderRadius: 12 },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(4,15,15,0.75)',
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
  addPhotoLabel: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: theme.textOnPrimary, fontSize: 17, fontWeight: '900' },
})

