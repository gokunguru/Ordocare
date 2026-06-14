import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ToggleItemProps, Theme } from '../types';

export default function ToggleItem({ icon: Icon, title, value, onChange }: ToggleItemProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Icon size={20} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <TouchableOpacity
        onPress={() => onChange(!value)}
        style={[styles.toggle, value ? styles.toggleActive : styles.toggleInactive]}
        activeOpacity={0.8}
      >
        <View style={styles.toggleThumb} />
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  content: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: {
    width: 40, height: 40, backgroundColor: theme.colors.secondary,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  title: { fontSize: 16, fontWeight: '600', color: theme.colors.textDark },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: theme.colors.primary, alignItems: 'flex-end' },
  toggleInactive: { backgroundColor: theme.colors.border, alignItems: 'flex-start' },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 3,
  },
});
