// Dev-only: registered in navigation/index.tsx behind __DEV__, so this file is
// dropped from production bundles.
import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import HardShadow from '../components/mockup/HardShadow'
import Button from '../components/mockup/Button'
import IconButton from '../components/mockup/IconButton'
import Chip from '../components/mockup/Chip'
import Badge from '../components/mockup/Badge'
import TextField from '../components/mockup/TextField'
import OtpInput from '../components/mockup/OtpInput'
import Card from '../components/mockup/Card'
import InkCard from '../components/mockup/InkCard'
import PriceTable from '../components/mockup/PriceTable'
import LogoPill from '../components/mockup/LogoPill'
import HighlightText from '../components/mockup/HighlightText'
import Thumb from '../components/mockup/Thumb'
import ListingGridCard from '../components/mockup/ListingGridCard'
import { ListingCardData } from '../components/mockup/listingFormat'

const CATEGORIES = ['All', 'Cameras', 'Tools', 'Outdoors']

const SAMPLE_PHOTO = 'https://images.unsplash.com/photo-1589003077984-894e133dabab?auto=format&fit=crop&w=1200&q=80'

const GRID_SAMPLES: { key: string; listing: ListingCardData }[] = [
  {
    key: 'photo',
    listing: { title: 'JBL PartyBox speaker', category: 'Audio/Video', dailyPrice: '24', depositAmount: '0', distanceKm: 1.2, images: [{ id: 'g1', url: SAMPLE_PHOTO, order: 0 }] },
  },
  {
    key: 'no-photo',
    listing: { title: 'Cordless drill', category: 'Tools', dailyPrice: '9.5', depositAmount: '0', distanceKm: null, images: [] },
  },
  {
    key: 'deposit',
    listing: { title: 'Sony a6400 camera', category: 'Cameras', dailyPrice: '38', depositAmount: '150', distanceKm: 3.4, images: [{ id: 'g2', url: SAMPLE_PHOTO, order: 0 }] },
  },
  {
    key: 'long-title',
    listing: { title: 'Heat gun + soldering station with spare tips, stand and a carry case', category: 'Tools', dailyPrice: '8', depositAmount: '14', distanceKm: 94, images: [] },
  },
]

// Throws while rendering, to exercise the top-level ErrorBoundary.
function Crash(): null {
  throw new Error('Design gallery test crash')
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{title}</Text>
      {children}
    </View>
  )
}

