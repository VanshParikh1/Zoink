import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList, 'VerificationGate'>

export default function VerificationGateScreen() {
  const navigation = useNavigation<Nav>()
  const { user, logout } = useAuth()

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📬</Text>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>
        We need to confirm your university email before you can start renting on Zoink.
      </Text>
      <Text style={styles.email}>{user?.email}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('VerifyEmail')}
      >
        <Text style={styles.buttonText}>Enter verification code</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={logout}>
        <Text style={styles.link}>Sign out</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 24, alignItems: 'center' },
  emoji: { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  email: { fontSize: 15, fontWeight: '600', color: '#6C47FF', marginBottom: 32 },
  button: {
    backgroundColor: '#6C47FF', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginBottom: 16, width: '100%'
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#999', fontSize: 14 },
})