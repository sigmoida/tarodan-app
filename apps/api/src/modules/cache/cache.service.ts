import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis;
  private subscriber: Redis;
  private readonly DEFAULT_TTL = 3600; // 1 hour

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get(
      'REDIS_URL',
      'redis://localhost:6379',
    );

    this.client = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.client.on('error', () => {
      this.logger.error('Redis error');
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
    await this.subscriber?.quit();
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn('Cache get error');
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl ?? this.DEFAULT_TTL;
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
    } catch (error) {
      this.logger.warn('Cache set error');
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn('Cache delete error');
    }
  }

  /**
   * Delete keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client.del(...keys);
    } catch (error) {
      this.logger.warn('Cache delete pattern error');
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1;
    } catch (error) {
      this.logger.warn('Cache exists error');
      return false;
    }
  }

  /**
   * Set expiry on key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      return (await this.client.expire(key, seconds)) === 1;
    } catch (error) {
      this.logger.warn('Cache expire error');
      return false;
    }
  }

  /**
   * Get TTL of key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.warn('Cache ttl error');
      return -2;
    }
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.warn('Cache incr error');
      return 0;
    }
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  // ==========================================================================
  // RATE LIMITING
  // ==========================================================================

  /**
   * Check rate limit
   */
  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const current = await this.client.incr(key);

    if (current === 1) {
      await this.client.expire(key, windowSeconds);
    }

    const ttl = await this.client.ttl(key);
    const resetAt = new Date(Date.now() + ttl * 1000);

    return {
      allowed: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
      resetAt,
    };
  }

  // ==========================================================================
  // SESSION STORE
  // ==========================================================================

  /**
   * Store session
   */
  async setSession(
    sessionId: string,
    data: any,
    ttlSeconds = 3600,
  ): Promise<void> {
    const key = `session:${sessionId}`;
    await this.set(key, data, { ttl: ttlSeconds });
  }

  /**
   * Get session
   */
  async getSession<T>(sessionId: string): Promise<T | null> {
    const key = `session:${sessionId}`;
    return this.get<T>(key);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  /**
   * Refresh session TTL
   */
  async refreshSession(sessionId: string, ttlSeconds = 3600): Promise<boolean> {
    const key = `session:${sessionId}`;
    return this.expire(key, ttlSeconds);
  }

  // ==========================================================================
  // QUEUE (Simple implementation)
  // ==========================================================================

  /**
   * Push to queue
   */
  async pushToQueue(queueName: string, data: any): Promise<void> {
    try {
      await this.client.rpush(queueName, JSON.stringify(data));
    } catch (error) {
      this.logger.warn('Queue push error');
    }
  }

  /**
   * Pop from queue
   */
  async popFromQueue<T>(queueName: string): Promise<T | null> {
    try {
      const data = await this.client.lpop(queueName);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.warn('Queue pop error');
      return null;
    }
  }

  /**
   * Get queue length
   */
  async getQueueLength(queueName: string): Promise<number> {
    try {
      return await this.client.llen(queueName);
    } catch (error) {
      this.logger.warn('Queue length error');
      return 0;
    }
  }

  // ==========================================================================
  // PUB/SUB
  // ==========================================================================

  /**
   * Publish message
   */
  async publish(channel: string, message: any): Promise<void> {
    try {
      await this.client.publish(channel, JSON.stringify(message));
    } catch (error) {
      this.logger.warn('Publish error');
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(
    channel: string,
    callback: (message: any) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch: string, message: string) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(message));
        } catch {
          callback(message);
        }
      }
    });
  }

  // ==========================================================================
  // CACHE KEYS HELPERS
  // ==========================================================================

  /**
   * Generate product cache key
   */
  productKey(productId: string): string {
    return `product:${productId}`;
  }

  /**
   * Generate user cache key
   */
  userKey(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * Generate category cache key
   */
  categoryKey(categoryId?: string): string {
    return categoryId ? `category:${categoryId}` : 'categories:all';
  }

  /**
   * Generate membership limits cache key
   */
  membershipLimitsKey(userId: string): string {
    return `membership:limits:${userId}`;
  }

  /**
   * Invalidate user-related caches
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.delPattern(`*:${userId}*`);
  }

  /**
   * Invalidate product-related caches
   */
  async invalidateProductCache(productId: string): Promise<void> {
    await this.del(this.productKey(productId));
    await this.delPattern('search:*');
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get Redis info
   */
  async getInfo(): Promise<Record<string, any>> {
    try {
      const info = await this.client.info();
      const lines = info.split('\n');
      const result: Record<string, any> = {};

      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          result[key.trim()] = value.trim();
        }
      }

      return result;
    } catch (error) {
      this.logger.warn('Redis info error');
      return {};
    }
  }

  /**
   * Get memory usage
   */
  async getMemoryUsage(): Promise<{ used: number; peak: number }> {
    const info = await this.getInfo();
    return {
      used: parseInt(info.used_memory || '0'),
      peak: parseInt(info.used_memory_peak || '0'),
    };
  }
}
