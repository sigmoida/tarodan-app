/**
 * Güven Skoru (Trust Score) — 0..100
 *
 * Belgedeki "Güven skoru" premium avantajı için satıcı itibarını tek bir sayıya indirger.
 * Bileşenler (toplam max 100):
 *  - Puan (0..50): ortalama puan (0..5) + değerlendirme sayısına göre güven katsayısı
 *  - Satış (0..25): tamamlanmış sipariş sayısı (50'de doygunluk)
 *  - Takas (0..15): tamamlanmış takas sayısı (20'de doygunluk)
 *  - Doğrulanmış hesap (0..10)
 *
 * Saf fonksiyon: hem API yanıtında hem ileride başka yerlerde aynı hesap için tek kaynak.
 */
export interface TrustScoreInput {
  /** Ortalama satıcı puanı (0..5) */
  averageRating: number;
  /** Onaylı değerlendirme sayısı */
  totalRatings: number;
  /** Tamamlanmış satış sayısı */
  totalSales: number;
  /** Tamamlanmış takas sayısı */
  totalTrades: number;
  /** Hesap doğrulanmış mı */
  isVerified: boolean;
}

export interface TrustScoreResult {
  score: number; // 0..100
  level: 'Yeni' | 'Gelişmekte' | 'Orta' | 'Güvenilir' | 'Çok Güvenilir';
}

export function computeTrustScore(input: TrustScoreInput): TrustScoreResult {
  const rating = Math.max(0, Math.min(5, input.averageRating ?? 0));
  const totalRatings = Math.max(0, input.totalRatings ?? 0);
  const totalSales = Math.max(0, input.totalSales ?? 0);
  const totalTrades = Math.max(0, input.totalTrades ?? 0);

  // Değerlendirme sayısı arttıkça puanın etkisi güçlenir (tek bir 5 puanlık değerlendirme
  // yeni satıcıya tam 50 vermesin diye güven katsayısı uygulanır).
  const ratingConfidence = Math.min(totalRatings, 10) / 10; // 0..1
  const ratingPart = (rating / 5) * 50 * ratingConfidence; // 0..50

  const salesPart = (Math.min(totalSales, 50) / 50) * 25; // 0..25
  const tradesPart = (Math.min(totalTrades, 20) / 20) * 15; // 0..15
  const verifiedPart = input.isVerified ? 10 : 0; // 0..10

  const score = Math.round(
    Math.min(100, ratingPart + salesPart + tradesPart + verifiedPart),
  );

  let level: TrustScoreResult['level'] = 'Yeni';
  if (score >= 80) level = 'Çok Güvenilir';
  else if (score >= 60) level = 'Güvenilir';
  else if (score >= 35) level = 'Orta';
  else if (score >= 1) level = 'Gelişmekte';

  return { score, level };
}
