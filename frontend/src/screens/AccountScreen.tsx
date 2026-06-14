import { useEffect, useState } from 'react';
import { Bell, Globe, HelpCircle, LogOut, Shield, ChevronLeft, ChevronDown, BellOff, Check } from '../utils/icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem } from '../services/secureStorage';
import MenuItem from '../components/MenuItem';
import ToggleItem from '../components/ToggleItem';
import MedicalProfileScreen from './MedicalProfileScreen';
import { logoutUser, getUserId } from '../services/auth';
import { requestNotificationPermissions, scheduleReminder, cancelAllReminders } from '../services/notifications';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';
import api from '../services/api';
import type { Theme, AccountScreenProps } from '../types';

export default function AccountScreen({ onLogout }: AccountScreenProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [username, setUsername] = useState('Guest');
  const [loading, setLoading] = useState(true);
  const [subScreen, setSubScreen] = useState(null);

  // Language state
  const [languages, setLanguages] = useState([]);
  const [selectedLangCode, setSelectedLangCode] = useState(null);
  const [selectedLangLabel, setSelectedLangLabel] = useState('Français');
  const [loadingLangs, setLoadingLangs] = useState(false);

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Notifications state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // FAQ state
  const [expandedFaq, setExpandedFaq] = useState(null);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const [storedName, prefLang, notifEnabled] = await Promise.all([
        getSecureItem('username'),
        AsyncStorage.getItem('preferred_lang'),
        AsyncStorage.getItem('notifications_enabled'),
      ]);
      if (storedName) setUsername(storedName);
      if (prefLang) setSelectedLangCode(prefLang);
      if (notifEnabled !== null) setNotificationsEnabled(notifEnabled === 'true');
    } catch (error) {
      if (__DEV__) console.warn("Erreur chargement profil:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutUser();
      if (onLogout) onLogout();
    } catch (error) {
      if (__DEV__) console.warn("Erreur déconnexion:", error);
    }
  };

  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : 'GU';

  // ─── Language sub-screen ─────────────────────────────────────────
  const openLanguageScreen = async () => {
    setSubScreen('language');
    setLoadingLangs(true);
    try {
      const response = await api.get('/translation/languages/');
      setLanguages(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setLanguages([]);
    } finally {
      setLoadingLangs(false);
    }
  };

  const selectLanguage = async (lang) => {
    setSelectedLangCode(lang.code);
    setSelectedLangLabel(lang.label);
    await AsyncStorage.setItem('preferred_lang', lang.code);
  };

  // ─── Security sub-screen ─────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      showAlert('Erreur', 'Remplissez tous les champs.');
      return;
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      showAlert('Erreur', 'Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }
    setChangingPassword(true);
    try {
      const userId = await getUserId();
      await api.patch(`/users/${userId}/change-password/`, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      showAlert('Succès', 'Mot de passe modifié avec succès.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSubScreen(null);
    } catch (error) {
      const msg = error.response?.data?.error || 'Impossible de changer le mot de passe.';
      showAlert('Erreur', msg);
    } finally {
      setChangingPassword(false);
    }
  };

  // ─── Notifications sub-screen ────────────────────────────────────
  const toggleNotifications = async (value) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('notifications_enabled', value.toString());

    if (value) {
      // Activer : demander permission + programmer tous les rappels pending
      try {
        const granted = await requestNotificationPermissions();
        if (granted) {
          const userId = await getUserId();
          const res = await api.get(`/users/${userId}/reminders/`);
          const data = res.data.results || res.data;
          if (Array.isArray(data)) {
            for (const ordo of data) {
              for (const p of ordo.prescriptions || []) {
                if (p.next_reminder_id && p.next_reminder_time) {
                  await scheduleReminder(p.next_reminder_id, p.medicine_name, p.next_reminder_time);
                }
              }
            }
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('Erreur activation notifications:', err);
      }
    } else {
      // Désactiver : annuler toutes les notifications
      await cancelAllReminders();
    }
  };

  // ─── FAQ data ────────────────────────────────────────────────────
  const faqItems = [
    { q: "Comment scanner une ordonnance ?", a: "Allez dans l'onglet Scanner, prenez une photo claire de votre ordonnance, puis appuyez sur \"Analyser\". L'application extraira automatiquement les médicaments et créera des rappels." },
    { q: "Quelle est la différence entre Imprimé et Manuscrit ?", a: "Le mode Imprimé utilise Tesseract OCR, optimisé pour le texte imprimé. Le mode Manuscrit utilise TrOCR, un modèle d'IA spécialisé pour l'écriture manuscrite. Vous pouvez activer la détection automatique dans les Réglages." },
    { q: "Comment fonctionnent les rappels ?", a: "Les rappels sont créés automatiquement lors de l'analyse d'une ordonnance selon la fréquence et la durée détectées. Vous pouvez marquer chaque prise comme \"Pris\" ou \"Non pris\" dans l'onglet Rappels." },
    { q: "Comment exporter mes données ?", a: "Allez dans Réglages > Exporter mes données. Un fichier JSON contenant l'historique de vos ordonnances sera généré et partageable." },
    { q: "Comment changer mon mot de passe ?", a: "Allez dans Mon Compte > Sécurité. Entrez votre mot de passe actuel puis le nouveau mot de passe (minimum 8 caractères avec au moins une lettre et un chiffre)." },
    { q: "La traduction est-elle fiable ?", a: "La traduction utilise le modèle NLLB-200 de Meta, spécialisé pour 200+ langues. Elle est fournie à titre indicatif et ne remplace pas un avis médical professionnel." },
    { q: "Mes données sont-elles sécurisées ?", a: "Vos données sont stockées localement et transmises de manière sécurisée via HTTPS. Les mots de passe sont hashés avec les algorithmes standards de Django." },
    { q: "Comment contacter le support ?", a: "Pour toute question ou signalement de bug, contactez-nous à support@ordocare.fr ou ouvrez un ticket sur notre plateforme." },
  ];

  // ─── Sub-screen rendering ────────────────────────────────────────
  if (subScreen === 'medical') {
    return <MedicalProfileScreen onBack={() => setSubScreen(null)} />;
  }

  if (subScreen === 'language') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSubScreen(null)}>
          <ChevronLeft size={20} color={theme.colors.primary} />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Langue de traduction</Text>
        <Text style={styles.subScreenSubtitle}>Choisissez votre langue préférée pour la traduction des ordonnances.</Text>

        {loadingLangs ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : languages.length === 0 ? (
          <Text style={styles.errorText}>Service de traduction indisponible.</Text>
        ) : (
          <View style={styles.langList}>
            {languages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langItem, selectedLangCode === lang.code && styles.langItemSelected]}
                onPress={() => selectLanguage(lang)}
              >
                <Text style={[styles.langItemText, selectedLangCode === lang.code && styles.langItemTextSelected]}>
                  {lang.label}
                </Text>
                {selectedLangCode === lang.code && <Check size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  if (subScreen === 'security') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSubScreen(null)}>
          <ChevronLeft size={20} color={theme.colors.primary} />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Sécurité</Text>
        <Text style={styles.subScreenSubtitle}>Modifiez votre mot de passe</Text>

        <View style={styles.formCard}>
          <Text style={styles.inputLabel}>Mot de passe actuel</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Mot de passe actuel"
            placeholderTextColor={theme.colors.textLight}
          />

          <Text style={styles.inputLabel}>Nouveau mot de passe</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Minimum 8 caractères (lettre + chiffre)"
            placeholderTextColor={theme.colors.textLight}
          />

          <Text style={styles.inputLabel}>Confirmer le mot de passe</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirmer le mot de passe"
            placeholderTextColor={theme.colors.textLight}
          />

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleChangePassword}
            disabled={changingPassword}
          >
            {changingPassword ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Changer le mot de passe</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (subScreen === 'notifications') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSubScreen(null)}>
          <ChevronLeft size={20} color={theme.colors.primary} />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Notifications</Text>
        <Text style={styles.subScreenSubtitle}>Gérez vos notifications de rappels</Text>

        <ToggleItem
          icon={notificationsEnabled ? Bell : BellOff}
          title="Activer les notifications"
          value={notificationsEnabled}
          onChange={toggleNotifications}
        />

        <View style={styles.notifInfoCard}>
          <Text style={styles.notifInfoTitle}>Comment ça marche ?</Text>
          <Text style={styles.notifInfoText}>
            Lorsque les notifications sont activées, vous recevrez des rappels pour chaque prise de médicament programmée.
            Les rappels sont créés automatiquement lors de l'analyse d'une ordonnance.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (subScreen === 'faq') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSubScreen(null)}>
          <ChevronLeft size={20} color={theme.colors.primary} />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Aide & FAQ</Text>
        <Text style={styles.subScreenSubtitle}>Questions fréquemment posées</Text>

        <View style={styles.faqList}>
          {faqItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.faqItem}
              activeOpacity={0.7}
              onPress={() => setExpandedFaq(expandedFaq === index ? null : index)}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{item.q}</Text>
                <ChevronDown
                  size={18}
                  color={theme.colors.textLight}
                  style={{ transform: [{ rotate: expandedFaq === index ? '180deg' : '0deg' }] }}
                />
              </View>
              {expandedFaq === index && (
                <Text style={styles.faqAnswer}>{item.a}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>Besoin d'aide ?</Text>
          <Text style={styles.supportText}>Contactez-nous à support@ordocare.fr</Text>
        </View>
      </ScrollView>
    );
  }

  // ─── Main account screen ─────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Mon Compte</Text>

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.avatarText}>{getInitials(username)}</Text>
                )}
            </View>
            <View style={styles.profileInfo}>
                <Text style={styles.nameText}>{loading ? "Chargement..." : username}</Text>
                <Text style={styles.statusText}>Membre OrdoCare</Text>
            </View>
        </View>
        <TouchableOpacity style={styles.editBadge} onPress={() => setSubScreen('medical')}>
            <Text style={styles.editBadgeText}>Modifier</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Préférences</Text>
      <View style={styles.menuContainer}>
        <MenuItem
          icon={Globe}
          title="Langue"
          subtitle={selectedLangLabel}
          onPress={openLanguageScreen}
          first
        />
        <MenuItem
          icon={Bell}
          title="Notifications"
          subtitle={notificationsEnabled ? "Activées" : "Désactivées"}
          onPress={() => setSubScreen('notifications')}
        />
        <MenuItem
          icon={Shield}
          title="Sécurité"
          subtitle="Mot de passe"
          onPress={() => setSubScreen('security')}
          last
        />
      </View>

      <Text style={styles.sectionTitle}>Support</Text>
      <View style={styles.menuContainer}>
         <MenuItem
           icon={HelpCircle}
           title="Aide & FAQ"
           onPress={() => setSubScreen('faq')}
           first
           last
         />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
          <LogOut size={20} color={theme.colors.danger} style={{marginRight: 12}} />
          <Text style={styles.signOutText}>Se déconnecter</Text>
      </TouchableOpacity>

      <Text style={styles.version}>OrdoCare v1.0.0</Text>
    </ScrollView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.l, paddingBottom: 100 },

  screenTitle: { fontSize: 30, fontWeight: '800', color: theme.colors.textDark, marginBottom: theme.spacing.l },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textDark, marginTop: theme.spacing.xl, marginBottom: theme.spacing.s, marginLeft: theme.spacing.s },

  // Back button
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.m },
  backText: { color: theme.colors.primary, fontWeight: '600', fontSize: 16, marginLeft: 4 },

  // Sub-screen shared
  subScreenSubtitle: { fontSize: 15, color: theme.colors.textLight, marginBottom: theme.spacing.l },
  errorText: { fontSize: 14, color: theme.colors.textLight, fontStyle: 'italic', marginTop: 20 },

  // Profile card
  profileCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...theme.shadow,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center' },
  profileInfo: { flex: 1 },
  avatarContainer: {
    width: 70, height: 70,
    backgroundColor: theme.colors.primary,
    borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.m,
    borderWidth: 3, borderColor: theme.colors.card,
    ...theme.shadow
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  nameText: { fontSize: 20, fontWeight: '700', color: theme.colors.textDark },
  statusText: { fontSize: 14, color: theme.colors.textLight, marginTop: 2 },
  editBadge: { backgroundColor: theme.colors.secondary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  editBadgeText: { color: theme.colors.primary, fontWeight: '600', fontSize: 12 },

  menuContainer: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.card,
      overflow: 'hidden',
      ...theme.shadow
  },

  signOutButton: {
    marginTop: theme.spacing.xxl,
    backgroundColor: theme.colors.dangerBg,
    borderRadius: theme.borderRadius.button,
    padding: theme.spacing.m,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center'
  },
  signOutText: { color: theme.colors.danger, fontSize: 16, fontWeight: '700' },
  version: { textAlign: 'center', color: theme.colors.textLight, marginTop: theme.spacing.xl, fontSize: 12 },

  // Language sub-screen
  langList: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    overflow: 'hidden',
    ...theme.shadow,
  },
  langItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.background,
  },
  langItemSelected: { backgroundColor: theme.colors.secondary },
  langItemText: { fontSize: 16, color: theme.colors.textDark },
  langItemTextSelected: { color: theme.colors.primary, fontWeight: '600' },

  // Security sub-screen
  formCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.l,
    ...theme.shadow,
  },
  inputLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.textDark, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.input,
    padding: 14,
    fontSize: 16,
    color: theme.colors.textDark,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.button,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.spacing.l,
  },
  submitButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Notifications sub-screen
  notifInfoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.l,
    marginTop: theme.spacing.m,
    ...theme.shadow,
  },
  notifInfoTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.textDark, marginBottom: 8 },
  notifInfoText: { fontSize: 14, color: theme.colors.textLight, lineHeight: 20 },

  // FAQ sub-screen
  faqList: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    overflow: 'hidden',
    ...theme.shadow,
  },
  faqItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.background,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: { fontSize: 15, fontWeight: '600', color: theme.colors.textDark, flex: 1, marginRight: 12 },
  faqAnswer: { fontSize: 14, color: theme.colors.textLight, lineHeight: 20, marginTop: 12 },
  supportCard: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.l,
    marginTop: theme.spacing.l,
    alignItems: 'center',
  },
  supportTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.primary, marginBottom: 4 },
  supportText: { fontSize: 14, color: theme.colors.textLight },
});
