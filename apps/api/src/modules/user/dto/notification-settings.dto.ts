import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Kullanıcı bildirim tercihleri. Tüm alanlar opsiyonel — PATCH ile tek tek
 * güncellenebilir (web /profile/settings tek anahtar gönderir). Veritabanında
 * User.notificationSettings (Json) alanında saklanır.
 */
export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ description: 'E-posta bildirimleri' })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Push bildirimleri' })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiPropertyOptional({ description: 'SMS bildirimleri' })
  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Pazarlama e-postaları' })
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @ApiPropertyOptional({ description: 'Sipariş güncellemeleri' })
  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Mesaj uyarıları' })
  @IsOptional()
  @IsBoolean()
  messageAlerts?: boolean;

  @ApiPropertyOptional({ description: 'Fiyat düşüşü uyarıları' })
  @IsOptional()
  @IsBoolean()
  priceDropAlerts?: boolean;

  @ApiPropertyOptional({ description: 'Yeni ilan uyarıları' })
  @IsOptional()
  @IsBoolean()
  newListingAlerts?: boolean;
}

export type NotificationSettings = Required<UpdateNotificationSettingsDto>;

/** Varsayılan bildirim tercihleri (web tarafıyla aynı). */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailNotifications: true,
  pushNotifications: true,
  smsNotifications: false,
  marketingEmails: false,
  orderUpdates: true,
  messageAlerts: true,
  priceDropAlerts: true,
  newListingAlerts: false,
};
