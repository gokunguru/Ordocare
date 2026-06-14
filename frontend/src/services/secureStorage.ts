import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SecureStore: any = null;

if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch {
    // expo-secure-store non disponible, fallback sur AsyncStorage
  }
}

/**
 * Stockage sécurisé : expo-secure-store sur mobile, AsyncStorage sur web.
 * Les tokens JWT sont stockés de manière sécurisée sur mobile (Keychain/Keystore).
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (SecureStore) {
    return await SecureStore.getItemAsync(key);
  }
  return await AsyncStorage.getItem(key);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}

export async function deleteSecureItems(keys: string[]): Promise<void> {
  for (const key of keys) {
    await deleteSecureItem(key);
  }
}
