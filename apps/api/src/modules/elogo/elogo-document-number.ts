/**
 * eLogo/GİB belge numarasının biçimi — TEK kaynak.
 *
 * Numara 16 karakterdir: 3 harf önek + 4 hane yıl + 9 hane sıra. Sıra
 * `ElogoDocSequence` üzerinden boşluksuz (gap-free) ilerler; GİB bunu zorunlu
 * tutar.
 *
 * Formatı hem runtime tahsisi hem de seed kullanır. Ayrı yazıldıklarında seed
 * numaraları yazıp sayacı ilerletmiyordu: sonraki gerçek tahsis 1'den başlayıp
 * unique kısıta takılıyor ve artış aynı transaction'da olduğu için geri sarıyordu
 * — hiçbir faturanın kesilemediği kalıcı bir kilit.
 */

const SEQUENCE_DIGITS = 9;
const YEAR_DIGITS = 4;

/** GİB belge numarasının toplam uzunluğu (önek 3 varsayımıyla). */
export const ELOGO_NUMBER_LENGTH = 3 + YEAR_DIGITS + SEQUENCE_DIGITS;

export function formatElogoInvoiceNumber(
  prefix: string,
  year: number,
  value: number,
): string {
  return `${prefix}${year}${String(value).padStart(SEQUENCE_DIGITS, "0")}`;
}

/**
 * Verilen belge numaraları arasında bu önek+yıl için kullanılmış EN BÜYÜK sırayı
 * döndürür. Sayacın en az bu değere kurulması gerekir; aksi halde bir sonraki
 * tahsis zaten var olan bir numarayı üretir.
 */
export function highestSequenceValue(
  invoiceNumbers: string[],
  prefix: string,
  year: number,
): number {
  const head = `${prefix}${year}`;
  let highest = 0;
  for (const number of invoiceNumbers) {
    if (typeof number !== "string" || !number.startsWith(head)) continue;
    const tail = number.slice(head.length);
    if (tail.length !== SEQUENCE_DIGITS || !/^\d+$/.test(tail)) continue;
    highest = Math.max(highest, Number(tail));
  }
  return highest;
}
