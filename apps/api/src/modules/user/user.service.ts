import { Injectable, Logger } from "@nestjs/common";
import { User } from "@prisma/client";
import { NotificationSettings, UpdateNotificationSettingsDto } from "./dto";
import { UserProfileService } from "./user-profile.service";
import { UserAddressService } from "./user-address.service";
import { UserSocialService } from "./user-social.service";
import { UserStatsService } from "./user-stats.service";
import { UserAnalyticsService } from "./user-analytics.service";
import { UserDiscoveryService } from "./user-discovery.service";
import { UserBankService } from "./user-bank.service";
import { UserEngagementService } from "./user-engagement.service";

/**
 * UserService (facade) — her public imza aynen korunur. CORE servis; controller
 * ve FeaturedSchedulerService enjekte eder. Profil/hesap → profile, adresler →
 * address, takip+engelleme → social, özet istatistik → stats, ağır analitik →
 * analytics, keşif/öne çıkarma → discovery, banka hesabı → bank. Paylaşılan
 * avatar/ürün görsel çözümü UserCommonService'te. DI grafı asiklik: sub → common,
 * facade → {profile,address,social,stats,analytics,discovery,bank}; forwardRef yok.
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly profile: UserProfileService,
    private readonly address: UserAddressService,
    private readonly social: UserSocialService,
    private readonly stats: UserStatsService,
    private readonly analytics: UserAnalyticsService,
    private readonly discovery: UserDiscoveryService,
    private readonly bank: UserBankService,
    private readonly engagement: UserEngagementService,
  ) {}

  /**
   * Increment a seller storefront's view counter.
   * Self-views, bots, and repeat views inside the rate-limit window are no-ops.
   */
  async incrementStoreViewCount(
    sellerId: string,
    viewerId?: string,
    clientIp?: string,
    userAgent?: string,
  ) {
    return this.engagement.incrementStoreViewCount(
      sellerId,
      viewerId,
      clientIp,
      userAgent,
    );
  }

  /**
   * Stabil avatar endpoint'i (GET /users/:id/avatar) için kullanıcının taze
   * presigned avatar URL'ini döndürür. Avatar yoksa/çözülemezse null.
   */
  async getAvatarRedirectUrl(userId: string): Promise<string | null> {
    return this.profile.getAvatarRedirectUrl(userId);
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return this.profile.findById(id);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.profile.findByEmail(email);
  }

  /**
   * Find user by phone
   */
  async findByPhone(phone: string): Promise<User | null> {
    return this.profile.findByPhone(phone);
  }

  /**
   * Get user with addresses and membership info
   */
  async findByIdWithAddresses(id: string) {
    return this.profile.findByIdWithAddresses(id);
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      phone?: string;
      bio?: string;
      birthDate?: string;
      companyName?: string;
      taxId?: string;
      taxOffice?: string;
      isCorporateSeller?: boolean;
      avatarUrl?: string;
      showTrustScore?: boolean;
      preferredLanguage?: string;
    },
  ) {
    return this.profile.updateProfile(userId, data);
  }

  async claimUsername(userId: string, username: string) {
    return this.profile.claimUsername(userId, username);
  }

  async completeHomeTour(userId: string, version: number) {
    return this.profile.completeHomeTour(userId, version);
  }

  /**
   * Bildirim tercihlerini getir. Kayıt yoksa varsayılanlar döner; kısmi
   * kayıtlar varsayılanların üzerine birleştirilir.
   */
  async getNotificationSettings(userId: string): Promise<NotificationSettings> {
    return this.profile.getNotificationSettings(userId);
  }

  /**
   * Bildirim tercihlerini kısmen güncelle (gelen anahtarları mevcut değerlerin
   * üzerine birleştirir) ve güncel tam nesneyi döner.
   */
  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettings> {
    return this.profile.updateNotificationSettings(userId, dto);
  }

  /**
   * Delete user account
   * Only allowed if:
   * - All products are removed (inactive, sold, rejected, draft)
   * - No active trades (pending, accepted, shipped, etc.)
   * - No pending orders (pending_payment, paid, preparing, shipped, delivered)
   */
  async deleteAccount(userId: string) {
    return this.profile.deleteAccount(userId);
  }

  /**
   * Mark user as verified
   */
  async verifyUser(userId: string) {
    return this.profile.verifyUser(userId);
  }

  /**
   * Upgrade user to seller
   */
  async upgradToSeller(userId: string) {
    return this.profile.upgradToSeller(userId);
  }

  /**
   * Get public user profile
   */
  async getPublicProfile(userId: string, viewerId?: string) {
    return this.profile.getPublicProfile(userId, viewerId);
  }

  /**
   * Add user address
   * Maximum 3 addresses per user
   */
  async addAddress(
    userId: string,
    data: {
      title?: string;
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) {
    return this.address.addAddress(userId, data);
  }

  /**
   * Update user address
   */
  async updateAddress(
    userId: string,
    addressId: string,
    data: {
      title?: string;
      city?: string;
      district?: string;
      address?: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) {
    return this.address.updateAddress(userId, addressId, data);
  }

  /**
   * Delete user address
   */
  async deleteAddress(userId: string, addressId: string) {
    return this.address.deleteAddress(userId, addressId);
  }

  /**
   * Get user's addresses
   */
  async getAddresses(userId: string) {
    return this.address.getAddresses(userId);
  }

  /**
   * Check if current user is following target user
   */
  async checkFollowing(currentUserId: string, targetUserId: string) {
    return this.social.checkFollowing(currentUserId, targetUserId);
  }

  /**
   * Follow a user
   */
  async followUser(currentUserId: string, targetUserId: string) {
    return this.social.followUser(currentUserId, targetUserId);
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(currentUserId: string, targetUserId: string) {
    return this.social.unfollowUser(currentUserId, targetUserId);
  }

  /**
   * Get users that current user is following
   */
  async getFollowing(userId: string) {
    return this.social.getFollowing(userId);
  }

  /**
   * Block a user
   */
  async blockUser(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean; blockedDisplayName: string }> {
    return this.social.blockUser(blockerId, blockedId);
  }

  /**
   * Unblock a user
   */
  async unblockUser(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean }> {
    return this.social.unblockUser(blockerId, blockedId);
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(userId: string): Promise<any[]> {
    return this.social.getBlockedUsers(userId);
  }

  /**
   * Check if a user is blocked
   */
  isUserBlocked(blockerId: string, blockedId: string): boolean {
    return this.social.isUserBlocked(blockerId, blockedId);
  }

  /**
   * Check if either user has blocked the other
   */
  areUsersBlocked(userId1: string, userId2: string): boolean {
    return this.social.areUsersBlocked(userId1, userId2);
  }

  /**
   * Check if user is a business account
   * Business = membershipTier.type = 'business' AND companyName is not null
   */
  async isBusinessAccount(userId: string): Promise<boolean> {
    return this.stats.isBusinessAccount(userId);
  }

  /**
   * Satıcı panosu özet istatistikleri (her satıcı için).
   * Toplam gelir: ödemesi alınmış ve iptal/iade edilmemiş siparişler (pending_payment
   * ve cancelled/refunded hariç) → bir satış yapıldığında gelir hemen görünür.
   */
  async getSellerSummaryStats(userId: string) {
    return this.stats.getSellerSummaryStats(userId);
  }

  /**
   * Get user analytics data
   * Available for all authenticated users
   */
  /**
   * Kullanıcının özet istatistikleri — İstatistikler sayfasının tek veri
   * kaynağı. "Satış/harcama" için ödemesi alınmış tüm siparişler sayılır
   * (paid → completed); yalnızca completed/delivered sayılırsa kargo
   * sürecindeki siparişler 0 olarak görünür.
   */
  async getMyStats(userId: string) {
    return this.stats.getMyStats(userId);
  }

  async getUserAnalytics(userId: string, period: "7d" | "30d" | "90d" = "30d") {
    return this.analytics.getUserAnalytics(userId, period);
  }

  /**
   * Get business dashboard statistics
   * Only for business accounts
   */
  async getBusinessDashboardStats(userId: string) {
    return this.analytics.getBusinessDashboardStats(userId);
  }

  /**
   * En iyi koleksiyonlar (anasayfa). Görüntülenme/beğeniye göre sıralı, cache'li.
   */
  async getTopCollections(limit: number = 20) {
    return this.discovery.getTopCollections(limit);
  }

  /**
   * Haftanın koleksiyoneri (anasayfa). Haftalık snapshot'tan okur: ağır skorlama
   * cron'da yapılır, burada sadece kazanan koleksiyon taze veriyle doldurulur
   * (presigned URL'ler hep güncel kalır). Snapshot yoksa (ilk açılış) ya da
   * kazanan artık uygun değilse anında hesaplayıp snapshot'ı tazeler.
   */
  async getFeaturedCollector() {
    return this.discovery.getFeaturedCollector();
  }

  /**
   * Aday koleksiyonlar arasından haftalık skoru en yüksek olanı seçer (yalnızca
   * id + skor döner; ağır kısım budur, cron tarafından çağrılır).
   * Admin'in `isFeatured` işaretlediği koleksiyonlar önceliklidir.
   */
  async selectFeaturedCollector(): Promise<{
    id: string;
    score: number;
    salesCount: number;
  } | null> {
    return this.discovery.selectFeaturedCollector();
  }

  /**
   * Haftanın şirketi (anasayfa). Haftalık snapshot'tan okur; ağır skorlama
   * cron'da yapılır, burada kazanan iş hesabı taze veriyle doldurulur. Snapshot
   * yoksa ya da kazanan artık uygun değilse anında hesaplayıp snapshot'ı tazeler.
   */
  async getFeaturedBusiness() {
    return this.discovery.getFeaturedBusiness();
  }

  /**
   * Aday iş hesapları arasından haftalık skoru en yüksek olanı seçer (yalnızca
   * id + skor döner). Business tier önceliklidir; yoksa en çok ürünü olan
   * satıcılara düşer. Ağır skorlama burasıdır, cron tarafından çağrılır.
   */
  async selectFeaturedBusiness(): Promise<{
    id: string;
    score: number;
  } | null> {
    return this.discovery.selectFeaturedBusiness();
  }

  /**
   * Haftanın koleksiyoneri ve şirketi snapshot'larını yeniden hesaplar.
   * Cron job (FeaturedSchedulerService) ve admin değişiklikleri tarafından
   * çağrılır; ardından okuma cache'lerini düşürerek yeni kazananın anında
   * yansımasını sağlar. Hesaplama hatası diğer tipi etkilemez (best-effort).
   */
  async refreshFeaturedSnapshots(): Promise<void> {
    return this.discovery.refreshFeaturedSnapshots();
  }

  /**
   * Get top sellers (for homepage)
   */
  async getTopSellers(limit: number = 5) {
    return this.discovery.getTopSellers(limit);
  }

  /**
   * İsimle satıcı arama (autocomplete). Yalnızca aktif ürünü olan, banlı/silinmemiş
   * satıcıları döndürür — profili herkese açık olmayanları sızdırmaz.
   */
  async searchSellers(query: string, limit: number = 8) {
    return this.discovery.searchSellers(query, limit);
  }

  async getBankAccount(userId: string) {
    return this.bank.getBankAccount(userId);
  }

  async upsertBankAccount(
    userId: string,
    data: {
      accountHolder: string;
      iban: string;
      tcKimlikNo?: string;
      taxId?: string;
    },
  ) {
    return this.bank.upsertBankAccount(userId, data);
  }

  async deleteBankAccount(userId: string) {
    return this.bank.deleteBankAccount(userId);
  }
}
