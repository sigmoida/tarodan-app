/**
 * WebSocket Module
 * NestJS module for WebSocket Gateway
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma';
import { TarodanWebSocketGateway } from './websocket.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TarodanWebSocketGateway, RealtimeService],
  exports: [TarodanWebSocketGateway, RealtimeService],
})
export class WebSocketModule {}
