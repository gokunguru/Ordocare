import { useEffect, useState, useCallback } from 'react';
import { Globe, Clock, ChevronRight } from '../utils/icons';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import api from '../services/api';
import { getUserId } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { formatDate } from '../utils/date';
import EmptyState from '../components/EmptyState';
import type { Theme } from '../types';

export default function TranslationsScreen() {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [ordonnances, setOrdonnances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchTranslations = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      const response = await api.get(`/users/${userId}/translations/`);
      setOrdonnances(Array.isArray(response.data) ? response.data : []);
    } catch (_) {
      // Silenced in production
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTranslations(); }, [fetchTranslations]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTranslations();
  };

  const getLangLabel = (code) => {
    if (!code) return code;
    const map = {
      'fra_Latn': 'Français', 'eng_Latn': 'Anglais', 'arb_Arab': 'Arabe',
      'spa_Latn': 'Espagnol', 'deu_Latn': 'Allemand', 'ita_Latn': 'Italien',
      'por_Latn': 'Portugais', 'zho_Hans': 'Chinois', 'tur_Latn': 'Turc',
      'rus_Cyrl': 'Russe', 'jpn_Jpan': 'Japonais', 'kor_Hang': 'Coréen',
    };
    return map[code] || code;
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 50 }} />;

  const renderItem = ({ item }) => (
    <View style={{ marginBottom: 12 }}>
      <TouchableOpacity
        style={[styles.card, expandedId === item.file_id && styles.cardExpanded]}
        activeOpacity={0.7}
        onPress={() => setExpandedId(expandedId === item.file_id ? null : item.file_id)}
      >
        <View style={styles.cardLeft}>
          <View style={styles.iconContainer}>
            <Globe size={20} color={theme.colors.primary} />
          </View>
        </View>
        <View style={styles.cardContent}>
          <View style={styles.dateRow}>
            <Clock size={12} color={theme.colors.textLight} />
            <Text style={styles.date}>{formatDate(item.uploaded_at)}</Text>
          </View>
          <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text>
          <Text style={styles.countBadge}>
            {item.translations.length} traduction{item.translations.length > 1 ? 's' : ''}
          </Text>
        </View>
        <ChevronRight
          size={18}
          color={theme.colors.textLight}
          style={{ transform: [{ rotate: expandedId === item.file_id ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {expandedId === item.file_id && (
        <View style={styles.detailCard}>
          {item.prescriptions?.length > 0 && (
            <View style={styles.medsSection}>
              <Text style={styles.medsSectionTitle}>Médicaments</Text>
              {item.prescriptions.map((p) => (
                <Text key={p.id} style={styles.medLine}>
                  • {p.medicine_name} {p.dosage_med ? `— ${p.dosage_med}` : ''} {p.frequency ? `(${p.frequency})` : ''}
                </Text>
              ))}
            </View>
          )}

          {item.translations.map((t) => (
            <View key={t.id} style={styles.translationBlock}>
              <View style={styles.translationLangRow}>
                <Text style={styles.translationLang}>
                  {getLangLabel(t.language_from)} → {getLangLabel(t.language_to)}
                </Text>
                <Text style={styles.translationDate}>{formatDate(t.created_at)}</Text>
              </View>
              <Text style={styles.originalLabel}>Texte original</Text>
              <Text style={styles.originalText}>{t.original_text}</Text>
              <Text style={styles.translatedLabel}>Traduction</Text>
              <Text style={styles.translatedText}>{t.translated_text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={ordonnances}
      keyExtractor={(item) => String(item.file_id)}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Traductions</Text>
          <Text style={styles.subtitle}>Vos ordonnances traduites</Text>
        </>
      }
      ListEmptyComponent={
        <EmptyState
          icon={Globe}
          title="Aucune traduction"
          subtitle="Scannez et traduisez une ordonnance depuis le scanner."
        />
      }
    />
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.l, paddingBottom: 100 },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.textDark, marginBottom: 8 },
  subtitle: { fontSize: 16, color: theme.colors.textLight, marginBottom: theme.spacing.l },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadow,
  },
  cardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardLeft: { marginRight: theme.spacing.m },
  iconContainer: {
    width: 44, height: 44,
    backgroundColor: theme.colors.secondary,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  date: { marginLeft: 6, color: theme.colors.textLight, fontSize: 12 },
  summary: { fontWeight: '600', fontSize: 15, color: theme.colors.textDark, marginBottom: 4 },
  countBadge: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  detailCard: {
    backgroundColor: theme.colors.secondary,
    borderBottomLeftRadius: theme.borderRadius.card,
    borderBottomRightRadius: theme.borderRadius.card,
    padding: theme.spacing.m,
  },
  medsSection: { marginBottom: theme.spacing.m },
  medsSectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.textDark, marginBottom: 4 },
  medLine: { fontSize: 13, color: theme.colors.textLight, lineHeight: 20 },
  translationBlock: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.input,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.s,
  },
  translationLangRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s,
  },
  translationLang: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  translationDate: { fontSize: 11, color: theme.colors.textLight },
  originalLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textLight, marginBottom: 2, textTransform: 'uppercase' },
  originalText: { fontSize: 13, color: theme.colors.textLight, lineHeight: 18, marginBottom: theme.spacing.s },
  translatedLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.primary, marginBottom: 2, textTransform: 'uppercase' },
  translatedText: { fontSize: 14, color: theme.colors.textDark, lineHeight: 20, fontWeight: '500' },
});
