import { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { showAlert } from '../utils/alert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuItem from '../components/MenuItem';
import ToggleItem from '../components/ToggleItem';
import { Download, Globe, Moon, Trash2 } from '../utils/icons';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { getUserId } from '../services/auth';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Theme } from '../types';

export default function SettingsScreen() {
  const { isDark, toggleDarkMode, theme } = useTheme();
  const styles = getStyles(theme);
  const [autoDetect, setAutoDetect] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('auto_detect').then(val => {
      if (val !== null) setAutoDetect(val === 'true');
    });
  }, []);

  const handleAutoDetectChange = async (value) => {
    setAutoDetect(value);
    await AsyncStorage.setItem('auto_detect', value.toString());
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const userId = await getUserId();
      if (!userId) return;
      const response = await api.get(`/users/${userId}/history/`);
      const jsonContent = JSON.stringify(response.data, null, 2);
      const fileUri = ((FileSystem as any).documentDirectory || '') + 'ordocare_export.json';
      await FileSystem.writeAsStringAsync(fileUri, jsonContent);
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Exporter mes données',
      });
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('Impossible d\'exporter les données.');
      } else {
        showAlert('Erreur', 'Impossible d\'exporter les données.');
      }
    } finally {
      setExporting(false);
    }
  };

  const doClearHistory = async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      const id = userId;
      await api.delete(`/users/${id}/history/`);
      if (Platform.OS === 'web') {
        window.alert('Historique effacé.');
      } else {
        showAlert('Succès', 'Historique effacé.');
      }
    } catch (error) {
      if (Platform.OS === 'web') {
        window.alert('Impossible d\'effacer l\'historique.');
      } else {
        showAlert('Erreur', 'Impossible d\'effacer l\'historique.');
      }
    }
  };

  const handleClearHistory = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Cette action supprimera toutes vos ordonnances, prescriptions et rappels. Voulez-vous continuer ?'
      );
      if (confirmed) doClearHistory();
    } else {
      Alert.alert(
        'Effacer l\'historique',
        'Cette action supprimera toutes vos ordonnances, prescriptions et rappels. Voulez-vous continuer ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Effacer', style: 'destructive', onPress: doClearHistory },
        ]
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Réglages</Text>
      <Text style={styles.subtitle}>Personnalisez votre expérience</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Général</Text>
        <ToggleItem
          icon={Globe}
          title="Détection automatique"
          value={autoDetect}
          onChange={handleAutoDetectChange}
        />
        <ToggleItem
          icon={Moon}
          title="Mode sombre"
          value={isDark}
          onChange={toggleDarkMode}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Données</Text>
        <MenuItem
          icon={Download}
          title="Exporter mes données"
          subtitle={exporting ? 'Export en cours...' : 'Télécharger en JSON'}
          onPress={handleExportData}
        />
        <MenuItem
          icon={Trash2}
          title="Effacer l'historique"
          subtitle="Supprimer toutes les prescriptions"
          onPress={handleClearHistory}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>À propos</Text>
        <View style={styles.aboutCard}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Build</Text>
            <Text style={styles.aboutValue}>2025.10.17</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.l,
    paddingBottom: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.l,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.m,
  },
  aboutCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: theme.spacing.m,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  aboutLabel: {
    fontSize: 16,
    color: theme.colors.textLight,
  },
  aboutValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textDark,
  },
});
