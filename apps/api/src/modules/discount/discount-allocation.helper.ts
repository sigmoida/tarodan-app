/**
 * Bir indirim tutarını satırlara ağırlık (satır toplamı) oranında dağıtır.
 *
 * Aynı döngü üç yerde ayrı yazılmıştı — sepet özeti, checkout önizlemesi ve
 * grup sipariş oluşturma — ve üçü de "son satır artığı alır" kuralını kendi
 * yerel değişkeniyle çözüyordu. Kuruş artığı üç ayrı yerde toplandığı için
 * çok satırlı sepetlerde önizleme ile tahsilat 1-2 kuruş ayrışabiliyordu.
 *
 * Kurallar:
 *  - Paylar kuruşa yuvarlanır; yuvarlama artığı POZİTİF ağırlıklı SON satıra
 *    yazılır → payların toplamı her zaman `total`a birebir eşittir.
 *  - Ağırlığı olmayan (0) satır pay almaz; artık da ona düşmez.
 *  - Toplam 0 veya ağırlık toplamı 0 ise her satır 0 alır.
 */

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function allocateProportionally(
  total: number,
  weights: number[],
): number[] {
  const shares = weights.map(() => 0);
  const positive = weights.map((weight) => (weight > 0 ? weight : 0));
  const weightSum = positive.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0) || !(weightSum > 0)) return shares;

  let lastPositive = -1;
  for (let index = 0; index < positive.length; index += 1) {
    if (positive[index] > 0) lastPositive = index;
  }

  let allocated = 0;
  for (let index = 0; index < positive.length; index += 1) {
    if (positive[index] === 0 || index === lastPositive) continue;
    shares[index] = round2((total * positive[index]) / weightSum);
    allocated += shares[index];
  }
  // Artık son pozitif satıra: Σ pay === total değişmezi bozulmasın.
  shares[lastPositive] = round2(total - allocated);
  return shares;
}
