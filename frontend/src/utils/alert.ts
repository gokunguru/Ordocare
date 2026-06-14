import { Alert, Platform } from 'react-native';

export const showAlert = (title: string, message: string): void => {
  if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
};
