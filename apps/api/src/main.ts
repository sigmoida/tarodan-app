import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    // IMPORTANT: Disable default body parser so our custom parsers work for Iyzico callbacks
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false, // Disable default parser
    });

    // Custom Body Parsers (Critical for Iyzico 3DS callbacks which use x-www-form-urlencoded)
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));

    // Security
    app.use(helmet());

    // CORS - Development'ta tüm origin'lere izin ver (mobil için)
    const isDevelopment = process.env.NODE_ENV !== 'production';
    app.enableCors({
      origin: isDevelopment
        ? true // Development'ta tüm origin'lere izin ver
        : (process.env.CORS_ORIGINS?.split(',') || [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
        ]),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      // Tarayıcı/Axios bazen Cache-Control, Pragma vb. ekliyor; hepsine izin ver ki CORS preflight geçsin
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Cache-Control',
        'Pragma',
        'Accept',
        'Accept-Language',
        'X-Requested-With',
      ],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false, // Changed to false to prevent 500 errors
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // API prefix
    app.setGlobalPrefix('api');

    // Swagger documentation
    const config = new DocumentBuilder()
      .setTitle('Tarodan API')
      .setDescription('Tarodan Koleksiyoner Oyuncak Marketplace API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('products', 'Product catalog')
      .addTag('offers', 'Offer/negotiation system')
      .addTag('orders', 'Order management')
      .addTag('payments', 'Payment processing')
      .addTag('shipping', 'Shipping integration')
      .addTag('admin', 'Admin panel endpoints')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT || 3000;
    // 0.0.0.0 — telefonun LAN IP üzerinden erişebilmesi için tüm arayüzleri dinle.
    await app.listen(port, '0.0.0.0');
    logger.log(`Application running on port ${port}`);
    logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

const bootstrapLogger = new Logger('Bootstrap');
bootstrap().catch(() => {
  bootstrapLogger.error('Bootstrap failed');
  process.exit(1);
});
