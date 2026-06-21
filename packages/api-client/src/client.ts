import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ClientConfig {
  baseURL: string;
  timeout?: number;
  /** httpOnly cookie tabanlı auth için true (tarayıcı). Mobil Bearer header kullanır. */
  withCredentials?: boolean;
  getToken?: () => string | null;
  onTokenRefresh?: (newToken: string) => void;
  onUnauthorized?: () => void;
}

export class ApiClient {
  private client: AxiosInstance;
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      withCredentials: config.withCredentials ?? false,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.config.getToken?.();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.config.onUnauthorized?.();
        }
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}

export const createApiClient = (config: ClientConfig): ApiClient => {
  return new ApiClient(config);
};
