import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ViewStyle, ActivityIndicator } from 'react-native';
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
      <View style={[styles.hardWrap, isStated && styles.hardWrapFlat, style]}>
        <TouchableOpacity
          onPress={handlePress}
          disabled={isStated}
          style={[styles.btnWrapper, !isStated && styles.btnWrapperLifted]}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[theme.primary, theme.primaryDeep]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.textOnPrimary} size="small" />
            ) : (
              <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  if (variant === 'stampedOutline') {
    return (
      <View style={[styles.hardWrap, isStated && styles.hardWrapFlat, style]}>
        <TouchableOpacity
          onPress={handlePress}
          disabled={isStated}
          style={[styles.ghostBtn, !isStated && styles.btnWrapperLifted]}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator color={theme.primary} size="small" />
          ) : (
            <Text style={styles.ghostText} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (variant === 'inset') {
    return (
      <View style={[styles.hardWrap, styles.hardWrapSm, isStated && styles.hardWrapFlat, style]}>
        <TouchableOpacity
          onPress={handlePress}
          disabled={isStated}
          style={[styles.insetBtn, !isStated && styles.btnWrapperLiftedSm]}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator color={theme.textMuted} size="small" />
          ) : (
            <Text style={styles.insetText} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (variant === 'danger') {
    return (
      <View style={[styles.hardWrap, styles.hardWrapSm, isStated && styles.hardWrapFlat, style]}>
        <TouchableOpacity
          onPress={handlePress}
          disabled={isStated}
          style={[styles.dangerBtn, !isStated && styles.btnWrapperLiftedSm]}
          activeOpacity={0.7}
        >
          <Text style={styles.dangerText}>{label}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  // Outer ink-colored backing plate — the block-shadow trick. See HardBlock
  // for the reusable version; buttons need the gradient fill inline so they
  // stay hand-rolled here instead of wrapping HardBlock.
  hardWrap: {
    borderRadius: 10,
    backgroundColor: theme.hard.ink,
  },
  hardWrapSm: {
    borderRadius: 10,
  },
  hardWrapFlat: {
    backgroundColor: 'transparent',
  },
  btnWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
  },
  btnWrapperLifted: {
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  btnWrapperLiftedSm: {
    marginRight: 2,
    marginBottom: 2,
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.textOnPrimary,
  },
  ghostBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.primaryDeep,
  },
  insetBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: theme.surfaceSubdued,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  insetText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  dangerBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.dangerSurface,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  dangerText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.danger,
  },
});
