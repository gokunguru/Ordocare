import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { getSecureItem, setSecureItem, deleteSecureItems } from './secureStorage';

let API_URL = Constants.expoConfig?.extra?.apiUrl
  || process.env.EXPO_PUBLIC_API_URL
  || 'http://localhost:8000/api/v1';

// Enforce HTTPS in production (reject insecure HTTP except localhost)
if (!__DEV__ && API_URL.startsWith('http://') && !API_URL.includes('localhost') && !API_URL.includes('127.0.0.1')) {
  API_URL = API_URL.replace('http://', 'https://');
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

// Intercepteur requête : ajoute automatiquement le token JWT
api.interceptors.request.use(
  async (config) => {
    const token = await getSecureItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur réponse : gère l'expiration du token (401)
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string | null) => void; reject: (error: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => {
    // Normalise les réponses paginées DRF : { results: [...] } → [...]
    if (response.data?.results && Array.isArray(response.data.results)) {
      response.data = response.data.results;
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Si 401 et pas déjà un retry et pas une requête auth
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/')
    ) {
      if (isRefreshing) {
        // Mettre en file d'attente pendant le refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getSecureItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newToken: string = response.data.access;
        await setSecureItem('token', newToken);
        // Save rotated refresh token if provided (JWT rotation enabled)
        if (response.data.refresh) {
          await setSecureItem('refresh_token', response.data.refresh);
        }

        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Token invalide — déconnexion
        await deleteSecureItems(['token', 'refresh_token', 'user_id', 'username']);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
