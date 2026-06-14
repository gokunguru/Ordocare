import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null;

async function loadNotificationsModule(): Promise<boolean> {
  if (Notifications) return true;
  try {
    Notifications = require('expo-notifications');
    return true;
  } catch {
    return false;
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const available = await loadNotificationsModule();
  if (!available || Platform.OS === 'web') return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function scheduleReminder(reminderId: number, medicineName: string, reminderTime: string): Promise<string | null> {
  const enabled = await AsyncStorage.getItem('notifications_enabled');
  if (enabled === 'false') return null;

  const available = await loadNotificationsModule();
  if (!available || Platform.OS === 'web') return null;

  const triggerDate = new Date(reminderTime);
  const now = new Date();
  if (triggerDate <= now) return null;

  const secondsUntil = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
  if (secondsUntil <= 0) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rappel de médicament',
      body: `Il est l'heure de prendre ${medicineName}`,
      data: { reminderId },
    },
    trigger: { seconds: secondsUntil },
  });

  return id;
}

export async function cancelAllReminders(): Promise<void> {
  const available = await loadNotificationsModule();
  if (!available || Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
