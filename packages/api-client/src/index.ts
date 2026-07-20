import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

export type ApiRequestHandler = (
  config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export type ApiResponseErrorHandler = (
  error: AxiosError,
  client: AxiosInstance,
) => AxiosResponse | Promise<AxiosResponse> | Promise<never>;

export interface CreateApiClientOptions extends AxiosRequestConfig {
  onRequest?: ApiRequestHandler;
  onResponseError?: ApiResponseErrorHandler;
}

/**
 * Creates the platform's standard Axios client and installs the application
 * hooks in one place. Authentication storage and redirect policy deliberately
 * remain injected because browsers, admin BFF sessions and native secure
 * storage have different lifecycles.
 */
export function createApiClient({
  onRequest,
  onResponseError,
  ...axiosConfig
}: CreateApiClientOptions): AxiosInstance {
  const client = axios.create({
    ...axiosConfig,
    headers: {
      "Content-Type": "application/json",
      ...axiosConfig.headers,
    },
  });

  if (onRequest) {
    client.interceptors.request.use(onRequest);
  }

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) =>
      onResponseError ? onResponseError(error, client) : Promise.reject(error),
  );

  return client;
}

/** Deduplicates concurrent refresh attempts (important for rotated tokens). */
export function singleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let active: Promise<T> | null = null;

  return () => {
    if (!active) {
      active = operation().finally(() => {
        active = null;
      });
    }
    return active;
  };
}

export { axios };
export type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse };
