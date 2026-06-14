import { useEffect, useState, useCallback } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import { showAlert } from '../utils/alert';
import { Bell, Clock, X, Check, Pill, Calendar } from '../utils/icons';
import api from '../services/api';
import { getUserId } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { formatShortDate, formatTime } from '../utils/date';
import EmptyState from '../components/EmptyState';
import type { Theme } from '../types';

export default function RemindersScreen() {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [ordonnances, setOrdonnances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrdonnance, setSelectedOrdonnance] = useState(null);

  const fetchReminders = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      const response = await api.get(`/users/${userId}/reminders/`);
      setOrdonnances(Array.isArray(response.data) ? response.data : []);
    } catch (_) {
      // Silenced in production
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReminders();
  };

  const updateReminderStatus = async (reminderId, newStatus) => {
    try {
      await api.patch(`/reminders/${reminderId}/`, { status: newStatus });
      setOrdonnances(prev => prev.map(ord => ({
        ...ord,
        prescriptions: ord.prescriptions.map(p => {
          if (p.next_reminder_id === reminderId) {
            return { ...p, next_reminder_id: null, pending_count: p.pending_count - 1 };
          }
          return p;
        }),
        total_pending: ord.prescriptions.some(p => p.next_reminder_id === reminderId)
          ? ord.total_pending - 1
          : ord.total_pending,
      })).filter(ord => ord.total_pending > 0));

      if (selectedOrdonnance) {
        setSelectedOrdonnance(prev => {
          if (!prev) return null;
          const updated = {
            ...prev,
            prescriptions: prev.prescriptions.map(p => {
              if (p.next_reminder_id === reminderId) {
                return { ...p, next_reminder_id: null, pending_count: p.pending_count - 1 };
              }
              return p;
            }),
            total_pending: prev.total_pending - 1,
          };
          if (updated.total_pending <= 0) return null;
          return updated;
        });
      }

      fetchReminders();
    } catch (error) {
      showAlert('Erreur', 'Impossible de mettre à jour le rappel.');
    }
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 50 }} />;

  const renderItem = ({ item: ord }) => (
    <TouchableOpacity
      style={[styles.card, { marginBottom: 12 }]}
      activeOpacity={0.7}
      onPress={() => setSelectedOrdonnance(ord)}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <Pill size={22} color={theme.colors.primary} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardSummary} numberOfLines={2}>{ord.summary}</Text>
          <View style={styles.dateRow}>
            <Calendar size={12} color={theme.colors.textLight} />
            <Text style={styles.dateText}>
              {formatShortDate(ord.start_date)} — {formatShortDate(ord.expiry_date)}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>
            {ord.total_pending} rappel{ord.total_pending > 1 ? 's' : ''} en attente
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={ordonnances}
        keyExtractor={(item) => String(item.file_id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Rappels</Text>
            <Text style={styles.subtitle}>Vos prises de médicaments</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Bell}
            title="Aucun rappel"
            subtitle="Scannez une ordonnance pour générer des rappels automatiquement."
          />
        }
      />

      <Modal
        visible={selectedOrdonnance !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedOrdonnance(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Détail de l'ordonnance</Text>
              <TouchableOpacity onPress={() => setSelectedOrdonnance(null)} style={styles.modalClose}>
                <X size={22} color={theme.colors.textDark} />
              </TouchableOpacity>
            </View>

            {selectedOrdonnance && (
              <>
                <Text style={styles.modalSummary}>{selectedOrdonnance.summary}</Text>
                <View style={styles.modalDateRow}>
                  <Calendar size={14} color={theme.colors.textLight} />
                  <Text style={styles.modalDateText}>
                    {formatShortDate(selectedOrdonnance.start_date)} — {formatShortDate(selectedOrdonnance.expiry_date)}
                  </Text>
                </View>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  {selectedOrdonnance.prescriptions.map((p) => (
                    <View key={p.id} style={styles.medCard}>
                      <View style={styles.medHeader}>
                        <View style={styles.medIconBox}>
                          <Pill size={16} color={theme.colors.primary} />
                        </View>
                        <View style={styles.medTexts}>
                          <Text style={styles.medName}>{p.medicine_name}</Text>
                          <Text style={styles.medDosage}>{p.dosage_med}</Text>
                        </View>
                        <View style={styles.medCountBadge}>
                          <Text style={styles.medCountText}>{p.pending_count}</Text>
                        </View>
                      </View>

                      {p.frequency ? (
                        <View style={styles.medFreqRow}>
                          <Clock size={12} color={theme.colors.textLight} />
                          <Text style={styles.medFreqText}>{p.frequency}</Text>
                        </View>
                      ) : null}

                      {p.next_reminder_id && (
                        <View style={styles.medActions}>
                          <Text style={styles.nextTimeText}>
                            Prochain : {formatTime(p.next_reminder_time)}
                          </Text>
                          <View style={styles.actionButtons}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: theme.colors.success + '20' }]}
                              onPress={() => updateReminderStatus(p.next_reminder_id, 'taken')}
                            >
                              <Check size={16} color={theme.colors.success} />
                              <Text style={[styles.actionBtnText, { color: theme.colors.success }]}>Pris</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: theme.colors.dangerBg }]}
                              onPress={() => updateReminderStatus(p.next_reminder_id, 'skipped')}
                            >
                              <X size={16} color={theme.colors.danger} />
                              <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>Non pris</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {!p.next_reminder_id && p.pending_count === 0 && (
                        <Text style={styles.allDoneText}>Tous les rappels traités</Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
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
    padding: theme.spacing.l,
    ...theme.shadow,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.s },
  cardIcon: {
    width: 44, height: 44,
    backgroundColor: theme.colors.secondary,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginRight: theme.spacing.m,
  },
  cardInfo: { flex: 1 },
  cardSummary: { fontSize: 16, fontWeight: '700', color: theme.colors.textDark, marginBottom: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateText: { marginLeft: 6, fontSize: 12, color: theme.colors.textLight },
  cardBottom: { marginTop: theme.spacing.s },
  pendingBadge: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pendingText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: theme.spacing.l,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.textDark },
  modalClose: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSummary: { fontSize: 16, fontWeight: '600', color: theme.colors.textDark, marginBottom: 4 },
  modalDateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.l },
  modalDateText: { marginLeft: 6, fontSize: 13, color: theme.colors.textLight },
  modalScroll: { maxHeight: 400 },

  // Med cards inside modal
  medCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.m,
    marginBottom: 12,
    ...theme.shadow,
  },
  medHeader: { flexDirection: 'row', alignItems: 'center' },
  medIconBox: {
    width: 36, height: 36,
    backgroundColor: theme.colors.secondary,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  medTexts: { flex: 1 },
  medName: { fontSize: 15, fontWeight: '700', color: theme.colors.textDark },
  medDosage: { fontSize: 13, color: theme.colors.textLight, marginTop: 1 },
  medCountBadge: {
    backgroundColor: theme.colors.primary,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  medCountText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  medFreqRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  medFreqText: { marginLeft: 6, fontSize: 12, color: theme.colors.textLight },

  medActions: { marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 },
  nextTimeText: { fontSize: 12, color: theme.colors.textLight, marginBottom: 8 },
  actionButtons: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: theme.borderRadius.button,
    gap: 6,
  },
  actionBtnText: { fontWeight: '700', fontSize: 14 },
  allDoneText: { fontSize: 12, color: theme.colors.success, fontWeight: '600', marginTop: 8 },
});
