import React, { useMemo } from 'react'
import { View, StyleSheet, useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { theme } from '../theme/colors'

interface Props {
  children: React.ReactNode
  style?: any
}

// Alternating-triangle texture tile, matching the landing page background.
// Built from plain Views (a small rotated square reads as a diamond, and a
// diamond clipped in half by its neighbor's overlap reads as a triangle
// weave) instead of an SVG/image asset, so it needs no new native
// dependency and no extra rebuild.
const TILE = 34
const DOT = 15

type Tile = { key: string; x: number; y: number }

// Rendered once at the app root behind the navigator (see navigation/index.tsx),
// not per-screen — screens sit on top with a transparent background so this
// canvas never unmounts/repaints on push, pop, or tab swipe. Sized from
// useWindowDimensions (not a Dimensions.get() snapshot taken at import time)
// so the tile grid always covers the live window, including rotation/resize,
// with no gap at the bottom edge.
const ROW_STEP = TILE * 0.75

function buildTexture(width: number, height: number): Tile[] {
  const cols = Math.ceil(width / TILE) + 2
  // Rows advance by ROW_STEP (0.75 * TILE), not a full TILE, so the row
  // count has to divide by that same step — dividing by TILE here
  // undercounted rows by 25% and left the bottom of every screen bare.
  const rows = Math.ceil(height / ROW_STEP) + 2
  const tiles: Tile[] = []
  for (let row = 0; row < rows; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : TILE / 2
    for (let col = 0; col < cols; col += 1) {
      tiles.push({
        key: `${row}-${col}`,
        x: col * TILE + rowOffset - TILE,
        y: row * ROW_STEP - TILE,
      })
    }
  }
  return tiles
}

export default function ScreenBackground({ children, style }: Props) {
  const { width, height } = useWindowDimensions()
  const tiles = useMemo(() => buildTexture(width, height), [width, height])

  return (
    <View style={[styles.container, style]}>
      {/*
        Horizontal, not diagonal: theme.backgroundGradient's 3rd stop is pure
        white, and a top-left -> bottom-right diagonal put that stop right at
        the bottom edge of every screen, so the bottom read as a flat white
        strip once background coverage itself was fixed. Running the same
        locked color stops left-to-right keeps top and bottom identical.
      */}
      <LinearGradient
        colors={theme.backgroundGradient}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
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
