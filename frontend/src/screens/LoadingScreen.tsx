import React from 'react';
import { StyleSheet, View, Image, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../types';

export default function LoadingScreen() {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: theme.spacing.xl,
  },
  loader: {
    marginTop: theme.spacing.l,
  }
});
