import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardTypeOptions,
  Platform
} from 'react-native';
import { showAlert } from '../utils/alert';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem } from '../services/secureStorage';
import { ChevronLeft } from '../utils/icons';
import api from '../services/api';
import { getUserId } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import type { Theme, OnboardingScreenProps } from '../types';

const STEPS = [
  { id: 'welcome', title: 'Bienvenue' },
  { id: 'personal', title: 'Infos personnelles' },
  { id: 'health', title: 'Santé' },
  { id: 'emergency', title: 'Urgence' },
];

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [bmi, setBmi] = useState<string | null>(null);

  const [hasAllergies, setHasAllergies] = useState<boolean | null>(null);
  const [hasChronic, setHasChronic] = useState<boolean | null>(null);

  const [profile, setProfile] = useState({
    full_name: '',
    birth_date: '',
    gender: '',
    blood_type: '',
    height: '',
    weight: '',
    allergies: '',
    chronic_conditions: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    doctor_name: '',
    doctor_phone: '',
  });

  useEffect(() => {
    getSecureItem('username').then(name => {
      if (name) setUsername(name);
    });
  }, []);

  useEffect(() => {
    const height = parseFloat(profile.height);
    const weight = parseFloat(profile.weight);

    if (height && weight && height > 0) {
      const h = height / 100;
      const calculated = weight / (h * h);
      setBmi(calculated.toFixed(1));
    } else {
      setBmi(null);
    }
  }, [profile.height, profile.weight]);

  const updateField = (field: string, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const validatePhone = (phone: string) => {
    const regex = /^[0-9+\s()-]{6,20}$/;
    return regex.test(phone);
  };

  const handleFinish = async () => {
    if (profile.emergency_contact_phone &&
      !validatePhone(profile.emergency_contact_phone)) {
      showAlert('Erreur', 'Numéro de téléphone invalide.');
      return;
    }


    setSaving(true);
    try {
      const userId = await getUserId();
      if (!userId) return;

      await api.patch(`/users/${userId}/medical-profile/`, {
        ...profile,
        height: profile.height ? parseInt(profile.height) : null,
        weight: profile.weight ? parseFloat(profile.weight) : null,
      });

      await AsyncStorage.setItem('onboarding_done', 'true');
      onComplete();
    } catch (_) {
      showAlert('Erreur', 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  };
  const handleSkip = async () => {
    await AsyncStorage.setItem('onboarding_done', 'true');
    onComplete();
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleFinish();
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {STEPS.map((_, i) => (
        <View key={i} style={[styles.dot, i === step ? styles.dotActive : styles.dotInactive]} />
      ))}
    </View>
  );

  /* ------------------- WELCOME ------------------- */

  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      <Image
        source={require('../../assets/logo.png')}
        style={styles.welcomeLogo}
        resizeMode="contain"
      />
      <Text style={styles.welcomeTitle}>
        Bienvenue {username} 👋
      </Text>
      <Text style={styles.welcomeSubtitle}>
        Remplissez votre profil médical pour une meilleure prise en charge.
      </Text>
      <Text style={styles.welcomeNote}>
        Vos données restent privées et sécurisées.
      </Text>
    </View>
  );

  /* ------------------- PERSONAL ------------------- */

  const renderPersonal = () => (
    <View>
      <Text style={styles.stepTitle}>Informations personnelles</Text>
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Nom complet</Text>
        <TextInput
          style={styles.input}
          value={profile.full_name}
          onChangeText={(v) => updateField('full_name', v)}
        />

        <Text style={styles.inputLabel}>Date de naissance</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text>{profile.birth_date || 'Sélectionner une date'}</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={profile.birth_date ? new Date(profile.birth_date) : new Date()}
            mode="date"
            maximumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) updateField('birth_date', date.toISOString().split('T')[0]);
            }}
          />
        )}

        <Text style={styles.inputLabel}>Genre</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={profile.gender}
            onValueChange={(val) => updateField('gender', val)}
          >
            <Picker.Item label="Sélectionner un genre" value="" />
            <Picker.Item label="Homme" value="H" />
            <Picker.Item label="Femme" value="F" />
            <Picker.Item label="Non défini" value="ND" />
          </Picker>
        </View>
      </View>
    </View>
  );

  /* ------------------- HEALTH ------------------- */

  const renderHealth = () => (
    <View>
      <Text style={styles.stepTitle}>Données de santé</Text>
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Groupe sanguin</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={profile.blood_type}
            onValueChange={(val) => updateField('blood_type', val)}
          >
            <Picker.Item label="Sélectionner un groupe" value="" />
            <Picker.Item label="A+" value="A+" />
            <Picker.Item label="A-" value="A-" />
            <Picker.Item label="B+" value="B+" />
            <Picker.Item label="B-" value="B-" />
            <Picker.Item label="AB+" value="AB+" />
            <Picker.Item label="AB-" value="AB-" />
            <Picker.Item label="O+" value="O+" />
            <Picker.Item label="O-" value="O-" />
          </Picker>
        </View>

        <Text style={styles.inputLabel}>Taille (cm)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={profile.height}
          onChangeText={(v) => updateField('height', v)}
        />

        <Text style={styles.inputLabel}>Poids (kg)</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={profile.weight}
          onChangeText={(v) => updateField('weight', v)}
        />

        {bmi && <Text style={styles.bmiText}>IMC : {bmi}</Text>}
      </View>
    </View>
  );

  /* ------------------- EMERGENCY ------------------- */

  const renderEmergency = () => (
    <View>
      <Text style={styles.stepTitle}>Contact d'urgence</Text>
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Nom</Text>
        <TextInput
          style={styles.input}
          value={profile.emergency_contact_name}
          onChangeText={(v) => updateField('emergency_contact_name', v)}
        />

        <Text style={styles.inputLabel}>Téléphone</Text>
        <TextInput
          style={styles.input}
          keyboardType="phone-pad"
          value={profile.emergency_contact_phone}
          onChangeText={(v) => updateField('emergency_contact_phone', v)}
        />
      </View>
    </View>
  );

  /* ------------------- RETURN ------------------- */

  const isLastStep = step === STEPS.length - 1;
  const isFirstStep = step === 0;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {!isFirstStep ? (
          <TouchableOpacity onPress={back} style={styles.backButton}>
            <ChevronLeft size={22} color={theme.colors.primary} />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
        ) : <View />}
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      {renderDots()}

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        {step === 0 && renderWelcome()}
        {step === 1 && renderPersonal()}
        {step === 2 && renderHealth()}
        {step === 3 && renderEmergency()}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={next}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextButtonText}>
              {isFirstStep ? 'Commencer' : isLastStep ? 'Terminer' : 'Suivant'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
} const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  /* ================= TOP BAR ================= */

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.m,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  backText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '600',
  },

  skipText: {
    fontSize: 15,
    color: theme.colors.textLight,
    fontWeight: '600',
  },

  /* ================= DOTS ================= */

  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing.s,
  },

  dot: {
    height: 8,
    borderRadius: 4,
  },

  dotActive: {
    backgroundColor: theme.colors.primary,
    width: 28,
  },

  dotInactive: {
    backgroundColor: theme.colors.border,
    width: 8,
  },

  /* ================= SCROLL ================= */

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    padding: theme.spacing.l,
    paddingBottom: 40,
  },

  /* ================= WELCOME ================= */

  welcomeContainer: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
  },

  welcomeLogo: {
    width: 110,
    height: 110,
    marginBottom: theme.spacing.l,
  },

  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textDark,
    textAlign: 'center',
    marginBottom: theme.spacing.m,
  },

  welcomeSubtitle: {
    fontSize: 16,
    color: theme.colors.textLight,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: theme.spacing.m,
    marginBottom: theme.spacing.l,
  },

  welcomeNote: {
    fontSize: 13,
    color: theme.colors.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  /* ================= TITLES ================= */

  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.textDark,
    marginBottom: 6,
  },

  /* ================= CARDS ================= */

  card: {
    backgroundColor: theme.colors.card,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.card,
    marginBottom: theme.spacing.l,
    ...theme.shadow,
  },

  /* ================= INPUTS ================= */

  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
    color: theme.colors.textLight,
  },

  input: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 16,
    color: theme.colors.textDark,
  },

  pickerContainer: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.input,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
  },

  bmiText: {
    marginTop: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  /* ================= BOTTOM BAR ================= */

  bottomBar: {
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.m,
    paddingBottom: theme.spacing.xl,
  },

  nextButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.button,
    alignItems: 'center',
    ...theme.shadow,
  },

  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});