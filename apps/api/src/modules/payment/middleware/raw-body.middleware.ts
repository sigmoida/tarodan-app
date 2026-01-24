import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Raw Body Middleware
 * Preserves raw body for webhook signature verification
 * Only applies to webhook callback endpoints
 */
@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Only apply to webhook callback endpoints
    if (
      req.path.includes('/payments/callback/iyzico') ||
      req.path.includes('/payments/callback/paytr')
    ) {
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        (req as any).rawBody = rawBody;
        next();
      });
    } else {
      next();
    }
  }
}
