/**
 * HUKUKİ METİNLERDEKİ SÜRELER — yönetilen bir süre, sözleşme metninde sabit
 * sayı olarak da geçiyorsa metinle ayar çelişebilir.
 *
 * Mesafeli satış sözleşmesi, iade politikası ve satıcı sözleşmesi birer
 * SÖZLEŞMEDİR: içlerindeki süre sessizce ayara bağlanmaz (metni değiştirmek
 * müşterinin kararıdır). Bunun yerine metinlerin ifade ettiği değer burada
 * kayıtlıdır ve admin "Süreler ve Kurallar" ekranı, yapılandırılmış değer
 * metindekinden farklı olduğunda ilgili satırda UYARI gösterir.
 *
 * Her kayıt metnin katalog anahtarını da taşır: bir admin testi o anahtardaki
 * metnin gerçekten bu sayıyı içerdiğini doğrular — kayıt metinden ayrışırsa
 * test kırılır, uyarı sessizce yanlış olamaz.
 *
 * Yalnız yönetilen bir kurala (`TIMING_RULES`) karşılık gelen ifadeler burada
 * durur. Kuralsız süreler (KVKK saklama süreleri, çerez ömürleri, "3–5 iş günü
 * inceleme", mevzuattan alıntılanan sabitler) `docs/TIMING_RULES.md`
 * envanterindedir.
 */
import type { TimingRuleId } from "./timing-rules";

/** Süre ifadesi taşıyan hukuki belgeler. */
export const LEGAL_TIMING_DOCUMENTS = [
  "distanceSales",
  "refundPolicy",
  "sellerAgreement",
] as const;
export type LegalTimingDocument = (typeof LEGAL_TIMING_DOCUMENTS)[number];

export interface LegalTimingStatement {
  /** Metnin ifade ettiği yönetilen süre. */
  ruleId: TimingRuleId;
  /** Metinde yazan sayı (kaydın kendi biriminde). */
  stated: number;
  document: LegalTimingDocument;
  /** `@tarodan/i18n` katalog anahtarı (tr + en aynı sayıyı taşır). */
  catalogKey: string;
}

export const LEGAL_TIMING_STATEMENTS: readonly LegalTimingStatement[] = [
  // Cayma / iade penceresi (returnWindowDays) — 14 gün.
  {
    ruleId: "returnWindowDays",
    stated: 14,
    document: "distanceSales",
    catalogKey: "legal.distanceSales.caymaHakki14GunKapsamSure",
  },
  {
    ruleId: "returnWindowDays",
    stated: 14,
    document: "distanceSales",
    catalogKey: "legal.distanceSales.caymaHakkiVeKullanimi14Gun",
  },
  {
    ruleId: "returnWindowDays",
    stated: 14,
    document: "distanceSales",
    catalogKey: "legal.distanceSales.aliciUrunuTeslimAldigiTarihtenItibaren",
  },
  {
    ruleId: "returnWindowDays",
    stated: 14,
    document: "distanceSales",
    catalogKey: "legal.distanceSales.metaDescription",
  },
  {
    ruleId: "returnWindowDays",
    stated: 14,
    document: "refundPolicy",
    catalogKey: "legal.refundPolicy.kargonuzuTeslimAldiginizAndanItibarenYasal",
  },
  {
    ruleId: "returnWindowDays",
    stated: 14,
    document: "sellerAgreement",
    catalogKey: "legal.sellerAgreement.satisBedeliAliciUrunuTeslimAlip",
  },
  // Satıcının kargoya verme süresi (preparingDeadlineDays) — "3 iş günü".
  {
    ruleId: "preparingDeadlineDays",
    stated: 3,
    document: "sellerAgreement",
    catalogKey: "legal.sellerAgreement.satisiYapilanUrunEnGec3",
  },
  {
    ruleId: "preparingDeadlineDays",
    stated: 3,
    document: "sellerAgreement",
    catalogKey:
      "legal.sellerAgreement.kurumsalSaticiYuksekHacimliSiparislerdeDahi",
  },
];

export interface LegalTimingMismatch {
  /** Metinde yazan sayı. */
  stated: number;
  /** Bu sayıyı yazan (ve yapılandırılmış değerle çelişen) belgeler. */
  documents: LegalTimingDocument[];
}

/**
 * Yapılandırılmış `value`, hukuki metinlerde yazan sayıdan farklıysa çelişkiyi
 * döner; çelişki yoksa (ya da kural hiçbir metinde geçmiyorsa) null.
 */
export function legalTimingMismatch(
  ruleId: TimingRuleId,
  value: number,
): LegalTimingMismatch | null {
  const conflicting = LEGAL_TIMING_STATEMENTS.filter(
    (statement) => statement.ruleId === ruleId && statement.stated !== value,
  );
  if (conflicting.length === 0) return null;
  return {
    stated: conflicting[0].stated,
    documents: [...new Set(conflicting.map((s) => s.document))],
  };
}
