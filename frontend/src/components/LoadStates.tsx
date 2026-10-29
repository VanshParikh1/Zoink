import React from 'react'
import { StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation'
import { isUnavailable, userMessage } from '../utils/userMessage'
import Screen from './mockup/Screen'
import ScreenHeader from './mockup/ScreenHeader'
import StatePanel from './mockup/StatePanel'
import { DetailSkeleton } from './mockup/Skeleton'

// The loading, offline and failed states every data screen shows, in one
// place so they read the same everywhere.

type QueryLike = {
  error: unknown
  isPending: boolean
  isPaused: boolean
  refetch: () => unknown
}

/** Every booking screen's words for a booking that's gone or isn't this person's. */
export const BOOKING_UNAVAILABLE = {
  title: "This booking isn't available.",
  body: "It may have been removed, or it belongs to another account. Your own rentals and requests are on Home.",
}

/** …and for a listing that's been deleted (soft-deleted ones answer 404 too) or never existed. */
export const LISTING_UNAVAILABLE = {
  title: 'This listing is no longer available.',
  body: 'The owner may have removed it. There are plenty more nearby on Home.',
}

/**
 * Nothing cached and waiting for the connection to come back (React Query
 * pauses it while offline). Reads isPaused, not fetchStatus, which would
 * re-render the screen on every poll.
 */
export function isWaitingOffline(query: Pick<QueryLike, 'isPending' | 'isPaused'>) {
  return query.isPending && query.isPaused
}

/**
 * Why a list or section couldn't load, with a retry. `what` names it:
 * "your listings", "this conversation".
 */
export function LoadFailedPanel({
  error,
  offline = false,
  what,
  onRetry,
}: {
  error: unknown
  offline?: boolean
  what: string
  onRetry: () => unknown
}) {
  return offline ? (
    <StatePanel
      title="You're offline."
      body={`${capitalize(what)} will load when you're back online.`}
      action={{ label: 'Try again', onPress: () => void onRetry(), variant: 'primary' }}
    />
  ) : (
    <StatePanel
      title={`Couldn't load ${what}.`}
      body={userMessage(error)}
      action={{ label: 'Try again', onPress: () => void onRetry(), variant: 'primary' }}
    />
  )
}

type ScreenChrome = {
  /** Replaces the default header (title and Back), e.g. for a sheet. */
  header?: React.ReactNode
  edgeToEdgeTop?: boolean
}

/** A detail screen's placeholder while its first load is in flight. */
export function DetailLoadingScreen({ title, hero = false, header, edgeToEdgeTop }: { title: string; hero?: boolean } & ScreenChrome) {
  return (
    <Screen header={header ?? <ScreenHeader title={title} back />} edgeToEdgeTop={edgeToEdgeTop}>
      <DetailSkeleton hero={hero} />
    </Screen>
  )
}

/**
 * A detail screen that has nothing to show: offline with nothing cached, the
 * thing is gone or isn't this person's (a stale link, a deleted listing),
 * or the load failed. Always has Back, and a way on.
 */
export function DetailFallbackScreen({
  query,
  title,
  what,
  unavailable,
  header,
  edgeToEdgeTop,
}: {
  query: QueryLike
  title: string
  /** For the failed state: "this booking". */
  what: string
  /** For a 404/403/400: what to say instead of an error. */
  unavailable: { title: string; body: string }
} & ScreenChrome) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const home = () => nav.navigate('MainApp', { tab: 'Home' })
  const panel =
    query.error && isUnavailable(query.error) ? (
      <StatePanel title={unavailable.title} body={unavailable.body} action={{ label: 'Go to Home', onPress: home, variant: 'primary' }} />
    ) : (
      <LoadFailedPanel error={query.error} offline={isWaitingOffline(query)} what={what} onRetry={query.refetch} />
    )
  return (
    <Screen scroll={false} header={header ?? <ScreenHeader title={title} back />} edgeToEdgeTop={edgeToEdgeTop} contentStyle={styles.centered}>
      {panel}
    </Screen>
  )
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
  },
})
