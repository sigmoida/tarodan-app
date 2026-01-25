import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const adminApi = axios.create({
  baseURL: `${API_URL}/admin`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
adminApi.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('admin_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Dashboard
export const getDashboard = () => adminApi.get('/dashboard');

// Users
export const getUsers = (params?: any) => adminApi.get('/users', { params });
export const getUser = (id: string) => adminApi.get(`/users/${id}`);
export const updateUser = (id: string, data: any) => adminApi.patch(`/users/${id}`, data);
export const suspendUser = (id: string) => adminApi.post(`/users/${id}/suspend`);
export const activateUser = (id: string) => adminApi.post(`/users/${id}/activate`);

// Products
export const getProducts = (params?: any) => adminApi.get('/products', { params });
export const getProduct = (id: string) => adminApi.get(`/products/${id}`);
export const approveProduct = (id: string) => adminApi.post(`/products/${id}/approve`);
export const rejectProduct = (id: string, reason: string) => 
  adminApi.post(`/products/${id}/reject`, { reason });

// Orders
export const getOrders = (params?: any) => adminApi.get('/orders', { params });
export const getOrder = (id: string) => adminApi.get(`/orders/${id}`);
export const updateOrderStatus = (id: string, status: string, notes?: string) => 
  adminApi.patch(`/orders/${id}`, { status, notes });

// Analytics
export const getSalesAnalytics = (params?: any) => adminApi.get('/analytics/sales', { params });
export const getRevenueAnalytics = (params?: any) => adminApi.get('/analytics/revenue', { params });
export const getUserAnalytics = (params?: any) => adminApi.get('/analytics/users', { params });

// Reports
export const getSalesReport = (params?: any) => adminApi.get('/reports/sales', { params });
export const getRevenueReport = (params?: any) => adminApi.get('/reports/revenue', { params });
export const exportReport = (type: string, params?: any) => 
  adminApi.get(`/reports/export/${type}`, { params, responseType: 'blob' });

// Commission
export const getCommissionRules = () => adminApi.get('/commission/rules');
export const updateCommissionRule = (id: string, data: any) => 
  adminApi.patch(`/commission/rules/${id}`, data);
export const createCommissionRule = (data: any) => adminApi.post('/commission/rules', data);

// Settings
export const getSettings = () => adminApi.get('/settings');
export const updateSettings = (data: any) => adminApi.patch('/settings', data);

// Support
export const getSupportTickets = (params?: any) => adminApi.get('/support/tickets', { params });
export const getSupportTicket = (id: string) => adminApi.get(`/support/tickets/${id}`);
export const respondToTicket = (id: string, message: string) => 
  adminApi.post(`/support/tickets/${id}/respond`, { message });
export const closeTicket = (id: string) => adminApi.post(`/support/tickets/${id}/close`);

export default adminApi;
