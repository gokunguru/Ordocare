import { Camera, Clock, Bell, Settings, User, Globe } from '../utils/icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { TabBarProps, Theme, IconComponent } from '../types';

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const tabs: Array<{ id: string; label: string; icon: IconComponent }> = [
    { id: 'scan', label: 'Scan', icon: Camera },
    { id: 'history', label: 'Historique', icon: Clock },
    { id: 'reminders', label: 'Rappels', icon: Bell },
    { id: 'translations', label: 'Traductions', icon: Globe },
    { id: 'account', label: 'Compte', icon: User },
    { id: 'settings', label: 'Réglages', icon: Settings }
  ];

  return (
    <View style={styles.container}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <TouchableOpacity
          key={id}
          onPress={() => onTabChange(id)}
          style={styles.tab}
          activeOpacity={0.7}
        >
          <Icon size={22} color={activeTab === id ? theme.colors.primary : theme.colors.textLight} />
          <Text style={[styles.label, activeTab === id ? styles.activeLabel : styles.inactiveLabel]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: theme.colors.card, borderTopWidth: 1,
    borderTopColor: theme.colors.border, paddingVertical: 8,
  },
  tab: { alignItems: 'center', paddingVertical: 8, flex: 1 },
  label: { fontSize: 10, marginTop: 4 },
  activeLabel: { color: theme.colors.primary, fontWeight: '600' },
  inactiveLabel: { color: theme.colors.textLight },
});
