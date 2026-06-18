import { ApiClient, ClientConfig, createApiClient } from './client';
import { AuthEndpoints } from './endpoints/auth';
import { ProductEndpoints } from './endpoints/products';
import { OrderEndpoints } from './endpoints/orders';
import { OfferEndpoints } from './endpoints/offers';
import { TradeEndpoints } from './endpoints/trades';
import { MessageEndpoints } from './endpoints/messages';
import { NotificationEndpoints } from './endpoints/notifications';
import { UserEndpoints } from './endpoints/user';
import { WishlistEndpoints } from './endpoints/wishlist';
import { SupportEndpoints } from './endpoints/support';

/**
 * Unified Tarodan API Client
 * Provides type-safe access to all API endpoints
 */
export class TarodanClient {
  private client: ApiClient;

  public auth: AuthEndpoints;
  public products: ProductEndpoints;
  public orders: OrderEndpoints;
  public offers: OfferEndpoints;
  public trades: TradeEndpoints;
  public messages: MessageEndpoints;
  public notifications: NotificationEndpoints;
  public users: UserEndpoints;
  public wishlist: WishlistEndpoints;
  public support: SupportEndpoints;

  constructor(config: ClientConfig) {
    this.client = createApiClient(config);

    // Initialize all endpoints
    this.auth = new AuthEndpoints(this.client);
    this.products = new ProductEndpoints(this.client);
    this.orders = new OrderEndpoints(this.client);
    this.offers = new OfferEndpoints(this.client);
    this.trades = new TradeEndpoints(this.client);
    this.messages = new MessageEndpoints(this.client);
    this.notifications = new NotificationEndpoints(this.client);
    this.users = new UserEndpoints(this.client);
    this.wishlist = new WishlistEndpoints(this.client);
    this.support = new SupportEndpoints(this.client);
  }

  /**
   * Get the underlying axios instance for custom requests
   */
  getAxiosInstance() {
    return this.client.getAxiosInstance();
  }

  /**
   * Get the raw API client for direct access
   */
  getRawClient() {
    return this.client;
  }
}

/**
 * Create a new Tarodan API Client instance
 */
export function createTarodanClient(config: ClientConfig): TarodanClient {
  return new TarodanClient(config);
}

// Default configuration for web apps.
// Auth httpOnly cookie ile taşınır: withCredentials açık, token localStorage'dan OKUNMAZ.
export function createWebClient(options?: {
  baseURL?: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
}): TarodanClient {
  return new TarodanClient({
    baseURL: options?.baseURL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    withCredentials: true,
    // Varsayılan token getter YOK (cookie auth). Bearer gerekiyorsa çağıran açıkça geçsin.
    getToken: options?.getToken,
    onUnauthorized: options?.onUnauthorized || (() => {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }),
  });
}

// Default configuration for mobile apps
export function createMobileClient(options?: {
  baseURL?: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
}): TarodanClient {
  return new TarodanClient({
    baseURL: options?.baseURL || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001',
    getToken: options?.getToken,
    onUnauthorized: options?.onUnauthorized,
  });
}
