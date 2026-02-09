import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ErrorLogInterceptor implements NestInterceptor {
    private readonly logger = new Logger(ErrorLogInterceptor.name);

    constructor(private readonly prisma: PrismaService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            catchError((error) => {
                this.logError(context, error);
                return throwError(() => error);
            }),
        );
    }

    private async logError(context: ExecutionContext, error: any) {
        const request = context.switchToHttp().getRequest();
        if (!request) return; // Not an HTTP request

        const { method, url, body, user } = request;
        const status = error.status || 500;

        // Only log significant errors (500s or specific 400s if desired)
        // For now, let's log everything >= 400 for better visibility in the admin panel
        if (status < 400) return;

        try {
            // Use any to avoid lint errors before Prisma generate is fully recognized by IDE
            await (this.prisma as any).errorLog.create({
                data: {
                    severity: status >= 500 ? 'error' : 'warning',
                    message: error.message || 'Unknown error',
                    stackTrace: error.stack,
                    source: 'api',
                    endpoint: `${method} ${url}`,
                    userId: user?.id,
                    details: {
                        status,
                        name: error.name,
                        body: method !== 'GET' ? body : undefined,
                    },
                },
            });
        } catch (logError) {
            this.logger.error(`Failed to log error to database: ${logError.message}`);
        }
    }
}
