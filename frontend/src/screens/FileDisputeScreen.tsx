import React, { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { DEPOSIT_HOLD_HOURS } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { createDispute } from '../services/disputesApi'
import { queryClient } from '../services/queryClient'
import { queryKeys } from '../services/queryKeys'
import { DisputeReason } from '../types'
import { colors } from '../theme/colors'
import { radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Chip from '../components/mockup/Chip'
import InkCard from '../components/mockup/InkCard'
import TextField from '../components/mockup/TextField'
import Button from '../components/mockup/Button'
import { toast } from '../services/toast'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'FileDispute'>

const MIN_DESCRIPTION_LENGTH = 10

const REASON_OPTIONS: { value: DisputeReason; label: string }[] = [
  { value: 'ITEM_DAMAGED', label: 'Item was damaged' },
  { value: 'ITEM_NOT_RETURNED', label: 'Item was not returned' },
  { value: 'ITEM_NOT_AS_DESCRIBED', label: 'Item not as described' },
  { value: 'PAYMENT_ISSUE', label: 'Payment issue' },
  { value: 'OTHER', label: 'Other' },
]

export default function FileDisputeScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { bookingId, listingTitle } = route.params

  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    if (!reason) {
      Alert.alert('Choose a reason', 'Please select what went wrong.')
      return
    }

    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      Alert.alert('More detail needed', `Please describe the issue in at least ${MIN_DESCRIPTION_LENGTH} characters.`)
      return
    }

    setBusy(true)
    try {
      await createDispute({ bookingId, reason, description: description.trim() })
      queryClient.invalidateQueries({ queryKey: queryKeys.booking(bookingId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingDispute(bookingId) })
      toast.success("Problem reported. We'll review it and let you both know.")
      nav.goBack()
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't send your report. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      keyboardAvoiding
      header={<ScreenHeader title="Report a problem" back />}
      contentStyle={styles.content}
      footer={<Button label="Submit report" onPress={handleSubmit} loading={busy} />}
    >
      {listingTitle ? (
        <Card shadow={false} padding={space.lg} contentStyle={styles.summary}>
          <View style={styles.summaryIcon}>
            <Feather name="package" size={22} color={colors.ink} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.summaryTitle} numberOfLines={2}>{listingTitle}</Text>
            <Text style={styles.caption}>This booking</Text>
          </View>
        </Card>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>What went wrong?</Text>
        <View style={styles.chips}>
          {REASON_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={reason === option.value}
              onPress={busy ? undefined : () => setReason(option.value)}
            />
          ))}
        </View>
      </View>

      <TextField
        label="Details"
        value={description}
        onChangeText={setDescription}
        editable={!busy}
        multiline
        maxLength={1000}
        placeholder="Describe what happened, including any relevant dates or details."
      />

      {/* From disputeService / cleanupJob: an admin resolves the dispute, and
          both the deposit auto-release and the owner payout skip a booking
          whose dispute is OPEN or UNDER_REVIEW. No review time is set in code. */}
      <InkCard title="What happens next">
        <NextStep icon="shield" text="The Zoink team reviews your report and decides the outcome." />
        <NextStep icon="lock" text="The deposit stays on hold while the report is open." />
        <NextStep icon="clock" text="The owner's payout waits until it's resolved." />
        <NextStep icon="alert-circle" text={`After a return, reports must come in within ${DEPOSIT_HOLD_HOURS}h.`} />
      </InkCard>
    </Screen>
  )
}

function NextStep({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  return (
    <View style={styles.step}>
      <Feather name={icon} size={16} color={colors.green} style={styles.stepIcon} />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.xxl,
  },
  flex: {
    flex: 1,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.thumb,
    backgroundColor: colors.tan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  caption: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  field: {
    gap: space.sm,
  },
  label: {
    ...type.labelSm,
    color: colors.ink,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  step: {
    flexDirection: 'row',
    gap: space.md,
  },
  stepIcon: {
    marginTop: 2,
  },
  stepText: {
    ...type.bodySm,
    color: colors.onInkMuted,
    flex: 1,
  },
})
