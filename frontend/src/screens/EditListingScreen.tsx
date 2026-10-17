import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { LISTING_PHOTOS_MAX } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { getListing, updateListing, uploadListingImage, deleteListingImage } from '../services/listingsApi'
import { Listing } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import { fillImageUrl } from '../utils/cloudinaryImage'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import ListingForm, { ListingFormErrors, ListingFormHeader } from '../components/mockup/ListingForm'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'EditListing'>

const PHOTO = 72

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
  const [itemValue, setItemValue] = useState('')
  const [deposit, setDeposit] = useState('')
  const [city, setCity] = useState('')
  const [errors, setErrors] = useState<ListingFormErrors>({})

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
          setItemValue(Number(data.itemValue) ? String(Number(data.itemValue)) : '')
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
    // Same rules as before; each message now shows under its field.
    const next: ListingFormErrors = {}
    if (!title.trim()) next.title = 'Add a name for your item.'
    if (!description.trim()) next.description = 'Write a short description.'
    if (!category) next.category = 'Pick a category.'
    if (!city.trim()) next.city = 'Add a city so renters can find your item.'

    const price = parseFloat(dailyPrice)
    if (!dailyPrice) next.dailyPrice = 'Add a daily price.'
    else if (isNaN(price) || price <= 0) next.dailyPrice = 'Daily price must be a positive number.'

    const parsedDeposit = deposit.trim() ? parseFloat(deposit) : 0
    if (deposit.trim() && (isNaN(parsedDeposit) || parsedDeposit < 0)) {
      next.deposit = 'Deposit must be zero or more.'
    }
    const parsedItemValue = itemValue.trim() ? parseFloat(itemValue) : 0
    if (itemValue.trim() && (isNaN(parsedItemValue) || parsedItemValue < 0)) {
      next.itemValue = 'Item value must be zero or more.'
    } else if (deposit.trim() && !itemValue.trim()) {
      next.itemValue = "Add the item's value so we can validate your deposit amount."
    } else if (deposit.trim() && itemValue.trim() && parsedDeposit > parsedItemValue) {
      next.deposit = 'You cannot set the deposit amount greater than the item value.'
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)

    try {
      await updateListing(listingId, {
        title: title.trim(),
        description: description.trim(),
        category,
        dailyPrice: price,
        itemValue: itemValue.trim() ? parsedItemValue : undefined,
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
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </View>
    )
  }

  const hasErrors = Object.values(errors).some(Boolean)
  // Editing a field clears its own error; the rest wait for the next save.
  const edit = (field: keyof ListingFormErrors, set: (v: string) => void) => (v: string) => {
    set(v)
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  return (
    <Screen
      keyboardAvoiding
      header={<ListingFormHeader title="Edit listing" onBack={() => nav.goBack()} />}
      footer={
        <View style={styles.footer}>
          {hasErrors ? <Text style={styles.error}>Fix the highlighted fields to save.</Text> : null}
          <Button label="Save changes" onPress={handleSave} loading={saving} />
        </View>
      }
    >
      <ListingForm
        photos={(listing?.images ?? []).map((image) => ({
          key: image.id,
          uri: fillImageUrl(image.url, { width: PHOTO, height: PHOTO }) ?? image.url,
          onRemove: () => handleRemovePhoto(image.id),
        }))}
        // Edit never required a photo; the backend caps every listing at LISTING_PHOTOS_MAX.
        photoMin={0}
        photoMax={LISTING_PHOTOS_MAX}
        onAddPhoto={handleAddPhoto}
        addingPhoto={uploadingImg}
        title={title}
        onTitle={edit('title', setTitle)}
        category={category}
        onCategory={edit('category', setCategory)}
        description={description}
        onDescription={edit('description', setDescription)}
        dailyPrice={dailyPrice}
        onDailyPrice={edit('dailyPrice', setDailyPrice)}
        deposit={deposit}
        onDeposit={edit('deposit', setDeposit)}
        itemValue={itemValue}
        onItemValue={edit('itemValue', setItemValue)}
        errors={errors}
      >
        <TextField label="City" placeholder="e.g. Toronto" value={city} onChangeText={edit('city', setCity)} maxLength={60} error={errors.city} />
      </ListingForm>
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  footer: { gap: space.sm },
  error: { ...type.caption, color: colors.danger, textAlign: 'center' },
})
