/**
 * Axios Global Setup
 *
 * Patches axios defaults to include auth interceptors for all API calls.
 * Run this once at app startup.
 */

import axios from 'axios';
import { useAuthStore } from '@/hooks/use-auth';
import { useLoginModalStore } from '@/lib/login-modal-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Set default baseURL
axios.defaults.baseURL = API_URL;
axios.defaults.timeout = 30000;

// Add JWT token to all requests
axios.interceptors.request.use(async (config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 thì đăng xuất, 403 thì không — xem ghi chú dài trong `api-client.ts`.
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;
    const url = error.config?.url || '';

    console.log('[API Error]', { status, message, url });

    const phienHong =
      status === 401 ||
      message?.includes('unauthorized') ||
      message?.includes('invalid token');

    if (phienHong && typeof window !== 'undefined') {
      useAuthStore.getState().logout();
      localStorage.removeItem('auth-storage');
      document.cookie = 'accessToken=; path=/; max-age=0';
      useLoginModalStore.getState().openModal();
    }
    return Promise.reject(error);
  },
);

console.log('[Axios] Configured with auth interceptors, baseURL:', API_URL);