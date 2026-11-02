import React, { useState } from 'react'
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { fitContainer, Gallery } from 'react-native-zoom-toolkit'
import { RootStackParamList } from '../navigation'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import IconButton from '../components/mockup/IconButton'
import Badge from '../components/mockup/Badge'

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
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.topBar, { top: insets.top + space.sm }]} pointerEvents="box-none">
        {photos.length > 1 ? <Badge label={`${index + 1} of ${photos.length}`} variant="surface" size={13} /> : <View />}
        <IconButton accessibilityLabel="Close photos" onPress={() => nav.goBack()}>
          <Feather name="x" size={22} color={colors.ink} />
        </IconButton>
      </View>

      <View style={styles.galleryContainer}>
        <Gallery
          data={photos}
          keyExtractor={(item: string, i: number) => `${i}-${item}`}
          initialIndex={initialIndex}
          onIndexChange={setIndex}
          renderItem={(item: string) => <FullImagePage uri={item} />}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  galleryContainer: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: space.xxl,
    right: space.xxl,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
