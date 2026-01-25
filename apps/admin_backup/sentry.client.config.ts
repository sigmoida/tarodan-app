/**
 * Sentry Client Configuration for Admin Panel
 * This file configures Sentry for the browser
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  
  // Session replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // Environment
  environment: process.env.NODE_ENV,
  
  // Tag as admin panel
  initialScope: {
    tags: {
      app: 'admin',
    },
  },
  
  // Filter out noisy errors
  ignoreErrors: [
    'Network request failed',
    'Failed to fetch',
    'NetworkError',
  ],
  
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  beforeSend(event) {
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>;
      if (data.password) data.password = '[REDACTED]';
      if (data.token) data.token = '[REDACTED]';
    }
    return event;
  },
});
