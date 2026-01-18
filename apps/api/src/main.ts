import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    const app = await NestFactory.create(AppModule);

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
    allowedHeaders: ['Content-Type', 'Authorization'],
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
    await app.listen(port);
    logger.log(`Application running on port ${port}`);
    logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('Bootstrap error:', error);
  process.exit(1);
});
