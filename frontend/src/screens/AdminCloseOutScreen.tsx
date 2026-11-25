import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { RootStackParamList } from '../navigation'
import { closeOutBooking } from '../services/adminApi'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Chip from '../components/mockup/Chip'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import { GroupLabel } from '../components/mockup/RowGroup'
import { toast } from '../services/toast'
import { useSubmit } from '../hooks/useSubmit'
import { FieldErrors, hasErrors, validateResolution } from '../utils/formValidation'

type ScreenRoute = RouteProp<RootStackParamList, 'AdminCloseOut'>

/** D-1: complete a rental that wasn't returned (or whose return was never
 *  confirmed), optionally charging the deposit hold. */
export default function AdminCloseOutScreen() {
  const nav = useNavigation()
  const { bookingId, listingTitle, depositAmount } = useRoute<ScreenRoute>().params
  const queryClient = useQueryClient()
  const depositDollars = Number(depositAmount)
  const canCharge = depositDollars > 0
  const [charge, setCharge] = useState(false)
  const [amount, setAmount] = useState(canCharge ? depositDollars.toFixed(2) : '')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'resolution' | 'notes' | 'amount'>>({})

  const [submit, busy] = useSubmit(async () => {
    const nextErrors = validateResolution({
      resolution: 'close-out',
      notes,
      minNotes: 1,
      amount: charge ? { input: amount, capDollars: depositDollars } : undefined,
    })
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return
    try {
      await closeOutBooking(bookingId, {
        notes: notes.trim(),
        ...(charge ? { depositCaptureCents: Math.round(Number(amount) * 100) } : {}),
      })
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast.success('Rental closed out.')
      nav.goBack()
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't close out this rental. Please try again." })
    }
  })

  return (
    <Screen
      header={<ScreenHeader title="Close out rental" back />}
      footer={<Button label="Close out" onPress={submit} loading={busy} />}
    >
      <View style={styles.content}>
        <Card shadow={false} contentStyle={styles.stack}>
          {listingTitle ? <Text style={styles.title}>{listingTitle}</Text> : null}
          <Text style={styles.body}>
            This completes the booking. The owner's payout follows the usual schedule, and either person can still
            open a dispute in the next 24 hours.
          </Text>
        </Card>

        {canCharge ? (
          <>
            <GroupLabel>Deposit</GroupLabel>
            <View style={styles.chips}>
              <Chip label="Release the deposit" active={!charge} onPress={busy ? undefined : () => setCharge(false)} />
              <Chip label="Charge the deposit" active={charge} onPress={busy ? undefined : () => setCharge(true)} />
            </View>
            {charge ? (
              <View style={styles.stack}>
                <TextField
                  label="Deposit charge amount"
                  value={amount}
                  onChangeText={(value) => {
                    setAmount(value)
                    setErrors((current) => ({ ...current, amount: undefined }))
                  }}
                  editable={!busy}
                  kind="money"
                  placeholder="0.00"
                  variant="boxed"
                  error={errors.amount}
                  validated
                />
                <Text style={styles.caption}>
                  Up to the deposit of ${depositDollars.toFixed(2)}. It goes to the owner in full. A charge is only allowed once the
                  rental is overdue (from the end of the day after its last day); before then, close it out without one.
                </Text>
              </View>
            ) : (
              <Text style={styles.caption}>The hold is released 24 hours after the close-out, unless a dispute is opened.</Text>
            )}
          </>
        ) : null}

        <TextField
          label="Why are you closing this out?"
          value={notes}
          onChangeText={(value) => {
            setNotes(value)
            setErrors((current) => ({ ...current, notes: undefined }))
          }}
          error={errors.notes}
          validated
          editable={!busy}
          multiline
          variant="boxed"
          placeholder="Recorded on the booking's audit trail."
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.lg },
  stack: { gap: space.sm },
  title: { ...type.section, color: colors.ink },
  body: { ...type.bodySm, color: colors.muted },
  caption: { ...type.caption, color: colors.mutedAlt },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
