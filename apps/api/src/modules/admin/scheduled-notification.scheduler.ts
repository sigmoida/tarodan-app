/**
 * Scheduled Notification Scheduler
 * Processes pending scheduled notifications at their scheduled time
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma';
import { AdminService } from './admin.service';

@Injectable()
export class ScheduledNotificationScheduler {
    private readonly logger = new Logger(ScheduledNotificationScheduler.name);
    private isProcessing = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly adminService: AdminService,
    ) { }

    /**
     * Runs every minute to check for due scheduled notifications
     */
    @Cron('0 * * * * *') // Every minute at second 0
    async processScheduledNotifications(): Promise<void> {
        // Prevent concurrent execution
        if (this.isProcessing) {
            this.logger.debug('Already processing scheduled notifications, skipping...');
            return;
        }

        this.isProcessing = true;

        try {
            const now = new Date();

            // Find all pending notifications that are due
            const dueNotifications = await this.prisma.scheduledNotification.findMany({
                where: {
                    status: 'pending',
                    scheduledFor: { lte: now },
                },
                take: 50, // Process in batches
                orderBy: { scheduledFor: 'asc' },
            });

            if (dueNotifications.length === 0) {
                this.logger.debug('No scheduled notifications due');
                this.isProcessing = false;
                return;
            }

            this.logger.log(`Processing ${dueNotifications.length} scheduled notifications`);

            for (const notification of dueNotifications) {
                try {
                    // Mark as processing to prevent duplicate processing
                    await this.prisma.scheduledNotification.update({
                        where: { id: notification.id },
                        data: { status: 'processing' },
                    });

                    // Extract target user IDs based on targetType
                    let userIds: string[] = [];

                    if (notification.targetType === 'user_ids') {
                        userIds = (notification.targetData as string[]) || [];
                    } else if (notification.targetType === 'all') {
                        const users = await this.prisma.user.findMany({
                            where: { isBanned: false },
                            select: { id: true },
                        });
                        userIds = users.map(u => u.id);
                    } else if (notification.targetType === 'segment') {
                        const criteria = notification.targetData as Record<string, any>;
                        const where: any = { isBanned: false };

                        if (criteria?.isSeller !== undefined) {
                            where.isSeller = criteria.isSeller;
                        }
                        if (criteria?.membershipTier) {
                            where.membership = { tier: { type: criteria.membershipTier } };
                        }

                        const users = await this.prisma.user.findMany({
                            where,
                            select: { id: true },
                        });
                        userIds = users.map(u => u.id);
                    }

                    if (userIds.length === 0) {
                        this.logger.warn(`No target users found for scheduled notification ${notification.id}`);
                        await this.prisma.scheduledNotification.update({
                            where: { id: notification.id },
                            data: {
                                status: 'failed',
                                sentAt: new Date(),
                                errorCount: 1,
                            },
                        });
                        continue;
                    }

                    // Send the notification using AdminService
                    await this.adminService.sendNotification(
                        notification.createdBy,
                        {
                            title: notification.title,
                            body: notification.body,
                            channels: notification.channels as string[],
                            targetType: 'user_ids',
                            userIds,
                            data: undefined,
                        }
                    );

                    // Mark as sent
                    await this.prisma.scheduledNotification.update({
                        where: { id: notification.id },
                        data: {
                            status: 'sent',
                            sentAt: new Date(),
                            sentCount: userIds.length,
                        },
                    });

                    this.logger.log(`Scheduled notification ${notification.id} sent to ${userIds.length} users`);
                } catch (error) {
                    this.logger.error(`Failed to process scheduled notification ${notification.id}:`, error);

                    await this.prisma.scheduledNotification.update({
                        where: { id: notification.id },
                        data: {
                            status: 'failed',
                            sentAt: new Date(),
                        },
                    });
                }
            }
        } catch (error) {
            this.logger.error('Error in scheduled notification processor:', error);
        } finally {
            this.isProcessing = false;
        }
    }
}
