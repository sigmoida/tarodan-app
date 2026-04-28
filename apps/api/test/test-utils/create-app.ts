import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import { AppModule } from '../../src/app.module';
import { PayTRService } from '../../src/modules/payment-providers/paytr.service';
import { StorageService } from '../../src/modules/storage/storage.service';
import { MockPayTRService } from '../mocks/paytr.mock';
import { SURAT_SOAP_CLIENT } from '../../src/modules/surat-cargo/surat-cargo.service';
import { StubSuratSoapClient } from '../../src/modules/surat-cargo/surat-soap.client';

/**
 * Bootstrap a real NestJS app for E2E tests.
 *
 * Mirrors apps/api/src/main.ts as closely as possible — same body parser
 * config, same ValidationPipe options, same global prefix. The only
 * deltas are:
 *   - PayTRService → MockPayTRService (no outbound HTTPS to PayTR)
 *   - StorageService → in-memory stub (no S3 traffic)
 *   - SuratCargoService stays real because it auto-uses StubSuratSoapClient
 *     when SURAT_SOAP_MODE != 'live' (.env.test default).
 *   - bodyParser: false + manual json/urlencoded — required for PayTR
 *     callback (form-urlencoded) to parse correctly.
 *   - We do not call app.listen(); supertest hits the in-memory server.
 *
 * Redis (CacheModule, BullMQ, EventModule) and Elasticsearch (SearchModule)
 * connect to local docker services — make sure docker-compose is up.
 */
export interface E2ETestApp {
  app: NestExpressApplication;
  module: TestingModule;
  paytr: MockPayTRService;
  surat: StubSuratSoapClient;
  close: () => Promise<void>;
}

export async function createE2ETestApp(): Promise<E2ETestApp> {
  const paytr = new MockPayTRService();
  const storageStub = createStorageStub();

  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PayTRService)
    .useValue(paytr)
    .overrideProvider(StorageService)
    .useValue(storageStub)
    .compile();

  const app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });

  // Body parsers (mirrors main.ts — needed for PayTR callback urlencoded body).
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api');

  await app.init();

  // Sürat SOAP stub is auto-instantiated by SuratCargoModule when SURAT_SOAP_MODE!=live.
  // We resolve it from the DI container so tests can inspect/clear call history.
  const surat = module.get<StubSuratSoapClient>(SURAT_SOAP_CLIENT);

  return {
    app,
    module,
    paytr,
    surat,
    close: async () => {
      await app.close();
    },
  };
}

function createStorageStub(): Partial<StorageService> {
  return {
    isStorageAvailable: () => true,
    async uploadFile() {
      return {
        key: 'test/file.bin',
        url: 'test/file.bin',
        size: 0,
        mimeType: 'application/octet-stream',
        bucket: 'test-bucket',
      } as any;
    },
    async uploadFiles() {
      return [] as any;
    },
    async deleteFile() {
      /* no-op */
    },
    async deleteFiles() {
      /* no-op */
    },
    getPublicAssetUrl(key: string) {
      return `https://test-cdn.invalid/${key}`;
    },
    async getPresignedUploadUrl(_args: any) {
      return { uploadUrl: 'https://test-presigned.invalid', key: 'test/file.bin' } as any;
    },
    async getPresignedDownloadUrl() {
      return 'https://test-presigned.invalid';
    },
    async getFilesByEntity() {
      return [] as any;
    },
    async validateProductImage() {
      return { valid: true };
    },
  } as Partial<StorageService>;
}
