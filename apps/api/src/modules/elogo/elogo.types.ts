/**
 * eLogo (Logo özel entegratör) e-Belge entegrasyonu — ortak tipler.
 *
 * Servis: **PostBoxService** (SOAP/WCF).
 *   Canlı:  https://pb.elogo.com.tr/PostBoxService.svc
 *   Test:   https://betatest.elogo.com.tr/webservice/PostBoxService.svc (ayrı test kimliği gerekir)
 * Belge formatı: UBL-TR XML → ZIP → base64. Mali mühür eLogo tarafında basılır.
 * Referans: "Özel Entegratör Sistemi Uygulama Arabirim Dokümanı".
 */

/** GİB belge senaryosu. Bireysel/kayıtsız alıcı → EARCHIVE, e-Fatura mükellefi → EINVOICE. */
export type ElogoDocumentType = 'EARCHIVE' | 'EINVOICE';

/** Login sonrası oturum. Sonraki tüm çağrılarda sessionId taşınır. */
export interface ElogoSession {
  sessionId: string;
  /** Oturumun alındığı an (ms epoch) — yenileme kararı için. */
  acquiredAt: number;
}

/** GetValidateGIBUser sonucu — bir VKN/TCKN için. */
export interface ElogoUserCheckResult {
  /** Sorgulanan VKN veya TCKN. */
  identifier: string;
  /** GİB e-Fatura mükellefi mi? (ISGIBUSER=1) true → e-Fatura, false → e-Arşiv. */
  isEInvoiceUser: boolean;
  /** e-Fatura posta kutusu etiketi (EINVOICEPKALIAS) — e-Fatura gönderiminde ALIAS olarak gerekir. */
  eInvoicePkAlias?: string;
  /** GİB'e kayıt tarihi (REGISTERTIME). */
  registerTime?: string;
}

/** Tek bir belgeyi (UBL-TR) eLogo'ya gönderme parametreleri. */
export interface ElogoSendDocumentParams {
  documentType: ElogoDocumentType;
  /** ETTN (belge UUID). Bizim tarafta üretilir. */
  documentUuid: string;
  /** Fatura numarası (varsa). */
  documentNumber?: string;
  /** Ham UBL-TR XML metni. Client ZIP'leyip base64'ler. */
  ublXml: string;
  /** ALIAS — e-Fatura için alıcı PK etiketi (GetValidateGIBUser'dan). e-Arşiv'de opsiyonel. */
  alias?: string;
  /** Belge imzalı mı (SIGNED). Varsayılan false → eLogo mühürler. */
  signed?: boolean;
  /** XSLTUUID — portala yüklenen görsel tasarımın UUID'i (opsiyonel). */
  xsltUuid?: string;
  /** Ek paramList girdileri ("Name=Value"). e-Arşiv gönderim şekli vb. için. */
  extraParams?: string[];
}

/** Belge gönderim sonucu (ResultType). */
export interface ElogoSendResult {
  success: boolean;
  documentUuid?: string;
  /** ResultType.resultCode (1 başarılı, -1 hata, -2 oturum bitti). */
  code?: number;
  /** ResultType.resultMsg. */
  description?: string;
  /** SendDocument out refId. */
  refId?: number;
}

/** Belge durum sorgu sonucu (DocumentStatusType). */
export interface ElogoDocumentStatus {
  documentUuid: string;
  /** İşlem durumu: 1 devam, 2 başarıyla bitti, -1 hata. */
  status: number;
  /** GİB durum kodu (ör. 1300 = başarıyla tamamlandı). */
  code?: number;
  description?: string;
  /** Belge iptal edildi mi. */
  isCancel?: boolean;
}

/** SOAP çağrı opsiyonları. */
export interface ElogoSoapCallOptions {
  timeoutMs: number;
}
