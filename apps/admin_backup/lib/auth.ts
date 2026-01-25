import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AdminUser;
}

export const adminAuth = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await axios.post(`${API_URL}/auth/admin/login`, {
      email,
      password,
    });
    const data = response.data;

    // Store token and user
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_token', data.accessToken);
      localStorage.setItem('admin_user', JSON.stringify(data.user));
    }

    return data;
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
    }
  },

  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('admin_token');
  },

  getUser: (): AdminUser | null => {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem('admin_user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: (): boolean => {
    return !!adminAuth.getToken();
  },

  isAdmin: (): boolean => {
    const user = adminAuth.getUser();
    return user?.role === 'ADMIN';
  },
};

export default adminAuth;
