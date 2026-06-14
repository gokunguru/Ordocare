import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Image, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import Button from '../components/Button';
import { Camera, Upload, Globe, ChevronRight, X } from '../utils/icons';
import { showAlert } from '../utils/alert';
import api from '../services/api';
import { getUserId } from '../services/auth';
import { requestNotificationPermissions, scheduleReminder } from '../services/notifications';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../types';
import * as DocumentPicker from 'expo-document-picker';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'];

export default function ScanScreen() {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const mountedRef = useRef(true);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [selectedLang, setSelectedLang] = useState(null);
  const [translatedText, setTranslatedText] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langError, setLangError] = useState(false);
  const [ocrMode, setOcrMode] = useState('printed');
  const [showTranslateModal, setShowTranslateModal] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const prefLang = await AsyncStorage.getItem('preferred_lang');
        if (!mountedRef.current) return;

        const response = await api.get('/translation/languages/');
        if (!mountedRef.current) return;
        const list = Array.isArray(response.data) ? response.data : [];
        setLanguages(list);
        if (list.length === 0) setLangError(true);

        if (prefLang && list.length > 0) {
          const saved = list.find(l => l.code === prefLang);
          if (saved) setSelectedLang(saved);
        }
      } catch (_) {
        if (mountedRef.current) setLangError(true);
      }
    };
    init();
    return () => { mountedRef.current = false; };
  }, []);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission refusée', 'Nous avons besoin de la caméra.');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
      setResult(null);
      setTranslatedText(null);
    }
  };
  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
    if (status !== 'granted') {
      showAlert('Permission refusée', 'Accès à la galerie requis.');
      return;
    }
  
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
  
    if (!result.canceled) {
      setImage(result.assets[0]);
      setResult(null);
      setTranslatedText(null);
    }
  };
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
  
      if (result.canceled) return;
  
      const file = result.assets[0];
  
      const filename = file.name;
      const ext = (filename.split('.').pop() || '').toLowerCase();
  
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        showAlert(
          'Format invalide',
          `Formats acceptés : ${ALLOWED_EXTENSIONS.join(', ')}`
        );
        return;
      }
  
      if (file.size && file.size > MAX_FILE_SIZE) {
        showAlert(
          'Fichier trop volumineux',
          `Maximum ${MAX_FILE_SIZE / (1024 * 1024)} Mo`
        );
        return;
      }
  
      setImage({
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
      });
  
      setResult(null);
      setTranslatedText(null);
  
    } catch (err) {
      showAlert('Erreur', 'Impossible d’ouvrir le fichier.');
    }
  };

  const getTranslatableText = (data) => {
    const r = data || result;
    if (r?.prescriptions?.length > 0) {
      return r.prescriptions
        .map(p => `${p.medicine_name} ${p.dosage_med} ${p.frequency || ''} ${p.duration || ''}`.trim())
        .filter(t => t)
        .join('\n');
    }
    return r?.raw_text || '';
  };

  const translateResult = async () => {
    if (!result || !selectedLang) return;
    const text = getTranslatableText(result);
    if (!text.trim()) return;
    setTranslating(true);
    try {
      const response = await api.post('/translation/translate/', {
        text,
        src_lang: 'fra_Latn',
        tgt_lang: selectedLang.code,
      });
      const translated = response.data.translated_text;
      setTranslatedText(translated);

      // Sauvegarder la traduction en base
      try {
        await api.post('/translations/', {
          file: result.id,
          original_text: text,
          translated_text: translated,
          language_from: 'fra_Latn',
          language_to: selectedLang.code,
        });
      } catch (_) {
        // Sauvegarde non critique — traduction déjà affichée
      }
    } catch (error) {
      const msg = error?.response?.data?.error || 'Service de traduction indisponible. Vérifiez que le service ML est lancé.';
      showAlert('Erreur de traduction', msg);
    } finally {
      setTranslating(false);
    }
  };

  const uploadImage = async () => {
    if (!image) return;

    // Validate file size (if available)
    if (image.fileSize && image.fileSize > MAX_FILE_SIZE) {
      showAlert('Fichier trop gros', `Fichier trop volumineux (max ${MAX_FILE_SIZE / (1024 * 1024)} Mo)`);
      return;
    }

    setLoading(true);
    setTranslatedText(null);

    try {
      const formData = new FormData();
      const filename = image.name || image.fileName || image.uri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = image.mimeType || (match ? `image/${match[1]}` : 'image/jpeg');

      if (Platform.OS === 'web') {
        const resp = await fetch(image.uri);
        const blob = await resp.blob();
        formData.append('file', blob, filename);
      } else {
        formData.append('file', { uri: image.uri, name: filename, type } as any);
      }
      const endpoint = ocrMode === 'handwritten' ? '/files/upload-handwritten/' : '/files/upload/';
      const response = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(response.data);
      setShowTranslateModal(true);

      // Programmer les notifications pour les rappels créés
      if (response.data.reminders_created > 0) {
        try {
          const granted = await requestNotificationPermissions();
          if (granted) {
            const userId = await getUserId();
            const remindersRes = await api.get(`/users/${userId}/reminders/`);
            const data = remindersRes.data.results || remindersRes.data;
            const ordonnance = Array.isArray(data)
              ? data.find(o => o.file_id === response.data.id)
              : null;
            if (ordonnance?.prescriptions) {
              for (const p of ordonnance.prescriptions) {
                if (p.next_reminder_id && p.next_reminder_time) {
                  await scheduleReminder(p.next_reminder_id, p.medicine_name, p.next_reminder_time);
                }
              }
            }
          }
        } catch (_) {
          // Notifications non critiques
        }
      }

    } catch (error) {
      showAlert(
        'Erreur',
        error.response?.status === 401
          ? 'Vous devez être connecté pour analyser une ordonnance.'
          : 'Impossible de contacter le serveur.',
      );
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowTranslateModal(false);
    setShowLangPicker(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Scanner une ordonnance</Text>
        <Text style={styles.subtitle}>Prenez une photo claire de votre document.</Text>
      </View>

      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeButton, ocrMode === 'printed' && styles.modeButtonActive]}
          onPress={() => setOcrMode('printed')}
        >
          <Text style={[styles.modeButtonText, ocrMode === 'printed' && styles.modeButtonTextActive]}>
            Imprimée
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, ocrMode === 'handwritten' && styles.modeButtonActive]}
          onPress={() => setOcrMode('handwritten')}
        >
          <Text style={[styles.modeButtonText, ocrMode === 'handwritten' && styles.modeButtonTextActive]}>
            Manuscrite
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.uploadCard, image ? styles.uploadCardFilled : null]}>
        {image ? (
          <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderContainer}>
            <View style={styles.iconCircle}>
                <Camera size={40} color={theme.colors.primary} />
            </View>
            <Text style={styles.uploadText}>Appuyez pour scanner</Text>
            <Text style={styles.uploadSubText}>
              {ocrMode === 'printed' ? 'Ordonnance imprimée (Tesseract)' : 'Ordonnance manuscrite (TrOCR)'}
            </Text>
          </View>
        )}
      </View>

      {result && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
             <Text style={styles.resultTitle}>Analyse terminée</Text>
          </View>
          {result.prescriptions?.length > 0 ? (
            <>
              <Text style={styles.resultLabel}>Médicaments détectés :</Text>
              {result.prescriptions.map((p, index) => (
                <View key={index} style={styles.medItem}>
                  <Text style={styles.medName}>• {p.medicine_name}</Text>
                  <Text style={styles.medDosage}>{p.dosage_med}</Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.resultLabel}>Texte extrait :</Text>
              <Text style={styles.rawText}>{result.raw_text || 'Aucun texte détecté'}</Text>
            </>
          )}

          {result.reminders_created > 0 && (
            <Text style={styles.remindersInfo}>
              {result.reminders_created} rappel(s) créé(s) automatiquement
            </Text>
          )}

          <TouchableOpacity
            style={styles.openTranslateButton}
            onPress={() => { setTranslatedText(null); setShowTranslateModal(true); }}
          >
            <Globe size={16} color={theme.colors.primary} />
            <Text style={styles.openTranslateText}>Traduire l'ordonnance</Text>
          </TouchableOpacity>
        </View>
      )}

<View style={styles.buttonsContainer}>
  {!image ? (
    <>
      <Button
        variant="primary"
        fullWidth
        icon={Camera}
        onPress={takePhoto}
        title="Prendre une photo"
        style={{ marginBottom: theme.spacing.s }}
      />

      <Button
        variant="secondary"
        fullWidth
        icon={Upload}
        onPress={pickFromGallery}
        title="Importer depuis la galerie"
        style={{ marginBottom: theme.spacing.s }}
      />

      <Button
        variant="secondary"
        fullWidth
        icon={Upload}
        onPress={pickFile}
        title="Importer un fichier (PDF / Image)"
      />
    </>
  ) : (
    <>
      <Button
        variant="secondary"
        fullWidth
        icon={Camera}
        onPress={takePhoto}
        title="Reprendre"
        style={{ marginBottom: theme.spacing.s }}
      />

      <Button
        variant="primary"
        fullWidth
        icon={Upload}
        onPress={uploadImage}
        loading={loading}
        title={loading ? "Analyse..." : "Analyser"}
      />
    </>
  )}
</View>

      {/* Modal de traduction */}
      <Modal
        visible={showTranslateModal}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Globe size={20} color={theme.colors.primary} />
                <Text style={styles.modalTitle}>Traduction</Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.modalClose}>
                <X size={22} color={theme.colors.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Résumé des médicaments détectés */}
              {result?.prescriptions?.length > 0 && (
                <View style={styles.modalMedSummary}>
                  <Text style={styles.modalMedTitle}>Médicaments détectés</Text>
                  {result.prescriptions.map((p, i) => (
                    <Text key={i} style={styles.modalMedItem}>• {p.medicine_name} {p.dosage_med || ''}</Text>
                  ))}
                </View>
              )}

              {langError ? (
                <Text style={styles.langErrorText}>
                  Service de traduction indisponible.
                </Text>
              ) : (
                <>
                  <Text style={styles.modalLabel}>Langue cible</Text>
                  <TouchableOpacity
                    style={styles.langSelector}
                    onPress={() => setShowLangPicker(!showLangPicker)}
                  >
                    <Text style={styles.langSelectorText}>
                      {selectedLang ? selectedLang.label : 'Choisir une langue...'}
                    </Text>
                    <ChevronRight size={16} color={theme.colors.textLight}
                      style={{ transform: [{ rotate: showLangPicker ? '90deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>

                  {showLangPicker && (
                    <View style={styles.langList}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                        {languages.map((lang) => (
                          <TouchableOpacity
                            key={lang.code}
                            style={[
                              styles.langOption,
                              selectedLang?.code === lang.code && styles.langOptionSelected,
                            ]}
                            onPress={() => {
                              setSelectedLang(lang);
                              setShowLangPicker(false);
                              setTranslatedText(null);
                            }}
                          >
                            <Text style={[
                              styles.langOptionText,
                              selectedLang?.code === lang.code && styles.langOptionTextSelected,
                            ]}>
                              {lang.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {selectedLang && !showLangPicker && (
                    <TouchableOpacity
                      style={styles.translateButton}
                      onPress={translateResult}
                      disabled={translating}
                    >
                      {translating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.translateButtonText}>
                          Traduire en {selectedLang.label}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {translatedText && (
                    <View style={styles.translatedCard}>
                      <Text style={styles.translatedLabel}>Traduction ({selectedLang?.label}) :</Text>
                      <Text style={styles.translatedContent}>{translatedText}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contentContainer: { padding: theme.spacing.l, paddingBottom: 100 },
  header: { marginBottom: theme.spacing.m },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.textDark, marginBottom: 8 },
  subtitle: { fontSize: 16, color: theme.colors.textLight },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.button,
    padding: 4,
    marginBottom: theme.spacing.m,
    ...theme.shadow,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: theme.borderRadius.button - 2,
  },
  modeButtonActive: { backgroundColor: theme.colors.primary },
  modeButtonText: { fontSize: 14, fontWeight: '600', color: theme.colors.textLight },
  modeButtonTextActive: { color: '#fff' },
  uploadCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.m,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'solid',
    overflow: 'hidden',
  },
  uploadCardFilled: { borderWidth: 0, ...theme.shadow },
  previewImage: { width: '100%', height: '100%' },
  placeholderContainer: { alignItems: 'center' },
  iconCircle: {
    width: 80, height: 80, backgroundColor: theme.colors.secondary,
    borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.m,
  },
  uploadText: { fontSize: 18, fontWeight: '600', color: theme.colors.textDark, marginBottom: 4 },
  uploadSubText: { fontSize: 14, color: theme.colors.textLight },
  resultCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    marginBottom: theme.spacing.m,
    padding: theme.spacing.l,
    borderLeftWidth: 6,
    borderLeftColor: theme.colors.success,
    ...theme.shadow,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.m },
  resultTitle: { fontWeight: '700', fontSize: 18, color: theme.colors.success },
  resultLabel: { fontWeight: '600', color: theme.colors.textDark, marginBottom: theme.spacing.s },
  medItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.background },
  medName: { fontSize: 16, fontWeight: '500', color: theme.colors.textDark },
  medDosage: { color: theme.colors.textLight, fontWeight: '600' },
  rawText: { fontSize: 14, color: theme.colors.textDark, lineHeight: 20, backgroundColor: theme.colors.background, padding: theme.spacing.s, borderRadius: theme.borderRadius.input },
  remindersInfo: { fontSize: 13, color: theme.colors.success, fontWeight: '600', marginTop: theme.spacing.s },
  openTranslateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.m,
    paddingVertical: 10,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.button,
  },
  openTranslateText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
    marginLeft: 8,
  },
  buttonsContainer: { marginTop: theme.spacing.s },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.l,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textDark, marginLeft: 10 },
  modalClose: { padding: 4 },
  modalBody: { padding: theme.spacing.l },
  modalMedSummary: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.input,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
  },
  modalMedTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.success, marginBottom: 6 },
  modalMedItem: { fontSize: 13, color: theme.colors.textDark, lineHeight: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.textDark, marginBottom: 8 },

  // Lang picker (in modal)
  langErrorText: { fontSize: 13, color: theme.colors.textLight, fontStyle: 'italic' },
  langSelector: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.colors.background, padding: 14,
    borderRadius: theme.borderRadius.input, marginBottom: theme.spacing.s,
  },
  langSelectorText: { fontSize: 15, color: theme.colors.textDark },
  langList: {
    backgroundColor: theme.colors.card, borderRadius: theme.borderRadius.input,
    borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.s,
  },
  langOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.background },
  langOptionSelected: { backgroundColor: theme.colors.secondary },
  langOptionText: { fontSize: 14, color: theme.colors.textDark },
  langOptionTextSelected: { color: theme.colors.primary, fontWeight: '600' },
  translateButton: {
    backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.button,
    paddingVertical: 14, alignItems: 'center', marginTop: theme.spacing.s,
  },
  translateButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  translatedCard: {
    marginTop: theme.spacing.l, backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.input, padding: theme.spacing.m,
  },
  translatedLabel: { fontWeight: '600', color: theme.colors.primary, marginBottom: 6 },
  translatedContent: { fontSize: 15, color: theme.colors.textDark, lineHeight: 22 },
});
