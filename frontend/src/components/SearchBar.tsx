import React, { useState, useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { theme } from '../theme/colors';

/**
 * SearchBar – Liquid Glass edition.
 * Features a frosted glass surface with backdrop blur, inner highlights,
 * and a subtle green glow on focus.
 */
export default function SearchBar({
  value,
  onChange,
  placeholder = 'Search items, tools, rides...'
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}) {
  const [isFocused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  // Animate border color between glassBorder and glassPrimaryBorder
  React.useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.glassBorder, theme.glassPrimaryBorder],
  });

  const clearVisible = value.length > 0;

  const renderContent = () => (
    <>
      <Feather name="search" size={20} color={theme.textMuted} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {clearVisible && (
        <TouchableOpacity onPress={() => onChange('')} style={styles.clearBtn}>
          <Feather name="x-circle" size={18} color={theme.textFaint} />
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <Animated.View style={[styles.outerContainer, { borderColor }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={50} style={styles.blurContainer} tint="dark">
          {renderContent()}
        </BlurView>
      ) : (
        <View style={styles.androidContainer}>
          {renderContent()}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderTopColor: theme.glassHighlight, // Inner top shine
    borderBottomColor: theme.glassBorderBottom,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(10, 46, 22, 0.75)',
    overflow: 'hidden',
    // Soft glass shadow
    shadowColor: theme.glassShadow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  blurContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: theme.glassFill,
  },
  androidContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: theme.text,
    fontSize: 16,
    fontWeight: '300',
  },
  clearBtn: {
    padding: 4,
  },
});
