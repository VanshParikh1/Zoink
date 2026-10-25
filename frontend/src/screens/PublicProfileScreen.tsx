import React from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getPublicProfile } from '../services/usersApi'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../services/queryKeys'
import { useAuth } from '../context/AuthContext'
import { PublicProfile } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import ProfileHeader, { overallRating } from '../components/mockup/ProfileHeader'
import Card from '../components/mockup/Card'
import Badge from '../components/mockup/Badge'
import Button from '../components/mockup/Button'
import { GroupLabel, ListRow, RowGroup } from '../components/mockup/RowGroup'
import { confirmBlockUser } from '../utils/confirmBlockUser'
import { DetailFallbackScreen, DetailLoadingScreen, isWaitingOffline } from '../components/LoadStates'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'PublicProfile'>

export default function PublicProfileScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const profileQuery = useQuery({
    queryKey: queryKeys.publicProfile(route.params.userId),
    queryFn: () => getPublicProfile(route.params.userId),
  })
  const profile: PublicProfile | null = profileQuery.data ?? null
  const loading = profileQuery.isPending

  // Presented as a modal: a page sheet on iOS (nothing under it to clear),
  // full screen on Android (Screen's usual status-bar inset applies).
  const sheet = Platform.OS === 'ios'
  const header = (
    <View style={sheet ? styles.sheetTop : null}>
      <ScreenHeader title="Profile" back />
    </View>
  )

  if (loading && !isWaitingOffline(profileQuery)) return <DetailLoadingScreen title="Profile" header={header} edgeToEdgeTop={sheet} />

  if (!profile) {
    return (
      <DetailFallbackScreen
        query={profileQuery}
        title="Profile"
        what="this profile"
        header={header}
        edgeToEdgeTop={sheet}
        unavailable={{ title: "This profile isn't available.", body: 'The account may have been closed.' }}
      />
    )
  }

  const isSelf = profile.id === user?.id
  const name = `${profile.firstName} ${profile.lastName}`
  const reputation = profile.reputation
  const rating = overallRating(profile)
  const reviewCount = reputation?.reviewsReceivedCount ?? 0
  // Only demo data carries review text; the real API sends aggregates.
  const highlights = profile.reviewHighlights?.slice(0, 3) ?? []

  return (
    <Screen edgeToEdgeTop={sheet} header={header} contentStyle={styles.content}>
      <ProfileHeader
        profile={profile}
        caption={profile.verificationStatus === 'VERIFIED' ? 'Verified student' : 'Student'}
      />

      <View style={styles.sectionHead}>
        <GroupLabel>Reviews</GroupLabel>
        {rating ? (
          <Badge label={`${rating} · ${reviewCount} review${reviewCount === 1 ? '' : 's'}`} icon={<Stars value={Number(rating)} />} />
        ) : null}
      </View>
      {highlights.length > 0 ? (
        highlights.map((highlight) => (
          <Card key={highlight.id} shadow={false} padding={space.xxl} contentStyle={styles.review}>
            <Text style={styles.reviewQuote}>"{highlight.quote}"</Text>
            <Text style={styles.reviewLabel}>{highlight.label}</Text>
          </Card>
        ))
      ) : (
        <Text style={styles.empty}>{reviewCount === 0 ? 'No reviews yet.' : `${reviewCount} review${reviewCount === 1 ? '' : 's'} so far.`}</Text>
      )}

      <GroupLabel>As a lender</GroupLabel>
      <RowGroup>
        <ListRow icon="check-square" label="Accuracy" right={<Score value={reputation?.lenderAccuracyAvg} />} />
        <ListRow icon="box" label="Condition" right={<Score value={reputation?.lenderConditionAvg} />} />
        {/* lenderCommunicationAvg is the "Pickup Experience" score (scoreC for RENTER-role reviews). */}
        <ListRow icon="map-pin" label="Pickup experience" right={<Score value={reputation?.lenderCommunicationAvg} />} />
      </RowGroup>

      <GroupLabel>As a borrower</GroupLabel>
      <RowGroup>
        <ListRow icon="clock" label="Reliability" right={<Score value={reputation?.renterReliabilityAvg} />} />
        <ListRow icon="heart" label="Care" right={<Score value={reputation?.renterCareAvg} />} />
        <ListRow icon="message-circle" label="Communication" right={<Score value={reputation?.renterCommunicationAvg} />} />
      </RowGroup>

      {!isSelf ? (
        <View style={styles.safety}>
          <Button
            label="Report this user"
            variant="link"
            onPress={() =>
              nav.navigate('FileReport', {
                targetType: 'USER',
                targetId: profile.id,
                targetLabel: name,
              })
            }
          />
          <Button
            label="Block this user"
            variant="link"
            onPress={() =>
              // Pop to the root: whatever led here (their listing, a thread
              // with them) is hidden once they're blocked.
              confirmBlockUser({ id: profile.id, name }, () => nav.popToTop())
            }
          />
        </View>
      ) : null}
    </Screen>
  )
}

/** Five Feather stars, the first `value` (rounded) in ink. */
function Stars({ value }: { value: number }) {
  const filled = Math.round(value)
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Feather key={n} name="star" size={12} color={n <= filled ? colors.ink : colors.mutedAlt} />
      ))}
    </View>
  )
}

function Score({ value }: { value: number | null | undefined }) {
  return <Text style={styles.score}>{value == null ? 'New' : `${value.toFixed(1)} / 5`}</Text>
}

const styles = StyleSheet.create({
  sheetTop: {
    paddingTop: space.screen,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: space.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  review: {
    gap: space.sm,
  },
  reviewQuote: {
    ...type.bodySm,
    color: colors.ink,
  },
  reviewLabel: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  empty: {
    ...type.bodySm,
    color: colors.mutedAlt,
  },
  score: {
    ...type.label,
    color: colors.greenText,
  },
  safety: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xxl,
    marginTop: space.lg,
  },
})
