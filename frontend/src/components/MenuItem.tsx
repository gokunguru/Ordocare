import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { ChevronRight } from '../utils/icons';
import { useTheme } from '../context/ThemeContext';
import type { MenuItemProps, Theme } from '../types';

export default function MenuItem({ icon: Icon, title, subtitle, onPress, first, last }: MenuItemProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <TouchableOpacity
      style={[styles.container, first && styles.firstItem, last && styles.lastItem]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.leftContent}>
        <View style={styles.iconBox}>
          <Icon size={20} color={theme.colors.primary} />
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      <ChevronRight size={20} color={theme.colors.textLight} />
    </TouchableOpacity>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: theme.colors.card,
    borderBottomWidth: 1, borderBottomColor: theme.colors.background,
  },
  firstItem: { borderTopLeftRadius: theme.borderRadius.card, borderTopRightRadius: theme.borderRadius.card },
  lastItem: { borderBottomLeftRadius: theme.borderRadius.card, borderBottomRightRadius: theme.borderRadius.card, borderBottomWidth: 0 },
  leftContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600', color: theme.colors.textDark },
  subtitle: { fontSize: 13, color: theme.colors.textLight, marginTop: 2 },
});
