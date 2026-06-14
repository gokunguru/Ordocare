import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ButtonProps, Theme } from '../types';

export default function Button({ title, onPress, variant = 'primary', fullWidth = false, icon: Icon, disabled = false, loading = false, style }: ButtonProps) {
  const { theme } = useTheme();
  const isPrimary = variant === 'primary';
  const styles = getStyles(theme);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        isPrimary ? styles.primaryButton : styles.secondaryButton,
        fullWidth && styles.fullWidth,
        disabled && styles.disabledButton,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : theme.colors.primary} />
      ) : (
        <>
          {Icon && <Icon size={20} color={isPrimary ? "#fff" : theme.colors.primary} style={styles.icon} />}
          <Text style={[isPrimary ? styles.primaryText : styles.secondaryText]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, paddingHorizontal: theme.spacing.l, borderRadius: theme.borderRadius.button,
  },
  fullWidth: { width: '100%' },
  primaryButton: { backgroundColor: theme.colors.primary, ...theme.shadow },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { backgroundColor: theme.colors.secondary },
  secondaryText: { color: theme.colors.primary, fontWeight: '700', fontSize: 16 },
  disabledButton: { opacity: 0.6 },
  icon: { marginRight: 12 },
});
