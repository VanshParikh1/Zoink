import React from 'react'
import { createNavigationContainerRef, NavigationContainer, StackActions } from '@react-navigation/native'
import { createNativeStackNavigator, NativeStackNavigationOptions, NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { ParamListBase, RouteProp } from '@react-navigation/native'
import { TERMS_VERSION, PRIVACY_VERSION, University } from '@zoink/shared'
import { useAuth } from '../context/AuthContext'
import LoadingGate from '../components/mockup/LoadingGate'
import { getFirstPendingReview } from '../services/reviewsApi'
import { useQuery } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { queryKeys } from '../services/queryKeys'
import ErrorBoundary from '../components/mockup/ErrorBoundary'
import { DeepLinkTarget, setDeepLinkOpener } from './deepLinks'
import { useDeepLinkSources } from './useDeepLinks'

// Screens shown first (signed out, verifying, the main tabs) load with the
// app; every other screen's module loads the first time it's opened
// (getComponent below), which keeps Stripe, the image picker, maps and the
// photo viewer off the startup path.
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import TermsAcceptanceScreen from '../screens/TermsAcceptanceScreen'
import VerifyEmailScreen from '../screens/VerifyEmailScreen'
import VerificationGateScreen from '../screens/VerificationGateScreen'
import MainAppScreen from '../screens/MainAppScreen'

// Held on RegisterScreen while the user goes through TermsAcceptance, so a
// cancel/error round-trip doesn't lose what they typed. Password is carried
// in memory only — never persisted to storage.
export type PendingRegistration = {
  email: string
  password: string
  firstName: string
  lastName: string
  phone: string
  university: University
}

export type RootStackParamList = {
  Login: undefined
  Register: { pendingRegistration?: PendingRegistration; errorMessage?: string } | undefined
  TermsAcceptance: { mode: 'register' | 'update' | 'view'; pendingRegistration?: PendingRegistration; initialTab?: 'terms' | 'privacy' }
  VerifyEmail: undefined
  VerificationGate: undefined
  MainApp: { tab?: 'Home' | 'Search' | 'Inbox' | 'MyProfile'; searchCategory?: string } | undefined
  CreateListing: undefined
  ListingDetail: { listingId: string }
  EditListing: { listingId: string }
  MyListings: undefined
  BookingRequest: { listingId: string }
  Pay: { bookingId: string }
  BookingHistory: undefined
  BookingRequests: undefined
  BookingDetail: { bookingId: string }
  FileDispute: { bookingId: string; listingTitle?: string }
  AdminDisputes: undefined
  AdminDisputeDetail: { disputeId: string }
  FileReport: { targetType: import('../types').ReportTargetType; targetId: string; targetLabel?: string }
  AdminReports: undefined
  ActiveRental: { bookingId: string }
  ZoinkIt: { bookingId: string; mode: 'pickup' | 'return' }
  PhotoViewer: { photos: string[]; initialIndex: number }
  ReviewPrompt: { review: import('../types').PendingReview }
  Inbox: undefined
  MyProfile: undefined
  Settings: undefined
  PublicProfile: { userId: string }
  ConversationThread: { conversationId: string; title?: string }
  LinkNotFound: undefined
  DesignGallery: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

// Every screen gets its own error boundary: a screen that fails to render
// shows "Go back" and "Try again" instead of taking the app down (the main
// tabs have one each as well, see MainAppScreen; App.tsx has the last one).
function screenLayout({
  children,
  navigation,
  route,
}: {
  children: React.ReactElement
  navigation: NativeStackNavigationProp<ParamListBase>
  route: RouteProp<ParamListBase>
}) {
  return (
    <ErrorBoundary scope="screen" name={route.name} onGoBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}>
      {children}
    </ErrorBoundary>
  )
}

const stackOptions: NativeStackNavigationOptions = { headerShown: false }

// A link or notification tap opens on top of what's showing, so Back returns
// there (on a cold start, to the main tabs underneath). Waits for the
// navigator if it's still mounting.
function openDeepLink(target: DeepLinkTarget, attempts = 0) {
  if (!navigationRef.isReady() || !navigationRef.getRootState()?.routeNames.includes('MainApp')) {
    if (attempts < 50) setTimeout(() => openDeepLink(target, attempts + 1), 100)
    return
  }
  navigationRef.dispatch(StackActions.push(target.screen, target.params))
}

function VerifiedAppStack() {
  // Started as soon as the session was restored (AuthContext prefetches it),
  // so it usually arrives while fonts are still loading.
  const reviewQuery = useQuery({ queryKey: queryKeys.firstPendingReview, queryFn: getFirstPendingReview })
  const initialReview = reviewQuery.data ?? null
  const stackMounted = !reviewQuery.isPending

  // Links and notification taps open here once this stack is up, including
  // any that arrived before sign-in (navigation/deepLinks.ts).
  React.useEffect(() => {
    if (!stackMounted) return
    setDeepLinkOpener(openDeepLink)
    return () => setDeepLinkOpener(null)
  }, [stackMounted])

  if (reviewQuery.isPending) {
    return (
      <LoadingGate />
    )
  }

  return (
    <Stack.Navigator
      screenOptions={stackOptions}
      screenLayout={screenLayout}
      initialRouteName={initialReview ? 'ReviewPrompt' : 'MainApp'}
    >
      <Stack.Screen name="MainApp" component={MainAppScreen} />
      <Stack.Screen name="CreateListing" getComponent={() => require('../screens/CreateListingScreen').default} />
      <Stack.Screen name="ListingDetail" getComponent={() => require('../screens/ListingDetailScreen').default} />
      <Stack.Screen name="EditListing" getComponent={() => require('../screens/EditListingScreen').default} />
      <Stack.Screen name="MyListings" getComponent={() => require('../screens/MyListingsScreen').default} />
      <Stack.Screen name="BookingRequest" getComponent={() => require('../screens/BookingRequestScreen').default} />
      <Stack.Screen name="Pay" getComponent={() => require('../screens/PayScreen').default} />
      <Stack.Screen name="BookingHistory" getComponent={() => require('../screens/BookingHistoryScreen').default} />
      <Stack.Screen name="BookingRequests" getComponent={() => require('../screens/BookingRequestsScreen').default} />
      <Stack.Screen name="BookingDetail" getComponent={() => require('../screens/BookingDetailScreen').default} />
      <Stack.Screen name="FileDispute" getComponent={() => require('../screens/FileDisputeScreen').default} />
      <Stack.Screen name="AdminDisputes" getComponent={() => require('../screens/AdminDisputesScreen').default} />
      <Stack.Screen name="AdminDisputeDetail" getComponent={() => require('../screens/AdminDisputeDetailScreen').default} />
      <Stack.Screen name="FileReport" getComponent={() => require('../screens/FileReportScreen').default} />
      <Stack.Screen name="AdminReports" getComponent={() => require('../screens/AdminReportsScreen').default} />
      <Stack.Screen name="ActiveRental" getComponent={() => require('../screens/ActiveRentalScreen').default} />
      <Stack.Screen name="ZoinkIt" getComponent={() => require('../screens/ZoinkItScreen').default} />
      <Stack.Screen
        name="PhotoViewer"
        getComponent={() => require('../screens/PhotoViewerScreen').default}
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen 
        name="ReviewPrompt" 
        getComponent={() => require('../screens/ReviewPromptScreen').default} 
        initialParams={initialReview ? { review: initialReview } : undefined} 
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="Inbox" getComponent={() => require('../screens/InboxScreen').default} />
      <Stack.Screen name="MyProfile" getComponent={() => require('../screens/MyProfileScreen').default} />
      <Stack.Screen name="Settings" getComponent={() => require('../screens/SettingsScreen').default} />
      <Stack.Screen 
        name="PublicProfile" 
        getComponent={() => require('../screens/PublicProfileScreen').default} 
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="ConversationThread" getComponent={() => require('../screens/ConversationThreadScreen').default} />
      <Stack.Screen
        name="TermsAcceptance"
        component={TermsAcceptanceScreen}
        initialParams={{ mode: 'view' }}
      />
      <Stack.Screen name="LinkNotFound" getComponent={() => require('../screens/LinkNotFoundScreen').default} />
      {/* Dev-only. __DEV__ is false in release bundles, so Metro drops this
          branch and the require with it; the gallery never ships. */}
      {__DEV__ ? (
        <Stack.Screen
          name="DesignGallery"
          getComponent={() => require('../screens/DesignGalleryScreen').default}
        />
      ) : null}
    </Stack.Navigator>
  )
}

function hideSplash() {
  SplashScreen.hideAsync().catch(() => {})
}

export default function Navigation({ fontsReady }: { fontsReady: boolean }) {
  // Never leave the splash up for good: if the first screen is slow (fonts,
  // the session or the review check stuck on the network), the loading
  // screen shows after a few seconds as it used to.
  React.useEffect(() => {
    const timer = setTimeout(hideSplash, 6000)
    return () => clearTimeout(timer)
  }, [])

  const { user, isLoading } = useAuth()
  useDeepLinkSources()

  // Don't render anything until we've checked SecureStore and the fonts are in
  if (isLoading || !fontsReady) {
    return (
      <LoadingGate />
    )
  }

  return (
    // The first navigator to mount is the first real screen: the splash
    // (held since launch, see App.tsx) hides then, with nothing in between.
    <NavigationContainer ref={navigationRef} onReady={hideSplash}>
      {!user ? (
        <Stack.Navigator screenOptions={stackOptions} screenLayout={screenLayout}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="TermsAcceptance" component={TermsAcceptanceScreen} />
        </Stack.Navigator>
      ) : user.verificationStatus !== 'VERIFIED' ? (
        <Stack.Navigator screenOptions={stackOptions} screenLayout={screenLayout}>
          <Stack.Screen name="VerificationGate" component={VerificationGateScreen} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        </Stack.Navigator>
      ) : user.termsVersion !== TERMS_VERSION || user.privacyVersion !== PRIVACY_VERSION ? (
        <Stack.Navigator screenOptions={stackOptions} screenLayout={screenLayout}>
          <Stack.Screen
            name="TermsAcceptance"
            component={TermsAcceptanceScreen}
            initialParams={{ mode: 'update' }}
            options={{ gestureEnabled: false }}
          />
        </Stack.Navigator>
      ) : (
        <VerifiedAppStack />
      )}
    </NavigationContainer>
  )
}
