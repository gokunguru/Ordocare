import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, TouchableOpacity } from 'react-native';
import Button from '../components/Button';
import { registerUser } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';
import type { Theme, RegisterScreenProps } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen({ onNavigate, onLoginSuccess }: RegisterScreenProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    const trimUser = username.trim();
    const trimEmail = email.trim();

    if (!trimUser) e.username = "Le nom d'utilisateur est requis";
    else if (trimUser.length < 3) e.username = "Minimum 3 caractères";

    if (!trimEmail) e.email = "L'email est requis";
    else if (!EMAIL_REGEX.test(trimEmail)) e.email = "Format d'email invalide";

    if (!password) e.password = "Le mot de passe est requis";
    else if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
      e.password = "Min. 8 caractères avec au moins une lettre et un chiffre";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await registerUser(username.trim(), email.trim(), password);
      onLoginSuccess();
    } catch (error) {
      let msg = "Erreur lors de l'inscription";
      if (error.response?.data?.error) msg = error.response.data.error;
      else if (error.response) msg = `Erreur: ${error.response.status}`;
      showAlert("Oups", msg);
    } finally {
      setLoading(false);
    }
  };

  const clearError = (field) => setErrors(e => ({ ...e, [field]: undefined }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>Rejoignez OrdoCare pour gérer votre santé.</Text>
      </View>

      <View style={styles.form}>
        <View>
          <TextInput
            style={[styles.input, errors.username && styles.inputError]}
            placeholder="Nom d'utilisateur"
            placeholderTextColor={theme.colors.textLight}
            value={username}
            onChangeText={(v) => { setUsername(v); clearError('username'); }}
            autoCapitalize="none"
          />
          {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
        </View>
        <View>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            placeholder="Email"
            placeholderTextColor={theme.colors.textLight}
            value={email}
            onChangeText={(v) => { setEmail(v); clearError('email'); }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>
        <View>
          <TextInput
            style={[styles.input, errors.password && styles.inputError]}
            placeholder="Mot de passe (8 car. min., lettre + chiffre)"
            placeholderTextColor={theme.colors.textLight}
            value={password}
            onChangeText={(v) => { setPassword(v); clearError('password'); }}
            secureTextEntry
          />
          {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
        </View>

        <View style={{ marginTop: theme.spacing.m }}>
            <Button title={loading ? "Création..." : "S'inscrire"} onPress={handleRegister} loading={loading} fullWidth />
        </View>

        <TouchableOpacity onPress={() => onNavigate('login')} style={styles.linkContainer}>
          <Text style={styles.linkText}>Déjà un compte ? <Text style={styles.linkBold}>Se connecter</Text></Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onNavigate('welcome')} style={styles.backButton}>
          <Text style={styles.backText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.l, justifyContent: 'center', backgroundColor: theme.colors.background },
  header: { marginBottom: theme.spacing.xxl, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', color: theme.colors.textDark, marginBottom: 8 },
  subtitle: { fontSize: 16, color: theme.colors.textLight, textAlign: 'center' },
  form: { gap: theme.spacing.m },
  input: {
    backgroundColor: theme.colors.card,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 16,
    color: theme.colors.textDark,
  },
  inputError: { borderColor: '#e74c3c' },
  errorText: { color: '#e74c3c', fontSize: 12, marginTop: 4, marginLeft: 4 },
  linkContainer: { marginTop: theme.spacing.l, alignItems: 'center' },
  linkText: { color: theme.colors.textLight, fontSize: 15 },
  linkBold: { color: theme.colors.primary, fontWeight: '700' },
  backButton: { marginTop: theme.spacing.l, alignItems: 'center' },
  backText: { color: theme.colors.textLight, fontSize: 14 }
});
