import React from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import Button from '../components/Button';
import { useTheme } from '../context/ThemeContext';
import type { Theme, WelcomeScreenProps } from '../types';

export default function WelcomeScreen({ onSignIn, onCreateAccount }: WelcomeScreenProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Bienvenue sur OrdoCare</Text>
        <Text style={styles.subtitle}>
          Votre assistant médical personnel. Scannez, analysez et gérez vos ordonnances en toute simplicité.
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.actions}>
            <Button title="Créer un compte" onPress={onCreateAccount} fullWidth />
            <View style={{ height: theme.spacing.m }} />
            <Button title="Se connecter" variant="secondary" onPress={onSignIn} fullWidth />
        </View>

      </View>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.l,
    justifyContent: 'space-between',
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
      width: 120,
      height: 120,
      marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textDark,
    textAlign: 'center',
    marginBottom: theme.spacing.m,
  },
  subtitle: {
    fontSize: theme.typography.subtitleSize,
    color: theme.colors.textLight,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: theme.spacing.m,
  },
  footer: {
      paddingBottom: theme.spacing.xl,
  },
  actions: {
      width: '100%',
  },
  guestButton: {
      padding: theme.spacing.l,
      alignItems: 'center',
      marginTop: theme.spacing.s
  },
  guestText: {
      color: theme.colors.textLight,
      fontWeight: '600'
  }
});
