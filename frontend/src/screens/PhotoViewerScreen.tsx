import React, { useState } from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { fitContainer, Gallery } from 'react-native-zoom-toolkit'
import { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'PhotoViewer'>

// Sized against its own loaded resolution (not the container) so Gallery's pinch/pan
// math has an accurate box to work with — a plain resizeMode="contain" isn't enough here.
function FullImagePage({ uri }: { uri: string }) {
  const { width, height } = useWindowDimensions()
  const [resolution, setResolution] = useState({ width: 1, height: 1 })
  const size = fitContainer(resolution.width / resolution.height, { width, height })

  return (
    <Image
      source={{ uri }}
      style={size}
      resizeMethod="scale"
      resizeMode="cover"
      onLoad={(e) => setResolution({ width: e.nativeEvent.source.width, height: e.nativeEvent.source.height })}
    />
  )
}

export default function PhotoViewerScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { photos, initialIndex } = route.params
  const [index, setIndex] = useState(initialIndex)

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => nav.goBack()}>
        <Text style={styles.closeText}>Close</Text>
      </TouchableOpacity>

      <View style={styles.galleryContainer}>
        <Gallery
          data={photos}
          keyExtractor={(item: string, i: number) => `${i}-${item}`}
          initialIndex={initialIndex}
          onIndexChange={setIndex}
          renderItem={(item: string) => <FullImagePage uri={item} />}
        />
      </View>

      {photos.length > 1 ? (
        <Text style={styles.counter}>
          {index + 1} / {photos.length}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  galleryContainer: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    zIndex: 10,
  },
  closeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  counter: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
})
