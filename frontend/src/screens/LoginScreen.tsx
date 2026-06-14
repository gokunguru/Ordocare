import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, TouchableOpacity } from 'react-native';
import Button from '../components/Button';
import { loginUser } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';
import type { Theme, LoginScreenProps } from '../types';

export default function LoginScreen({ onNavigate, onLoginSuccess }: LoginScreenProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    const trimUser = username.trim();
    if (!trimUser) e.username = "Le nom d'utilisateur est requis";
    else if (trimUser.length < 3) e.username = "Minimum 3 caractères";
    if (!password) e.password = "Le mot de passe est requis";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await loginUser(username, password);
      onLoginSuccess();
    } catch (error) {
      showAlert("Erreur", "Identifiants incorrects ou problème serveur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bon retour</Text>
        <Text style={styles.subtitle}>Connectez-vous pour accéder à vos ordonnances.</Text>
      </View>

      <View style={styles.form}>
        <View>
          <TextInput
            style={[styles.input, errors.username && styles.inputError]}
            placeholder="Nom d'utilisateur"
            placeholderTextColor={theme.colors.textLight}
            value={username}
            onChangeText={(v) => { setUsername(v); setErrors(e => ({ ...e, username: undefined })); }}
            autoCapitalize="none"
          />
          {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
        </View>
        <View>
          <TextInput
            style={[styles.input, errors.password && styles.inputError]}
            placeholder="Mot de passe"
            placeholderTextColor={theme.colors.textLight}
            value={password}
            onChangeText={(v) => { setPassword(v); setErrors(e => ({ ...e, password: undefined })); }}
            secureTextEntry
          />
          {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
        </View>

        <View style={{ marginTop: theme.spacing.m }}>
          <Button title={loading ? "Connexion..." : "Se connecter"} onPress={handleLogin} loading={loading} fullWidth />
        </View>

        <TouchableOpacity onPress={() => onNavigate('register')} style={styles.linkContainer}>
          <Text style={styles.linkText}>Pas de compte ? <Text style={styles.linkBold}>S'inscrire</Text></Text>
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
