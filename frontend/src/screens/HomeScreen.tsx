import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function HomeScreen() {
  const { user, logout } = useAuth()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.firstName}! 👋</Text>
      <Text style={styles.subtitle}>You're verified and ready to use Zoink.</Text>
      <TouchableOpacity style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 24, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32 },
  button: { backgroundColor: '#6C47FF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})