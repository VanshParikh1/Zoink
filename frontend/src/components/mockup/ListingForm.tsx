import React from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { calculateCommission, calculateOwnerPayout, getCommissionRate, PAYOUT_HOLD_HOURS } from '@zoink/shared'
import { colors } from '../../theme/colors'
import { border, radius, space } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import { LISTING_CATEGORIES } from '../../config/categories'
import Card from './Card'
import Chip from './Chip'
import TextField from './TextField'
import IconButton from './IconButton'
import FieldMessage from './FieldMessage'

// Shared layout for creating and editing a listing. Each screen keeps its own
// state, validation and API calls; this only lays the fields out.

export type ListingFormErrors = Partial<
  Record<'photos' | 'title' | 'category' | 'description' | 'dailyPrice' | 'deposit' | 'itemValue' | 'city', string>
>

type Photo = { key: string; uri: string; onRemove: () => void }

type Props = {
  photos: Photo[]
  photoMin: number
  photoMax: number
  onAddPhoto: () => void
  addingPhoto?: boolean
  title: string
  onTitle: (v: string) => void
  category: string
  onCategory: (v: string) => void
  description: string
  onDescription: (v: string) => void
  dailyPrice: string
  onDailyPrice: (v: string) => void
  deposit: string
  onDeposit: (v: string) => void
  itemValue: string
  onItemValue: (v: string) => void
  errors: ListingFormErrors
  /** Everything after the payout card (availability, location, city). */
  children?: React.ReactNode
}

const PHOTO = 72
// The payout preview's example rental length.
const EXAMPLE_RENTAL_DAYS = 3
// The "You keep" total, a touch under type.section.
const KEEP_SIZE = 19

function money(n: number) {
  return `$${n.toFixed(2)}`
}

// Form header title: between type.section (20) and type.h2 (26).
const HEADER_TITLE_SIZE = 22

/** Header row for create and edit: back button plus a title of up to two lines. */
export function ListingFormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <IconButton accessibilityLabel="Go back" onPress={onBack}>
        <Feather name="chevron-left" size={24} color={colors.ink} />
      </IconButton>
      <Text style={styles.headerTitle} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
    </View>
  )
}

const FieldError = FieldMessage

/** What an owner keeps on an example rental, with the backend's own commission math. */
function PayoutPreview({ dailyPrice }: { dailyPrice: string }) {
  const price = Number.parseFloat(dailyPrice)
  const valid = Number.isFinite(price) && price > 0
  const rent = valid ? Math.round(price * EXAMPLE_RENTAL_DAYS * 100) / 100 : 0
  const ratePct = valid ? getCommissionRate(price) * 100 : null

  return (
    <Card radius="hero" shadow="xl" padding={space.xl} contentStyle={styles.payout}>
      <View>
        <Text style={styles.payoutTitle}>What you'd keep</Text>
        <Text style={styles.caption}>On a {EXAMPLE_RENTAL_DAYS}-day rental. Commission drops as your price goes up.</Text>
      </View>
      <View style={styles.table}>
        <View style={styles.tableRow}>
          <Text style={styles.rowLabel}>Rent</Text>
          <Text style={styles.rowValue}>{valid ? money(rent) : '—'}</Text>
        </View>
        <View style={[styles.tableRow, styles.tableDivider]}>
          <Text style={styles.rowLabel}>Zoink commission{ratePct != null ? ` (${Number(ratePct.toFixed(1))}%)` : ''}</Text>
          <Text style={styles.rowValue}>{valid ? `−${money(calculateCommission(rent, price))}` : '—'}</Text>
        </View>
        <View style={[styles.tableRow, styles.keepRow]}>
          <Text style={styles.keepText}>You keep</Text>
          <Text style={styles.keepText}>{valid ? money(calculateOwnerPayout(rent, price)) : '—'}</Text>
        </View>
      </View>
      <Text style={styles.caption}>
        Paid out {PAYOUT_HOLD_HOURS} h after return. Nothing taken from deposits or damage payments.
      </Text>
    </Card>
  )
}

