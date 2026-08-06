/**
 * Bir indirim tutarını satırlara ağırlık (satır toplamı) oranında dağıtır.
 *
 * Aynı döngü üç yerde ayrı yazılmıştı — sepet özeti, checkout önizlemesi ve
 * grup sipariş oluşturma — ve üçü de "son satır artığı alır" kuralını kendi
 * yerel değişkeniyle çözüyordu.
 *
 * DEĞİŞMEZLER (hepsi testle sabitlenmiştir):
 *  1. Hiçbir pay NEGATİF olamaz.
 *  2. Hiçbir pay kendi satır tutarını (ağırlığını) aşamaz.
 *  3. Payların toplamı, dağıtılabilir tutara kuruşu kuruşuna eşittir.
 *  4. Dağıtılacak tutar ağırlık toplamını aşıyorsa önce ağırlık toplamına
 *     KIRPILIR — fazlası dağıtılmaz.
 *  5. Ağırlığı 0 olan satır pay almaz.
 *
 * İlk üçü "her satırı ayrı yuvarla, artığı son satıra yaz" yaklaşımıyla
 * sağlanamıyordu: yuvarlanan payların toplamı dağıtılacak tutarı aştığında son
 * satır NEGATİF pay alıyordu (0.02 TL / 4 eşit satır → son satır -0.01), ve tek
 * satırlık bir sepette satır tutarından büyük bir kupon payı yazılabiliyordu.
 *
 * Yöntem: kuruş tamsayıları üzerinde en-büyük-kalan (largest remainder).
 * Herkes payının tam kısmını alır, artan kuruşlar kesirli payı en büyük olandan
 * başlayarak birer birer dağıtılır; tavana ulaşmış satır atlanır. Eşitlikte
 * küçük index önce gelir — sonuç girdi sırasına göre DETERMİNİSTİKTİR.
 */

export function allocateProportionally(
  total: number,
  weights: number[],
): number[] {
  const shares = weights.map(() => 0);

  // Kuruş tamsayısında çalışılır: kayan noktalı toplama artığı, değişmez 3'ü
  // (payların toplamı === dağıtılan tutar) tek başına bozabiliyor.
  const capCents = weights.map((weight) =>
    weight > 0 ? Math.round(weight * 100) : 0,
  );
  const weightCents = capCents.reduce((sum, cents) => sum + cents, 0);
  if (!(total > 0) || weightCents <= 0) return shares;

  // Değişmez 4: ağırlık toplamından fazlası dağıtılamaz.
  const totalCents = Math.min(Math.round(total * 100), weightCents);

  const exact = capCents.map((cents) => (totalCents * cents) / weightCents);
  const centShares = exact.map((value, index) =>
    // Değişmez 2: tam kısım bile satır tavanını aşmamalı.
    Math.min(Math.floor(value), capCents[index]),
  );
  let remainder =
    totalCents - centShares.reduce((sum, cents) => sum + cents, 0);

  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  // Tavanlar yüzünden tek tur yetmeyebilir; hiçbir satır alamıyorsa (hepsi
  // tavanda) döngü kendi kendine biter.
  while (remainder > 0) {
    let distributed = false;
    for (const { index } of byFraction) {
      if (remainder === 0) break;
      if (centShares[index] >= capCents[index]) continue;
      centShares[index] += 1;
      remainder -= 1;
      distributed = true;
    }
    if (!distributed) break;
  }

  return centShares.map((cents) => cents / 100);
}
