import React, { useMemo } from 'react'
import { View, StyleSheet, Dimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { theme } from '../theme/colors'

interface Props {
  children: React.ReactNode
  style?: any
}

const { width: W, height: H } = Dimensions.get('window')

// Alternating-triangle texture tile, matching the landing page background.
// Built from plain Views (a small rotated square reads as a diamond, and a
// diamond clipped in half by its neighbor's overlap reads as a triangle
// weave) instead of an SVG/image asset, so it needs no new native
// dependency and no extra rebuild.
const TILE = 34
const DOT = 15
const COLS = Math.ceil(W / TILE) + 2
const ROWS = Math.ceil(H / TILE) + 2

type Tile = { key: string; x: number; y: number }

function buildTexture(): Tile[] {
  const tiles: Tile[] = []
  for (let row = 0; row < ROWS; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : TILE / 2
    for (let col = 0; col < COLS; col += 1) {
      tiles.push({
        key: `${row}-${col}`,
        x: col * TILE + rowOffset - TILE,
        y: row * (TILE * 0.75) - TILE,
      })
    }
  }
  return tiles
}

const TEXTURE_TILES = buildTexture()

export default function ScreenBackground({ children, style }: Props) {
  const tiles = useMemo(() => TEXTURE_TILES, [])

  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={theme.backgroundGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {tiles.map((tile) => (
          <View
            key={tile.key}
            style={[
              styles.diamond,
              { left: tile.x, top: tile.y },
            ]}
          />
        ))}
      </View>

      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.screen,
  },
  diamond: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    backgroundColor: theme.textureColor,
    opacity: 0.06,
    transform: [{ rotate: '45deg' }],
  },
})
