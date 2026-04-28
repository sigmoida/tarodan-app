import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as qs from 'querystring';

/**
 * Raw Body Middleware
 * Preserves raw body for webhook signature verification.
 * Also parses body so @Body() in controller gets conversationData etc. (Iyzico sends form-urlencoded).
 */
@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (
      req.path.includes('/payments/callback/paytr')
    ) {
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        (req as any).rawBody = rawBody;
        // Parse so controller @Body() gets fields (Iyzico 3DS callback is form-urlencoded)
        if (rawBody && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          try {
            (req as any).body = qs.parse(rawBody);
          } catch {
            // ignore
          }
        }
        next();
      });
    } else {
      next();
    }
  }
}
