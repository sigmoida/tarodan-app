/**
 * Queue names for BullMQ
 */
export const QUEUE_NAMES = {
    EMAIL: 'email',
    PUSH: 'push',
    IMAGE: 'image',
    PAYMENT: 'payment',
    SHIPPING: 'shipping',
    SEARCH: 'search',
    ANALYTICS: 'analytics',
    MODERATION: 'moderation',
    // Cron-tipi zamanlanmış işler (pilot: expireBoosts) — Bull repeatable.
    SCHEDULED: 'scheduled',
} as const;
