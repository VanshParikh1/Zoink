import React, { useState, useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons'; // Assuming expo-vector-icons is available
import { theme } from '../theme/colors';

/**
 * SearchBar – a reusable component with a search icon, clear button, and subtle focus animation.
 * It expands its border color when focused, matching the app's lime‑green accent.
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

  // Animate border color between transparent and primary accent
  React.useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', theme.primary],
  });

  const clearVisible = value.length > 0;

  return (
    <Animated.View style={[styles.container, { borderColor }]}>
      <Feather name="search" size={20} color={theme.textFaint} style={styles.icon} />
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    height: 48,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: theme.text,
    fontSize: 16,
  },
  clearBtn: {
    padding: 4,
  },
});