export default function ListingForm(props: Props) {
  const { photos, photoMin, photoMax, errors } = props
  const canAdd = photos.length < photoMax

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <View style={styles.photoRow}>
          {canAdd ? (
            <Pressable
              style={styles.addPhoto}
              onPress={props.onAddPhoto}
              disabled={props.addingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
            >
              {props.addingPhoto ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  <Feather name="camera" size={20} color={colors.ink} />
                  <Text style={styles.addPhotoText}>Photos</Text>
                </>
              )}
            </Pressable>
          ) : null}
          {photos.map((photo, index) => (
            <View key={photo.key} style={styles.thumbWrap}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} />
              <Pressable
                style={styles.remove}
                onPress={photo.onRemove}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
              >
                <Feather name="x" size={14} color={colors.ink} />
              </Pressable>
            </View>
          ))}
        </View>
        <Text style={[styles.caption, photos.length < photoMin ? styles.errorText : null]}>
          {photos.length}/{photoMax} photos{photos.length < photoMin ? ` · add at least ${photoMin}` : ''}
        </Text>
        <FieldError message={errors.photos} />
      </View>

      <View style={styles.field}>
        <TextField
          label="What are you lending?"
          placeholder="e.g. Sony a7III Camera"
          autoCapitalize="sentences"
          value={props.title}
          onChangeText={props.onTitle}
          error={errors.title}
          validated
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {LISTING_CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={props.category === c} onPress={() => props.onCategory(c)} />
          ))}
        </View>
        <FieldError message={errors.category} />
      </View>

      <TextField
        label="Description"
        placeholder="What is it, what condition is it in, and what should renters know?"
        value={props.description}
        onChangeText={props.onDescription}
        multiline
        error={errors.description}
        validated
      />

      <View style={styles.priceRow}>
        <TextField
          label="Daily price"
          placeholder="0"
          variant="boxed"
          kind="money"
          value={props.dailyPrice}
          onChangeText={props.onDailyPrice}
          error={errors.dailyPrice}
          validated={2}
          style={styles.priceField}
        />
        <TextField
          label="Deposit"
          placeholder="Optional"
          variant="boxed"
          kind="money"
          value={props.deposit}
          onChangeText={props.onDeposit}
          error={errors.deposit}
          validated={2}
          style={styles.priceField}
        />
        <TextField
          label="Item value"
          placeholder="Optional"
          variant="boxed"
          kind="money"
          value={props.itemValue}
          onChangeText={props.onItemValue}
          error={errors.itemValue}
          validated={2}
          style={styles.priceField}
        />
      </View>

      <PayoutPreview dailyPrice={props.dailyPrice} />

      <Card shadow="sm" rotate={1} padding={space.lg} contentStyle={styles.callout}>
        <Text style={styles.calloutText}>
          <Text style={styles.calloutStrong}>No insurance.</Text> The deposit is the only money held against damage, so set
          one that covers what you'd actually lose.
        </Text>
      </Card>

      {props.children}
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: space.screen },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headerTitle: {
    ...type.h2,
    fontSize: HEADER_TITLE_SIZE,
    lineHeight: HEADER_TITLE_SIZE + 4,
    letterSpacing: -1.1,
    color: colors.ink,
    flex: 1,
  },
  field: { gap: space.sm },
  label: { ...type.labelSm, color: colors.ink },
  caption: { ...type.caption, color: colors.mutedAlt },
  error: { ...type.caption, color: colors.danger },
  errorText: { color: colors.danger },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  addPhoto: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: radius.card - 2,
    borderWidth: border.base,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: { ...type.eyebrow, fontFamily: fonts.bold, textTransform: 'none', letterSpacing: 0, color: colors.ink },
  thumbWrap: { width: PHOTO, height: PHOTO },
  thumb: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: radius.card - 2,
    borderWidth: border.base,
    borderColor: colors.ink,
    backgroundColor: colors.tan,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: border.thin,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  priceRow: { flexDirection: 'row', gap: space.sm },
  priceField: { flex: 1 },
  payout: { gap: space.md },
  payoutTitle: { ...type.section, color: colors.ink },
  table: {
    borderRadius: radius.card - 2,
    borderWidth: border.thin,
    borderColor: colors.ink,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  tableDivider: { borderTopWidth: 1.5, borderTopColor: colors.divider },
  rowLabel: { ...type.bodySm, color: colors.muted, flexShrink: 1 },
  rowValue: { ...type.label, color: colors.ink },
  keepRow: { backgroundColor: colors.green, borderTopWidth: border.thin, borderTopColor: colors.ink },
  keepText: { ...type.section, fontFamily: fonts.black, fontSize: KEEP_SIZE, lineHeight: KEEP_SIZE + 4, letterSpacing: 0, color: colors.ink },
  callout: { backgroundColor: colors.lime },
  calloutText: { ...type.labelSm, fontFamily: fonts.regular, lineHeight: 18, color: colors.ink },
  calloutStrong: { fontFamily: fonts.black },
})
