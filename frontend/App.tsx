import { useState, useEffect } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem } from './src/services/secureStorage';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import type { Theme } from './src/types';
import TabBar from './src/components/TabBar';
import AccountScreen from './src/screens/AccountScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ScanScreen from './src/screens/ScanScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TranslationsScreen from './src/screens/TranslationsScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import LoadingScreen from './src/screens/LoadingScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';

function AppContent() {
  const { theme, isDark } = useTheme();
  const styles = getStyles(theme);
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<string>('welcome');
  const [activeTab, setActiveTab] = useState<string>('scan');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await getSecureItem('token');
        if (token) {
          const onboardingDone = await AsyncStorage.getItem('onboarding_done');
          if (onboardingDone === 'false') {
            setCurrentScreen('onboarding');
          } else {
            setCurrentScreen('app');
          }
        }
      } catch (error) {
        // Pas de token, rester sur welcome
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLoginSuccess = async (): Promise<void> => {
    const onboardingDone = await AsyncStorage.getItem('onboarding_done');
    if (onboardingDone === 'false') {
      setCurrentScreen('onboarding');
    } else {
      setCurrentScreen('app');
    }
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (currentScreen === 'onboarding') {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
        <OnboardingScreen onComplete={() => setCurrentScreen('app')} />
      </SafeAreaView>
    );
  }

  const renderAuthScreen = () => {
    switch (currentScreen) {
      case 'login':
        return <LoginScreen onNavigate={setCurrentScreen} onLoginSuccess={handleLoginSuccess} />;
      case 'register':
        return <RegisterScreen onNavigate={setCurrentScreen} onLoginSuccess={() => setCurrentScreen('onboarding')} />;
      default:
        return <WelcomeScreen onSignIn={() => setCurrentScreen('login')} onCreateAccount={() => setCurrentScreen('register')} />;
    }
  };

  if (currentScreen !== 'app') {
    return (
        <SafeAreaView style={styles.authContainer}>
             <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
            {renderAuthScreen()}
        </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />

      <View style={styles.contentContainer}>
        {activeTab === 'scan' && <ScanScreen />}
        {activeTab === 'history' && <HistoryScreen />}
        {activeTab === 'reminders' && <RemindersScreen />}
        {activeTab === 'translations' && <TranslationsScreen />}
        {activeTab === 'account' && <AccountScreen onLogout={() => setCurrentScreen('welcome')} />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  authContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
      flex: 1,
      paddingBottom: 80,
  }
});
