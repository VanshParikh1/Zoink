import React, { useMemo, useRef, useState } from 'react'
import { Animated, Image, PanResponder, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme/colors'
import { TILE_SIZE, buildTileGrid, toTileFloat, tileFloatToLatLon } from '../utils/mapTiles'

const GRID_RADIUS = 2

type Coords = { latitude: number; longitude: number }

type Props = {
  latitude: number
  longitude: number
  onChange: (coords: Coords) => void
  height?: number
  zoom?: number
}

export default function DraggableLocationMap({ latitude, longitude, onChange, height = 200, zoom = 15 }: Props) {
  const [width, setWidth] = useState(0)
  const pan = useRef(new Animated.ValueXY()).current

  // PanResponder handlers are created once, so they read the latest coords/size
  // through this ref rather than closing over stale props.
  const liveRef = useRef({ latitude, longitude, zoom, width, height })
  liveRef.current = { latitude, longitude, zoom, width, height }

  const tiles = useMemo(
    () => buildTileGrid(latitude, longitude, zoom, width, height, GRID_RADIUS),
    [latitude, longitude, zoom, width, height]
  )

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gestureState) =>
        Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
      onPanResponderGrant: () => {
        pan.setValue({ x: 0, y: 0 })
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, gestureState) => {
        const { latitude: lat, longitude: lon, zoom: z } = liveRef.current
        const center = toTileFloat(lat, lon, z)
        const worldPxX = center.x * TILE_SIZE - gestureState.dx
        const worldPxY = center.y * TILE_SIZE - gestureState.dy
        pan.setValue({ x: 0, y: 0 })
        onChange(tileFloatToLatLon(worldPxX / TILE_SIZE, worldPxY / TILE_SIZE, z))
      },
      onPanResponderTerminate: () => {
        pan.setValue({ x: 0, y: 0 })
      },
    })
  ).current

  return (
    <View
      style={[styles.container, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      <Animated.View style={{ transform: pan.getTranslateTransform() }}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri }}
            style={{ position: 'absolute', left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
          />
        ))}
      </Animated.View>
      <View style={styles.circle} pointerEvents="none" />
      <Text style={styles.hint} pointerEvents="none">
        Drag to set the exact spot
      </Text>
      <Text style={styles.attribution} pointerEvents="none">
        © OpenStreetMap
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.surfaceSubdued,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  circle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 108,
    height: 108,
    marginTop: -54,
    marginLeft: -54,
    borderRadius: 54,
    backgroundColor: theme.primary,
    opacity: 0.3,
  },
  hint: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 11,
    fontWeight: '700',
    color: theme.textOnPrimary,
    backgroundColor: theme.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  attribution: {
    position: 'absolute',
    bottom: 3,
    right: 6,
    fontSize: 9,
    color: 'rgba(0,0,0,0.6)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
})
