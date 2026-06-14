import { showAlert } from '../utils/alert';

export default function MedicalProfileScreen({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSSN, setShowSSN] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);
  const [profile, setProfile] = useState({
    full_name: '',
    birth_date: '',
    gender: '',
    blood_type: '',
    height: '',
    weight: '',
    allergies: '',
    chronic_conditions: '',
    surgeries: '',
    family_history: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    doctor_name: '',
    doctor_phone: '',
    social_security_number: '',
    insurance_company: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      const id = userId;
      const response = await api.get(`/users/${id}/medical-profile/`);
      const data = response.data;
      if (!mountedRef.current) return;
      setProfile({
        full_name: data.full_name || '',
        birth_date: data.birth_date || '',
        gender: data.gender || '',
        blood_type: data.blood_type || '',
        height: data.height ? String(data.height) : '',
        weight: data.weight ? String(data.weight) : '',
        allergies: data.allergies || '',
        chronic_conditions: data.chronic_conditions || '',
        surgeries: data.surgeries || '',
        family_history: data.family_history || '',
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
        doctor_name: data.doctor_name || '',
        doctor_phone: data.doctor_phone || '',
        social_security_number: data.social_security_number || '',
        insurance_company: data.insurance_company || '',
      });
    } catch (_) {
      // Erreur silencieuse en production
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const userId = await getUserId();
      if (!userId) return;
      const id = userId;
      const payload = {
        ...profile,
        height: profile.height ? parseInt(profile.height) : null,
        weight: profile.weight ? parseFloat(profile.weight) : null,
      };
      await api.patch(`/users/${id}/medical-profile/`, payload);
      showAlert('Succès', 'Profil médical mis à jour.');
    } catch (_) {
      showAlert('Erreur', 'Impossible de sauvegarder le profil.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const maskSSN = (value) => {
    if (!value || value.length <= 4) return value;
    return '•'.repeat(value.length - 4) + value.slice(-4);
  };

  const renderInput = (label: string, field: string, options: { multiline?: boolean; keyboardType?: KeyboardTypeOptions } = {}) => {
    const isSSN = field === 'social_security_number';
    const displayValue = isSSN && !showSSN ? maskSSN(profile[field]) : profile[field];

    return (
      <View style={styles.inputGroup}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.inputLabel}>{label}</Text>
          {isSSN && profile[field] ? (
            <TouchableOpacity onPress={() => setShowSSN(!showSSN)}>
              <Text style={{ fontSize: 12, color: theme.colors.primary }}>{showSSN ? 'Masquer' : 'Afficher'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TextInput
          style={[styles.input, options.multiline && styles.inputMultiline]}
          value={isSSN && !showSSN ? displayValue : profile[field]}
          onChangeText={(val) => updateField(field, val)}
          onFocus={isSSN ? () => setShowSSN(true) : undefined}
          onBlur={isSSN ? () => setShowSSN(false) : undefined}
          placeholder={label}
          placeholderTextColor={theme.colors.textLight}
          keyboardType={options.keyboardType || 'default'}
          multiline={options.multiline || false}
          numberOfLines={options.multiline ? 3 : 1}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color={theme.colors.primary} />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={saveProfile} disabled={saving} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Save size={18} color="#fff" />
              <Text style={styles.saveText}>Sauvegarder</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profil médical</Text>
        <Text style={styles.subtitle}>Vos informations de santé</Text>

        <Text style={styles.sectionTitle}>Informations personnelles</Text>
        <View style={styles.card}>
          {renderInput('Nom complet', 'full_name')}
          {renderInput('Date de naissance', 'birth_date')}
          {renderInput('Genre', 'gender')}
        </View>

        <Text style={styles.sectionTitle}>Données physiques</Text>
        <View style={styles.card}>
          {renderInput('Groupe sanguin', 'blood_type')}
          {renderInput('Taille (cm)', 'height', { keyboardType: 'numeric' })}
          {renderInput('Poids (kg)', 'weight', { keyboardType: 'decimal-pad' })}
        </View>

        <Text style={styles.sectionTitle}>Antécédents médicaux</Text>
        <View style={styles.card}>
          {renderInput('Allergies', 'allergies', { multiline: true })}
          {renderInput('Maladies chroniques', 'chronic_conditions', { multiline: true })}
          {renderInput('Chirurgies', 'surgeries', { multiline: true })}
          {renderInput('Antécédents familiaux', 'family_history', { multiline: true })}
        </View>

        <Text style={styles.sectionTitle}>Contact d'urgence</Text>
        <View style={styles.card}>
          {renderInput('Nom du contact', 'emergency_contact_name')}
          {renderInput('Téléphone du contact', 'emergency_contact_phone', { keyboardType: 'phone-pad' })}
        </View>

        <Text style={styles.sectionTitle}>Médecin traitant</Text>
        <View style={styles.card}>
          {renderInput('Nom du médecin', 'doctor_name')}
          {renderInput('Téléphone du médecin', 'doctor_phone', { keyboardType: 'phone-pad' })}
        </View>

        <Text style={styles.sectionTitle}>Assurance</Text>
        <View style={styles.card}>
          {renderInput('Numéro de sécurité sociale', 'social_security_number')}
          {renderInput('Compagnie d\'assurance', 'insurance_company')}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: theme.colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.m,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 16, color: theme.colors.primary, fontWeight: '600' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.button,
    gap: 6,
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { flex: 1 },
  content: { padding: theme.spacing.l, paddingBottom: 100 },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.textDark, marginBottom: 8 },
  subtitle: { fontSize: 16, color: theme.colors.textLight, marginBottom: theme.spacing.l },
  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: theme.colors.textDark,
    marginTop: theme.spacing.l, marginBottom: theme.spacing.s,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.m,
    ...theme.shadow,
  },
  inputGroup: { marginBottom: theme.spacing.m },
  inputLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textLight, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.input,
    padding: theme.spacing.m,
    fontSize: 16,
    color: theme.colors.textDark,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
});
