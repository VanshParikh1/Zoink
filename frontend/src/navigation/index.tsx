import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme/colors'
import { getPendingReviews } from '../services/reviewsApi'

// Screens
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import VerifyEmailScreen from '../screens/VerifyEmailScreen'
import VerificationGateScreen from '../screens/VerificationGateScreen'
import MainAppScreen from '../screens/MainAppScreen'
import CreateListingScreen from '../screens/CreateListingScreen'
import ListingDetailScreen from '../screens/ListingDetailScreen'
import EditListingScreen from '../screens/EditListingScreen'
import MyListingsScreen from '../screens/MyListingsScreen'
import BookingRequestScreen from '../screens/BookingRequestScreen'
import BookingHistoryScreen from '../screens/BookingHistoryScreen'
import BookingRequestsScreen from '../screens/BookingRequestsScreen'
import BookingDetailScreen from '../screens/BookingDetailScreen'
import InboxScreen from '../screens/InboxScreen'
import ConversationThreadScreen from '../screens/ConversationThreadScreen'
import ReviewPromptScreen from '../screens/ReviewPromptScreen'
import MyProfileScreen from '../screens/MyProfileScreen'
import PublicProfileScreen from '../screens/PublicProfileScreen'
import HandoffPhotoScreen from '../screens/HandoffPhotoScreen'
import ZoinkItScreen from '../screens/ZoinkItScreen'
import ActiveRentalScreen from '../screens/ActiveRentalScreen'

export type RootStackParamList = {
  Login: undefined
  Register: undefined
  VerifyEmail: undefined
  VerificationGate: undefined
  MainApp: { tab?: 'Home' | 'Search' | 'Inbox' | 'MyProfile' } | undefined
  CreateListing: undefined
  ListingDetail: { listingId: string }
  EditListing: { listingId: string }
  MyListings: undefined
  BookingRequest: { listingId: string }
  BookingHistory: undefined
  BookingRequests: undefined
  BookingDetail: { bookingId: string }
  ActiveRental: { bookingId: string }
  HandoffPhoto: { bookingId: string; mode: 'pickup' | 'return' }
  ZoinkIt: { bookingId: string; mode: 'pickup' | 'return' }
  ReviewPrompt: { review: import('../types').PendingReview }
  Inbox: undefined
  MyProfile: undefined
  PublicProfile: { userId: string }
  ConversationThread: { conversationId: string; title?: string }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

function VerifiedAppStack() {
  const [initialReview, setInitialReview] = React.useState<import('../types').PendingReview | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    getPendingReviews()
      .then((reviews) => {
        if (reviews.length > 0) setInitialReview(reviews[0])
      })
      .catch((err) => console.error('Failed to fetch pending reviews', err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  return (
    <Stack.Navigator 
      screenOptions={{ headerShown: false }} 
      initialRouteName={initialReview ? 'ReviewPrompt' : 'MainApp'}
    >
      <Stack.Screen name="MainApp" component={MainAppScreen} />
      <Stack.Screen name="CreateListing" component={CreateListingScreen} />
      <Stack.Screen name="ListingDetail" component={ListingDetailScreen} />
      <Stack.Screen name="EditListing" component={EditListingScreen} />
      <Stack.Screen name="MyListings" component={MyListingsScreen} />
      <Stack.Screen name="BookingRequest" component={BookingRequestScreen} />
      <Stack.Screen name="BookingHistory" component={BookingHistoryScreen} />
      <Stack.Screen name="BookingRequests" component={BookingRequestsScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="ActiveRental" component={ActiveRentalScreen} />
      <Stack.Screen name="HandoffPhoto" component={HandoffPhotoScreen} />
      <Stack.Screen name="ZoinkIt" component={ZoinkItScreen} />
      <Stack.Screen 
        name="ReviewPrompt" 
        component={ReviewPromptScreen} 
        initialParams={initialReview ? { review: initialReview } : undefined} 
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="Inbox" component={InboxScreen} />
      <Stack.Screen name="MyProfile" component={MyProfileScreen} />
      <Stack.Screen 
        name="PublicProfile" 
        component={PublicProfileScreen} 
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="ConversationThread" component={ConversationThreadScreen} />
    </Stack.Navigator>
  )
}

export default function Navigation() {
  const { user, isLoading } = useAuth()

  // Don't render anything until we've checked SecureStore
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Navigator>
      ) : user.verificationStatus !== 'VERIFIED' ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="VerificationGate" component={VerificationGateScreen} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        </Stack.Navigator>
      ) : (
        <VerifiedAppStack />
      )}
    </NavigationContainer>
  )
}
