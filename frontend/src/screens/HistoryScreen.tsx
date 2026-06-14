import { useEffect, useState, useCallback } from 'react';
import { ChevronRight, Clock, FileText } from '../utils/icons';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import api from '../services/api';
import { getUserId } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { formatDate } from '../utils/date';
import EmptyState from '../components/EmptyState';
import type { Theme } from '../types';

export default function HistoryScreen() {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [ordonnances, setOrdonnances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchHistory = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      const response = await api.get(`/users/${userId}/history/`);
      setOrdonnances(Array.isArray(response.data) ? response.data : []);
    } catch (_) {
      // Silenced in production
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 50 }} />;

  const renderItem = ({ item }) => (
    <View style={{ marginBottom: 12 }}>
      <TouchableOpacity
        style={[styles.card, expandedId === item.id && styles.cardExpanded]}
        activeOpacity={0.7}
        onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
      >
        <View style={styles.cardLeft}>
          <View style={styles.iconContainer}>
            <FileText size={20} color={theme.colors.primary} />
          </View>
        </View>
        <View style={styles.cardContent}>
          <View style={styles.dateRow}>
            <Clock size={12} color={theme.colors.textLight} />
            <Text style={styles.date}>{formatDate(item.uploaded_at)}</Text>
          </View>
          <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text>
          <Text style={styles.countBadge}>
            {item.prescription_count} médicament{item.prescription_count > 1 ? 's' : ''}
          </Text>
        </View>
        <ChevronRight
          size={18}
          color={theme.colors.textLight}
          style={{ transform: [{ rotate: expandedId === item.id ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {expandedId === item.id && item.prescriptions?.length > 0 && (
        <View style={styles.detailCard}>
          {item.prescriptions.map((p) => (
            <View key={p.id} style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <Text style={styles.detailName}>{p.medicine_name}</Text>
                <Text style={styles.detailDosage}>{p.dosage_med}</Text>
              </View>
              <View style={styles.detailRight}>
                {p.frequency ? <Text style={styles.detailFreq}>{p.frequency}</Text> : null}
                {p.duration ? <Text style={styles.detailDur}>{p.duration}</Text> : null}
              </View>
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
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Historique</Text>
          <Text style={styles.subtitle}>Vos ordonnances analysées</Text>
        </>
      }
      ListEmptyComponent={
        <EmptyState
          icon={FileText}
          title="Aucun historique"
          subtitle="Scannez une ordonnance pour voir vos prescriptions ici."
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailLeft: { flex: 1 },
  detailName: { fontSize: 14, fontWeight: '600', color: theme.colors.textDark },
  detailDosage: { fontSize: 12, color: theme.colors.textLight, marginTop: 2 },
  detailRight: { alignItems: 'flex-end' },
  detailFreq: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  detailDur: { fontSize: 11, color: theme.colors.textLight, marginTop: 2 },
});
