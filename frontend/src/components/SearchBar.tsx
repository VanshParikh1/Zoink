import React, { useState, useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme/colors';

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

  // Animate border color between cardBorder and borderFocus
  React.useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.hard.ink, theme.primary],
  });

  const clearVisible = value.length > 0;

  return (
    <View style={styles.hardWrap}>
      <Animated.View style={[styles.outerContainer, { borderColor }]}>
        <Feather name="search" size={20} color={theme.textMuted} style={styles.icon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textDisabled}
          onFocus={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {clearVisible && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onChange('');
            }}
            style={styles.clearBtn}
          >
            <Feather name="x-circle" size={18} color={theme.textDisabled} />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hardWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
  },
  outerContainer: {
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.border,
    backgroundColor: theme.cardBackground,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
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

