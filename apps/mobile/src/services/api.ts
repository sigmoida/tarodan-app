import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Expo'nun belirlediği LAN IP'sini al
const getApiUrl = () => {
  // Expo Go'nun çalıştığı bilgisayarın IP'si
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  
  if (expoHost) {
    // Expo host IP'sini kullan - API /api prefix'i ile
    return `http://${expoHost}:3001/api`;
  }
  
  // Fallback - Android emulator için 10.0.2.2, diğerleri için localhost
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001/api';
  }
  
  return 'http://localhost:3001/api';
};

const API_URL = getApiUrl();

console.log('📡 API URL:', API_URL);
console.log('📱 Platform:', Platform.OS);
console.log('🌐 Expo Host:', Constants.expoConfig?.hostUri);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken } = response.data;
          await SecureStore.setItemAsync('accessToken', accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        router.replace('/(auth)/login');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