export default function DesignGalleryScreen() {
  const [crash, setCrash] = useState(false)
  const [chip, setChip] = useState('All')
  const [otp, setOtp] = useState('')
  const [otpDone, setOtpDone] = useState<string | null>(null)
  const [presses, setPresses] = useState(0)
  const [email, setEmail] = useState('')
  const [gridWidth, setGridWidth] = useState(0)
  const gridCell = gridWidth ? Math.floor((gridWidth - space.lg) / 2) : 0

  const pressed = () => setPresses((n) => n + 1)

  return (
    <Screen glow="topRight" header={<ScreenHeader title="Design gallery" back right={<LogoPill size="sm" />} />}>
      <Section title="Error boundary">
        <Button label="Throw a test error" variant="secondary" onPress={() => setCrash(true)} />
        {crash ? <Crash /> : null}
      </Section>

      <Section title="Type">
        <Text style={[type.display, styles.ink]}>Display 40</Text>
        <Text style={[type.h1, styles.ink]}>Heading h1 32</Text>
        <Text style={[type.h2, styles.ink]}>Heading h2 26</Text>
        <Text style={[type.section, styles.ink]}>Section 20</Text>
        <Text style={[type.body, styles.ink]}>Body 16 regular, Fira Sans.</Text>
        <Text style={[type.bodySm, styles.ink]}>Body small 15 regular.</Text>
        <Text style={[type.label, styles.ink]}>Label 14 bold</Text>
        <Text style={[type.labelSm, styles.ink]}>Label small 13 bold</Text>
        <Text style={[type.caption, styles.muted]}>Caption 12 regular</Text>
        <Text style={type.price}>$24 / day</Text>
        <Text style={[type.eyebrow, styles.muted]}>Eyebrow mono 11</Text>
      </Section>

      <Section title="HighlightText (single line)">
        <HighlightText>Don&apos;t buy, zoink it.</HighlightText>
        <HighlightText style={[type.section, styles.ink]} bandColor={colors.lime}>
          Lime band on section
        </HighlightText>
      </Section>

      <Section title="HardShadow">
        <View style={styles.row}>
          {(['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const).map((k) => (
            <HardShadow key={k} offset={k} radius={12}>
              <View style={styles.swatch}>
                <Text style={[type.labelSm, styles.ink]}>{k}</Text>
              </View>
            </HardShadow>
          ))}
        </View>
        <View style={styles.row}>
          <HardShadow offset="lg" color={colors.green} radius={12} rotate={-3}>
            <View style={styles.swatchWide}>
              <Text style={[type.labelSm, styles.ink]}>rotate -3</Text>
            </View>
          </HardShadow>
          <HardShadow offset="lg" radius={12} pressable onPress={pressed}>
            <View style={styles.swatchWide}>
              <Text style={[type.labelSm, styles.ink]}>press me</Text>
            </View>
          </HardShadow>
          <HardShadow offset="lg" radius={12} disabled>
            <View style={styles.swatchWide}>
              <Text style={[type.labelSm, styles.ink]}>disabled</Text>
            </View>
          </HardShadow>
        </View>
        <Text style={[type.caption, styles.muted]}>Presses: {presses}</Text>
      </Section>

      <Section title="Button">
        <Button label="Request to rent" onPress={pressed} />
        <Button label="Zoink it" variant="zoink" onPress={pressed} />
        <Button label="Message owner" variant="secondary" onPress={pressed} />
        <Button label="Forgot password?" variant="link" onPress={pressed} />
        <Button
          label="With icon"
          onPress={pressed}
          leftIcon={<Feather name="send" size={18} color={colors.green} />}
        />
        <Text style={[type.labelSm, styles.muted]}>Loading</Text>
        <Button label="Primary" loading onPress={pressed} />
        <Button label="Zoink" variant="zoink" loading onPress={pressed} />
        <Button label="Secondary" variant="secondary" loading onPress={pressed} />
        <Text style={[type.labelSm, styles.muted]}>Disabled</Text>
        <Button label="Primary disabled" disabled onPress={pressed} />
        <Button label="Zoink disabled" variant="zoink" disabled onPress={pressed} />
        <Button label="Secondary disabled" variant="secondary" disabled onPress={pressed} />
        <Button label="Link disabled" variant="link" disabled onPress={pressed} />
      </Section>

      <Section title="IconButton">
        <View style={styles.row}>
          <IconButton accessibilityLabel="Back" onPress={pressed}>
            <Feather name="chevron-left" size={24} color={colors.ink} />
          </IconButton>
          <IconButton accessibilityLabel="Search" onPress={pressed}>
            <Feather name="search" size={20} color={colors.ink} />
          </IconButton>
          <IconButton accessibilityLabel="Share" onPress={pressed}>
            <Feather name="share" size={20} color={colors.ink} />
          </IconButton>
          <IconButton accessibilityLabel="Disabled" onPress={pressed} disabled>
            <Feather name="heart" size={20} color={colors.ink} />
          </IconButton>
        </View>
      </Section>

      <Section title="Chip">
        <View style={styles.row}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={chip === c} onPress={() => setChip(c)} />
          ))}
        </View>
      </Section>

      <Section title="Badge">
        <View style={styles.row}>
          <Badge label="Lime" variant="lime" />
          <Badge label="Green" variant="green" />
          <Badge label="Surface" variant="surface" />
          <Badge label="Ink green" variant="inkGreen" />
        </View>
        <View style={styles.row}>
          <Badge label="1.2 km" variant="lime" size={13} icon={<Feather name="map-pin" size={12} color={colors.ink} />} />
          <Badge label="Verified" variant="green" size={13} icon={<Feather name="check" size={12} color={colors.ink} />} />
          <Badge label="4.9" variant="surface" size={13} icon={<Feather name="star" size={12} color={colors.ink} />} />
          <Badge label="Live" variant="inkGreen" size={13} icon={<Feather name="zap" size={12} color={colors.green} />} />
        </View>
      </Section>

      <Section title="TextField">
        <TextField
          label="Student email"
          placeholder="you@mail.utoronto.ca"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          leftIcon={<Feather name="mail" size={18} color={colors.mutedAlt} />}
        />
        <TextField label="Password" placeholder="Min 8 characters" secureTextEntry error="Password is too short." />
        <View style={styles.row}>
          <TextField label="Daily price" placeholder="0" keyboardType="decimal-pad" variant="boxed" style={styles.flex} />
          <TextField label="Deposit" placeholder="0" keyboardType="decimal-pad" variant="boxed" style={styles.flex} />
        </View>
      </Section>

      <Section title="OtpInput">
        <OtpInput
          value={otp}
          onChange={(code) => {
            setOtp(code)
            if (code.length < 6) setOtpDone(null)
          }}
          onComplete={setOtpDone}
        />
        <Text style={[type.caption, styles.muted]}>
          {otpDone ? `onComplete fired: ${otpDone}` : 'Type or paste a 6-digit code'}
        </Text>
      </Section>

      <Section title="Card">
        <Card>
          <Text style={[type.section, styles.ink]}>Card md (default)</Text>
          <Text style={[type.bodySm, styles.muted]}>Surface, 2.5 border, radius 18.</Text>
        </Card>
        <Card radius="cardLg" shadow="xl">
          <Text style={[type.section, styles.ink]}>Card lg, shadow xl</Text>
        </Card>
        <Card shadow={false}>
          <Text style={[type.section, styles.ink]}>Card, no shadow</Text>
        </Card>
      </Section>

      <Section title="InkCard">
        <InkCard title="Both tap within 5 min" body="Owner and renter each tap Zoink It to confirm the handoff." />
        <InkCard title="Rotated" body="rotate={2}" rotate={2} />
      </Section>

      <Section title="PriceTable">
        <Card>
          <PriceTable
            rows={[
              { label: '$24 x 3 days', value: '$72.00' },
              { label: 'Deposit hold', value: '$150.00' },
              { label: 'HST (13%)', value: '$9.36' },
            ]}
            total={{ label: 'Total', value: '$231.36' }}
            highlight="lime"
          />
        </Card>
        <Card>
          <PriceTable rows={[{ label: 'Rental price', value: '$72.00' }, { label: 'Platform fee', value: '-$7.20' }]} total={{ label: 'Payout', value: '$64.80' }} highlight="green" />
        </Card>
        <Card>
          <PriceTable rows={[{ label: 'Rental total', value: '$72.00' }]} total={{ label: 'Total', value: '$72.00' }} />
        </Card>
      </Section>

      <Section title="LogoPill">
        <View style={styles.row}>
          <LogoPill size="sm" />
          <LogoPill size="md" />
          <LogoPill size="lg" />
        </View>
      </Section>

      <Section title="ListingGridCard">
        <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {gridCell > 0
            ? GRID_SAMPLES.map((sample) => (
                <ListingGridCard key={sample.key} listing={sample.listing} width={gridCell} onPress={pressed} />
              ))
            : null}
          {gridCell > 0 ? <ListingGridCard.Skeleton width={gridCell} /> : null}
        </View>
      </Section>

      <Section title="Thumb">
        <View style={styles.row}>
          <Thumb size={40} />
          <Thumb size={56} initials="MP" />
          <Thumb size={72} initials="VA" />
          <Thumb size={72} source={require('../../assets/logo.png')} />
        </View>
      </Section>
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: space.lg,
    marginBottom: 28,
  },
  eyebrow: {
    ...type.eyebrow,
    color: colors.mutedAlt,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.lg,
    rowGap: space.xl,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.mutedAlt,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchWide: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
