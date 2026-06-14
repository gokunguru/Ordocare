import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react-native';

// ─── Theme ──────────────────────────────────────────────────────────

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  card: string;
  textDark: string;
  textLight: string;
  success: string;
  danger: string;
  dangerBg: string;
  border: string;
}

export interface Theme {
  colors: ThemeColors;
  spacing: { s: number; m: number; l: number; xl: number; xxl: number };
  borderRadius: { card: number; button: number; input: number };
  shadow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  typography: { titleSize: number; subtitleSize: number };
  isDark: boolean;
}

export interface ThemeContextValue {
  isDark: boolean;
  toggleDarkMode: () => void;
  theme: Theme;
}

// ─── API ────────────────────────────────────────────────────────────

export interface AuthResponse {
  id: number;
  username: string;
  email: string;
  access: string;
  refresh?: string;
  access_token?: string;
  refresh_token?: string;
}

export interface Prescription {
  id: number;
  file: number;
  medicine_name: string;
  description: string;
  dosage_med: string;
  quantite: string;
  frequency: string;
  duration: string;
  start_date: string;
  expiry_date: string;
  condition_si: string;
  condition: string;
  created_at: string;
}

export interface Reminder {
  id: number;
  prescription: number;
  reminder_time: string;
  status: 'pending' | 'taken' | 'skipped';
  notified: boolean;
  photo: string | null;
  created_at: string;
  medicine_name?: string;
}

export interface FileRecord {
  id: number;
  user: number;
  file: string;
  filename: string;
  uploaded_at: string;
}

export interface Translation {
  id: number;
  file: number;
  original_text: string;
  translated_text: string;
  language_from: string;
  language_to: string;
  created_at: string;
}

export interface Language {
  code: string;
  name: string;
}

export interface OrdonnanceGroup {
  file_id: number;
  filename: string;
  uploaded_at: string;
  prescriptions?: Prescription[];
  reminders?: Reminder[];
  translations?: Translation[];
  medicine_summary?: string;
}

// ─── Components ─────────────────────────────────────────────────────

export type IconComponent = LucideIcon;

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  icon?: IconComponent;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}

export interface MenuItemProps {
  icon: IconComponent;
  title: string;
  subtitle?: string;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}

export interface TabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export interface ToggleItemProps {
  icon: IconComponent;
  title: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface EmptyStateProps {
  icon: IconComponent;
  title: string;
  subtitle: string;
}

// ─── Screens ────────────────────────────────────────────────────────

export interface AccountScreenProps {
  onLogout: () => void;
}

export interface LoginScreenProps {
  onNavigate: (screen: string) => void;
  onLoginSuccess: () => void;
}

export interface RegisterScreenProps {
  onNavigate: (screen: string) => void;
  onLoginSuccess: () => void;
}

export interface WelcomeScreenProps {
  onSignIn: () => void;
  onCreateAccount: () => void;
}

export interface OnboardingScreenProps {
  onComplete: () => void;
}

export interface ThemeProviderProps {
  children: ReactNode;
}
