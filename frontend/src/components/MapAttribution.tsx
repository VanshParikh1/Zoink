import React from 'react'
import { Linking, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native'
import { usingMapTiler } from '../utils/mapTiles'

// MapTiler's free tier requires visible "© MapTiler © OpenStreetMap contributors"
// attribution; when no key is configured, tiles fall back to raw OpenStreetMap (see
// mapTiles.ts), which only requires the OSM half of that credit.
const ATTRIBUTION_TEXT = usingMapTiler ? '© MapTiler © OpenStreetMap contributors' : '© OpenStreetMap contributors'
const ATTRIBUTION_URL = usingMapTiler ? 'https://www.maptiler.com/copyright/' : 'https://www.openstreetmap.org/copyright'

export default function MapAttribution({ style }: { style?: ViewStyle }) {
  return (
    <TouchableOpacity style={[styles.attribution, style]} onPress={() => Linking.openURL(ATTRIBUTION_URL)}>
      <Text style={styles.attributionText}>{ATTRIBUTION_TEXT}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  attribution: {
    position: 'absolute',
    bottom: 3,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  attributionText: {
    fontSize: 9,
    color: 'rgba(0,0,0,0.6)',
  },
})
