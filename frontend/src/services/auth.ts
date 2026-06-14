import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSecureItem, getSecureItem, deleteSecureItems } from './secureStorage';
import api from './api';
import type { AuthResponse } from '../types';

export const registerUser = async (username: string, email: string, password: string): Promise<AuthResponse> => {
  const response = await api.post('/auth/register/', {
    username,
    email,
    password
  });

  if (response.data.access) {
    await saveUserData(response.data);
    await AsyncStorage.setItem('onboarding_done', 'false');
  }
  return response.data;
};

export const loginUser = async (username: string, password: string): Promise<AuthResponse> => {
  const response = await api.post('/auth/login/', {
    username,
    password
  });

  if (response.data.access) {
    await saveUserData(response.data);
  }
  return response.data;
};

export const logoutUser = async (): Promise<void> => {
  await deleteSecureItems(['token', 'refresh_token', 'user_id', 'username']);
  await AsyncStorage.removeItem('onboarding_done');
};

const saveUserData = async (data: AuthResponse): Promise<void> => {
  await setSecureItem('token', data.access);
  if (data.refresh) {
    await setSecureItem('refresh_token', data.refresh);
  }
  await setSecureItem('user_id', data.id.toString());
  await setSecureItem('username', data.username);
};

export const getUserId = async (): Promise<string | null> => {
    return await getSecureItem('user_id');
};
