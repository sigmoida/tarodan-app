import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import type { Request, Response } from "express";
import type { RequestUser } from "../../modules/auth/interfaces/jwt-payload.interface";

/** Panelin okuduğu başlık. Küçük harf: HTTP başlıkları büyük/küçük duyarsızdır. */
export const ADMIN_SESSION_EXPIRES_HEADER = "x-admin-session-expires-at";

/**
 * Admin oturumunun bitiş anını yanıt başlığına yazar.
 *
 * Neden başlık, neden ayrı bir uç değil: oturum penceresi KAYAN — her admin
 * isteği onu ileri iter. "Ne kadar kaldı?" diye soran bir uç, sorduğu için
 * pencereyi uzatır ve hiçbir zaman doğru cevap veremezdi (açık unutulmuş sekme
 * de sonsuza kadar canlı kalırdı). Bu yüzden son tarih, kullanıcının zaten
 * yaptığı isteklerin yanıtına iliştirilir; fazladan tek bir istek doğmaz.
 *
 * Yalnız AdminJwtStrategy'nin doldurduğu isteklerde çalışır; diğer her yanıt
 * dokunulmadan geçer.
 */
@Injectable()
export class AdminSessionHeaderInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const user = http.getRequest<Request & { user?: RequestUser }>().user;
    const expiresAt = user?.sessionExpiresAt;

    if (expiresAt) {
      const res = http.getResponse<Response>();
      // Yanıt gövdesi yazılmadan set edilmeli; interceptor handler'dan ÖNCE
      // çalıştığı için burası doğru yer.
      res.setHeader(ADMIN_SESSION_EXPIRES_HEADER, expiresAt.toISOString());
    }

    return next.handle();
  }
}
