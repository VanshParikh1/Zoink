import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function HomeScreen() {
  const { user, logout } = useAuth()
  const nav = useNavigation<Nav>()

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Welcome, {user?.firstName}! 👋</Text>
      <Text style={styles.subtitle}>You're verified and ready to use Zoink.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manage Your Items</Text>
        <TouchableOpacity style={styles.button} onPress={() => nav.navigate('CreateListing')}>
          <Text style={styles.buttonText}>List an Item</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => nav.navigate('MyListings')}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Manage My Listings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D14' },
  content: { paddingTop: 80, paddingHorizontal: 24, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 40 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 },
  button: {
    backgroundColor: '#6C47FF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a2a40',
  },
  secondaryButtonText: { color: '#bbb' },
  logoutButton: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutButtonText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
})