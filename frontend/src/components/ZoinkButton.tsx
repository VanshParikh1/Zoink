import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme/colors';

type ButtonVariant = 'stamped' | 'stampedOutline' | 'inset' | 'danger';

interface ZoinkButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function ZoinkButton({
  label,
  onPress,
  variant = 'stamped',
  isLoading = false,
  disabled = false,
  style,
}: ZoinkButtonProps) {
  const isStated = disabled || isLoading;

  const handlePress = async () => {
    if (isStated) return;
    
    // Tactile feedback
    if (variant === 'stamped' || variant === 'danger') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    
    onPress();
  };

  if (variant === 'stamped') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={isStated}
        style={[styles.btnWrapper, style]}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[theme.primary, theme.primaryDeep]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {isLoading ? (
            <ActivityIndicator color={theme.textOnPrimary} size="small" />
          ) : (
            <Text style={styles.btnText}>{label}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === 'stampedOutline') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={isStated}
        style={[styles.ghostBtn, style, isStated && { opacity: 0.5 }]}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          <Text style={styles.ghostText}>{label}</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'inset') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={isStated}
        style={[styles.insetBtn, style, isStated && { opacity: 0.5 }]}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator color={theme.textMuted} size="small" />
        ) : (
          <Text style={styles.insetText}>{label}</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'danger') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={isStated}
        style={[styles.dangerBtn, style, isStated && { opacity: 0.5 }]}
        activeOpacity={0.7}
      >
        <Text style={styles.dangerText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  btnWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textOnPrimary,
  },
  ghostBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(109, 216, 50, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(109, 216, 50, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primaryDeep,
  },
  insetBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: theme.surfaceSubdued,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  insetText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  dangerBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: theme.colors.dangerSurface,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  dangerText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.danger,
  },
});
