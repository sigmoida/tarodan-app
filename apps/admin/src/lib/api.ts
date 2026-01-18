import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('admin_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
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

// API endpoints
export const adminApi = {
  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),
  getRecentOrders: (limit?: number) => api.get('/admin/dashboard/recent-orders', { params: { limit } }),
  getPendingActions: () => api.get('/admin/dashboard/pending-actions'),
  
  // Analytics
  getSalesAnalytics: (params?: { startDate?: string; endDate?: string; groupBy?: string }) => 
    api.get('/admin/analytics/sales', { params }),
  getRevenueAnalytics: (params?: { startDate?: string; endDate?: string; groupBy?: string }) => 
    api.get('/admin/analytics/revenue', { params }),
  getUserAnalytics: (params?: { startDate?: string; endDate?: string; groupBy?: string }) => 
    api.get('/admin/analytics/users', { params }),
  
  // Users
  getUsers: (params?: any) => api.get('/admin/users', { params }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  updateUser: (id: string, data: any) => api.patch(`/admin/users/${id}`, data),
  banUser: (id: string) => api.post(`/admin/users/${id}/ban`),
  unbanUser: (id: string) => api.post(`/admin/users/${id}/unban`),
  
  // Products
  getProducts: (params?: any) => api.get('/admin/products', { params }),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  approveProduct: (id: string, note?: string) => api.post(`/admin/products/${id}/approve`, { note }),
  rejectProduct: (id: string, reason: string) => api.post(`/admin/products/${id}/reject`, { reason }),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),
  
  // Orders
  getOrders: (params?: any) => api.get('/admin/orders', { params }),
  getOrder: (id: string) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id: string, status: string) => api.patch(`/admin/orders/${id}/status`, { status }),
  
  // Trades
  getTrades: (params?: any) => api.get('/admin/trades', { params }),
  getTrade: (id: string) => api.get(`/admin/trades/${id}`),
  resolveTrade: (id: string, resolution: any) => api.post(`/admin/trades/${id}/resolve`, resolution),
  
  // Messages
  getMessages: (params?: any) => api.get('/messages/admin/pending', { params }),
  approveMessage: (id: string) => api.post(`/messages/admin/${id}/moderate`, { action: 'approve' }),
  rejectMessage: (id: string) => api.post(`/messages/admin/${id}/moderate`, { action: 'reject' }),
  
  // Support Tickets
  getTickets: (params?: any) => api.get('/admin/support-tickets', { params }),
  getTicket: (id: string) => api.get(`/admin/support-tickets/${id}`),
  updateTicket: (id: string, data: any) => api.patch(`/admin/support-tickets/${id}`, data),
  replyToTicket: (id: string, message: string) => api.post(`/admin/support-tickets/${id}/reply`, { message }),
  
  // Reports
  getSalesReport: (params?: { startDate?: string; endDate?: string; format?: string }) => 
    api.get('/admin/reports/sales', { params }),
  getCommissionReport: (params?: { startDate?: string; endDate?: string }) => 
    api.get('/admin/reports/commission', { params }),
  getUserReport: (params?: any) => api.get('/reports/users', { params }),
  getTradeReport: (params?: any) => api.get('/reports/trades', { params }),
  getProductReport: (params?: any) => api.get('/reports/products', { params }),
  exportReport: (type: string, format: string, params?: any) => 
    api.get(`/admin/reports/${type}`, { params: { ...params, format }, responseType: format === 'json' ? 'json' : 'blob' }),
  
  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: any) => api.patch('/admin/settings', data),
  getCommissionRules: () => api.get('/admin/commission-rules'),
  createCommissionRule: (data: any) => api.post('/admin/commission-rules', data),
  updateCommissionRule: (id: string, data: any) => api.patch(`/admin/commission-rules/${id}`, data),
  deleteCommissionRule: (id: string) => api.delete(`/admin/commission-rules/${id}`),
  
  // Membership Tiers
  getMembershipTiers: () => api.get('/admin/membership-tiers'),
  updateMembershipTier: (id: string, data: any) => api.patch(`/admin/membership-tiers/${id}`, data),
  
  // Categories
  getCategories: () => api.get('/categories'),
  createCategory: (data: any) => api.post('/admin/categories', data),
  updateCategory: (id: string, data: any) => api.patch(`/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/admin/categories/${id}`),
  
  // Audit Logs
  getAuditLogs: (params?: any) => api.get('/admin/audit-logs', { params }),
};

export default api;
