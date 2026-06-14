import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { EmptyStateProps, Theme } from '../types';

export default function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon size={40} color={theme.colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { alignItems: 'center', marginTop: 60 },
  iconCircle: {
    width: 80, height: 80,
    backgroundColor: theme.colors.secondary,
    borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: theme.spacing.m,
  },
  title: { fontSize: 18, fontWeight: '600', color: theme.colors.textDark, marginBottom: 4 },
  subtitle: { fontSize: 14, color: theme.colors.textLight, textAlign: 'center', paddingHorizontal: theme.spacing.xl },
});
