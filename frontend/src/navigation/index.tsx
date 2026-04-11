import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../context/AuthContext'

// Screens
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import VerifyEmailScreen from '../screens/VerifyEmailScreen'
import VerificationGateScreen from '../screens/VerificationGateScreen'
import HomeScreen from '../screens/HomeScreen'

export type RootStackParamList = {
  Login: undefined
  Register: undefined
  VerifyEmail: undefined
  VerificationGate: undefined
  Home: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function Navigation() {
  const { user, isLoading } = useAuth()

  // Don't render anything until we've checked SecureStore
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Not logged in — show auth screens
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.verificationStatus !== 'VERIFIED' ? (
          // Logged in but not verified — show verification screens
          <>
            <Stack.Screen name="VerificationGate" component = {VerificationGateScreen} />
            <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
          </>
        ) : (
          // Logged in and verified — show the app
          <Stack.Screen name="Home" component={HomeScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}