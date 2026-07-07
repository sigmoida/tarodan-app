import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma } from '@prisma/client';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { SuratTrackingService } from '../surat-cargo/surat-tracking.service';
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratKapidanOdemeTahsilatTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
} from '../surat-cargo/surat-cargo.types';

/**
 * Kargo görünümü admin operasyonları (salt-okunur) — AdminService'in
 * SHIPPING (view-only) bölümünden birebir taşındı. AdminService aynı
 * imzalarla buraya delege eder.
 */
@Injectable()
export class AdminShippingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly suratCargoService?: SuratCargoService,
    @Optional()
    private readonly suratTrackingService?: SuratTrackingService,
  ) {}

  // ==================== SHIPPING (view-only) ====================

  /**
   * Get list of shipments
   */
  async getShipments(query: {
    page?: number;
    limit?: number;
    status?: string;
    carrierId?: string;
  }) {
    const { page = 1, limit = 10, status, carrierId } = query;
    const where: Prisma.ShipmentWhereInput = {};

    if (status) where.status = status as any;
    if (carrierId) where.provider = carrierId;

    const [total, shipments] = await Promise.all([
      this.prisma.shipment.count({ where }),
      this.prisma.shipment.findMany({
        where,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: shipments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin manuel takip senkronu: bir Sürat kargosunun güncel durumunu 30 dk'lık
   * cron'u beklemeden anında Sürat takip API'sinden çeker ve DB'ye yazar.
   * Kargo panelindeki "Takibi Yenile" butonu bunu kullanır.
   */
  async syncShipmentTracking(
    shipmentId: string,
  ): Promise<{ ok: boolean; message: string; shipment?: any }> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) {
      return { ok: false, message: 'Gönderi bulunamadı' };
    }
    if (shipment.provider !== 'surat') {
      return { ok: false, message: 'Bu gönderi Sürat kargo değil' };
    }
    if (!this.suratTrackingService) {
      return { ok: false, message: 'Takip servisi kullanılamıyor' };
    }

    const updated = await this.suratTrackingService.syncShipmentTracking(shipmentId);
    const fresh = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    return {
      ok: updated,
      message: updated
        ? 'Takip bilgisi güncellendi'
        : 'Sürat’tan güncelleme alınamadı (kargo henüz hareket görmemiş ya da takip numarası yok olabilir)',
      shipment: fresh,
    };
  }

  /**
   * Sürat REST endpoint testi: sunucudan Sürat'a gerçek bir test gönderisi oluşturur
   * (GonderiyiKargoyaGonder) ve hemen aynı referansla takibini sorgular
   * (KargoTakipHareketDetayi). DB'ye/siparişe DOKUNMAZ — sadece iki REST endpoint'inin
   * canlı çalıştığını ham cevaplarla gösterir. Admin "Sürat Endpoint Testi" paneli kullanır.
   */
  async runSuratEndpointTest(): Promise<{
    ref: string;
    enabled: boolean;
    create: { ok: boolean; message: string };
    track: any;
  }> {
    const ref = `ADMIN-TEST-${Date.now()}`;

    if (!this.suratCargoService) {
      return {
        ref,
        enabled: false,
        create: { ok: false, message: 'Sürat servisi kullanılamıyor' },
        track: null,
      };
    }
    if (!this.suratCargoService.isIntegrationEnabled()) {
      return {
        ref,
        enabled: false,
        create: { ok: false, message: 'SURAT_CARGO_ENABLED kapalı (Coolify env kontrol et)' },
        track: null,
      };
    }

    // 1) Gönderi oluştur — Sürat'a gerçek test gönderisi (REST create)
    const createResult = await this.suratCargoService.submitShipmentWithRetry({
      idempotencyKey: ref,
      correlationId: ref,
      payload: {
        KisiKurum: 'ADMIN TEST ALICI',
        SahisBirim: 'Endpoint testi',
        AliciAdresi: 'Caferağa Mah. Moda Cad. No:14',
        Il: 'İstanbul',
        Ilce: 'Kadıköy',
        TelefonCep: '5321112233',
        KargoTuru: SuratKargoTuru.Koli,
        OdemeTipi: SuratOdemeTipi.Pesin,
        OzelKargoTakipNo: ref,
        Adet: 1,
        BirimDesi: 1,
        BirimKg: 1,
        KapidanOdemeTahsilatTipi: SuratKapidanOdemeTahsilatTipi.Nakit,
        TasimaSekli: SuratTasimaSekli.KaraYolu,
        TeslimSekli: SuratTeslimSekli.AdreseTeslim,
        GonderiSekli: SuratGonderiSekli.Standart,
        Pazaryerimi: 0,
        Iademi: false,
      },
    });

    const create = createResult.ok
      ? { ok: true, message: 'Sürat gönderi oluşturuldu (başarılı)' }
      : {
          ok: false,
          message:
            (createResult as any).suratMessage ||
            `teknik hata: ${(createResult as any).code ?? 'bilinmiyor'}`,
        };

    // 2) Aynı referansla takibi sorgula — Sürat'tan durum oku (REST tracking)
    const track = this.suratTrackingService
      ? await this.suratTrackingService.probeTracking(ref)
      : { ok: false, error: 'Takip servisi kullanılamıyor' };

    return { ref, enabled: true, create, track };
  }

  /**
   * Test konsolu: verilen referansla Sürat takip endpoint'ini (KargoTakipHareketDetayi)
   * ham olarak sorgular. DB'ye dokunmaz.
   */
  async suratTestTrack(ref: string): Promise<any> {
    if (!ref?.trim()) return { ok: false, error: 'Referans (OzelKargoTakipNo) gerekli' };
    if (!this.suratTrackingService) return { ok: false, error: 'Takip servisi kullanılamıyor' };
    return this.suratTrackingService.probeTracking(ref.trim());
  }

  /**
   * Test konsolu: verilen referansla Sürat iptal/geri-çek endpoint'ini (GonderiGeriCek)
   * çağırır. Uzak çağrı yapar, DB'ye dokunmaz.
   */
  async suratTestCancel(ref: string): Promise<{ ok: boolean; suratMessage?: string; error?: string }> {
    if (!ref?.trim()) return { ok: false, error: 'Referans (OzelKargoTakipNo) gerekli' };
    if (!this.suratCargoService) return { ok: false, error: 'Sürat servisi kullanılamıyor' };
    if (!this.suratCargoService.isIntegrationEnabled()) {
      return { ok: false, error: 'SURAT_CARGO_ENABLED kapalı (Coolify env kontrol et)' };
    }
    return this.suratCargoService.cancelShipmentByOrderNumber(ref.trim());
  }

  /**
   * Test konsolu: OrtakBarkodOlustur ile gönderi oluştur + barkod/etiket üret.
   * Gerçek KargoTakipNo + ZPL etiket döner (düz create bunları vermez). DB'ye dokunmaz.
   */
  async suratTestBarcode(): Promise<any> {
    if (!this.suratTrackingService) return { ok: false, error: 'Takip servisi kullanılamıyor' };
    if (!this.suratCargoService?.isIntegrationEnabled()) {
      return { ok: false, error: 'SURAT_CARGO_ENABLED kapalı (Coolify env kontrol et)' };
    }
    const ref = `ADMIN-BARKOD-${Date.now()}`;
    const result = await this.suratTrackingService.probeBarcode({
      KisiKurum: 'ADMIN BARKOD TEST',
      SahisBirim: 'Endpoint testi',
      AliciAdresi: 'Caferağa Mah. Moda Cad. No:14',
      Il: 'İstanbul',
      Ilce: 'Kadıköy',
      TelefonCep: '5321112233',
      KargoTuru: SuratKargoTuru.Koli,
      OdemeTipi: SuratOdemeTipi.Pesin,
      OzelKargoTakipNo: ref,
      Adet: 1,
      BirimDesi: 1,
      BirimKg: 1,
      KapidanOdemeTahsilatTipi: SuratKapidanOdemeTahsilatTipi.Nakit,
      TasimaSekli: SuratTasimaSekli.KaraYolu,
      TeslimSekli: SuratTeslimSekli.AdreseTeslim,
      GonderiSekli: SuratGonderiSekli.Standart,
      Pazaryerimi: 0,
      Iademi: false,
    });
    return { ref, ...result };
  }

  /**
   * Test konsolu: GonderiSil ile gönderiyi sil/pasif et (referansla). DB'ye dokunmaz.
   */
  async suratTestSil(ref: string): Promise<any> {
    if (!ref?.trim()) return { ok: false, error: 'Referans (WebSiparisKodu) gerekli' };
    if (!this.suratTrackingService) return { ok: false, error: 'Takip servisi kullanılamıyor' };
    return this.suratTrackingService.probeGonderiSil(ref.trim());
  }

}
