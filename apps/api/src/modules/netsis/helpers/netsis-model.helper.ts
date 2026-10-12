import { Prisma } from "@prisma/client";
import { isNetsisRecord } from "./netsis-response.helper";
import type {
  NetsisArp,
  NetsisEDocumentState,
  NetsisItem,
  NetsisItemSlip,
  NetsisItemSlipKey,
  NetsisItemSlipLine,
  NetsisNumeric,
  NetsisRawRecord,
  NetsisSlipTotals,
} from "./netsis.types";

/**
 * Tahmini Netsis modellerinin (netsis.types.ts) anahtar alanlarını okuyan TEK
 * yer. Modeller `GET definitions/<R>` ile sabitlendiğinde istemciler ve stub
 * değişmez; yalnız bu dosya ve tipler değişir.
 */

export function netsisArpCode(arp: NetsisArp): string {
  return arp.CariTemelBilgi.CARI_KOD;
}

export function netsisItemCode(item: NetsisItem): string {
  return item.StokTemelBilgi.STOK_KODU;
}

/** Faturanın anahtarı; numara henüz atanmadıysa `null`. */
export function netsisSlipKey(slip: NetsisItemSlip): NetsisItemSlipKey | null {
  const number = slip.FatUst.FATIRS_NO?.trim();
  if (!number) return null;
  return {
    FaturaTip: slip.FaturaTip,
    FATIRS_NO: number,
    CARI_KODU: slip.FatUst.CARI_KODU,
  };
}

/** Aynı belge: tip + numara (cari, numara tekilliğine katılmaz). */
export function sameNetsisSlip(
  a: Pick<NetsisItemSlipKey, "FaturaTip" | "FATIRS_NO">,
  b: Pick<NetsisItemSlipKey, "FaturaTip" | "FATIRS_NO">,
): boolean {
  return a.FaturaTip === b.FaturaTip && a.FATIRS_NO === b.FATIRS_NO;
}

const MONEY_DP = 2;

function decimalOf(value: NetsisNumeric | undefined): Prisma.Decimal {
  if (value === undefined || value === "") return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_DP, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Satırlardan toplam: satır neti = miktar × net birim fiyat, satır KDV'si
 * satır netinden oranla; ikisi de SATIR başına 2 haneye yuvarlanır (e-belge
 * satır tutarlarının toplamı başlık toplamına eşit olmalı).
 *
 * Yalnız stub kullanır — canlıda toplamları Netsis hesaplar
 * (`ItemSlips/Calculate`), bu yüzden bu bir "ikinci formül" değil, Netsis'in
 * yerine geçen sahte. Canlı davranışla karşılaştırma doğrulama listesinde.
 */
export function sumNetsisSlipLines(
  lines: readonly NetsisItemSlipLine[],
): Omit<NetsisSlipTotals, "raw"> {
  let net = new Prisma.Decimal(0);
  let vat = new Prisma.Decimal(0);
  for (const line of lines) {
    const lineNet = roundMoney(
      decimalOf(line.STHAR_GCMIK).mul(decimalOf(line.STHAR_NF)),
    );
    const lineVat = roundMoney(lineNet.mul(decimalOf(line.STHAR_KDV)).div(100));
    net = net.add(lineNet);
    vat = vat.add(lineVat);
  }
  return { netAmount: net, vatAmount: vat, grossAmount: net.add(vat) };
}

/**
 * `ItemSlips/Calculate` yanıtından toplamlar. VERIFY: başlık alanlarının
 * TBLFATUIRS kolonları gibi `GENELTOPLAM` (KDV dahil) ve `KDV` olarak döndüğü
 * varsayıldı; net = genel toplam − KDV.
 */
export function readNetsisSlipTotals(raw: NetsisRawRecord): NetsisSlipTotals {
  const header = isNetsisRecord(raw.FatUst) ? raw.FatUst : raw;
  const numeric = (value: unknown): Prisma.Decimal =>
    typeof value === "number" || typeof value === "string"
      ? decimalOf(value)
      : new Prisma.Decimal(0);
  const gross = numeric(header.GENELTOPLAM);
  const vat = numeric(header.KDV);
  return {
    netAmount: gross.sub(vat),
    vatAmount: vat,
    grossAmount: gross,
    raw,
  };
}

/**
 * `CheckEDocument` yanıtındaki durum metninden normalize durum. VERIFY: alan
 * adı ve değer listesi bilinmiyor; tanınmayan her şey `unknown` kalır —
 * çağıran `unknown`'ı asla "kabul edildi" saymamalı.
 */
export function readNetsisEDocumentState(
  raw: NetsisRawRecord,
): NetsisEDocumentState {
  const candidate = ["Durum", "DURUM", "Status", "status", "State"]
    .map((field) => raw[field])
    .find((value) => typeof value === "string" || typeof value === "number");
  const text = String(candidate ?? "").toLocaleLowerCase("tr");
  if (!text) return "unknown";
  // Sıra önemli: "başarısız" kabulden, "kabul bekleniyor" gönderildiden önce
  // yakalanmalı — aksi halde reddedilmiş/bekleyen belge kabul edilmiş görünür.
  if (/iptal|cancel/.test(text)) return "cancelled";
  if (/reddedil|\bred\b|reject|başarısız|hata|error|fail/.test(text)) {
    return "rejected";
  }
  if (/bekl|pending|wait|kuyruk|queue|gönder|sent|ilet/.test(text)) {
    return "sent";
  }
  if (/kabul|accept|onay|başarılı|success/.test(text)) return "accepted";
  if (/taslak|draft/.test(text)) return "draft";
  return "unknown";
}

/** Yanıttaki ETTN (VERIFY: alan adı). */
export function readNetsisEttn(raw: NetsisRawRecord): string | null {
  for (const field of ["ETTN", "Ettn", "UUID", "Uuid", "GUID"]) {
    const value = raw[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Carinin GİB e-Fatura mükellefiyeti (Netsis'in kendi bayrağından). */
export interface NetsisArpEInvoiceProfile {
  /** `null` = bayrak okunamadı (alan yok ya da tanınmayan değer). */
  isEInvoiceUser: boolean | null;
  /** e-Fatura posta kutusu etiketi (PK alias), varsa. */
  alias: string | null;
}

/**
 * VERIFY: e-Fatura bayrağının ve PK etiketinin alan adları bilinmiyor.
 * `EDocument/EDocCurrentUpdate`'in GİB listesinden carinin ek bilgisine
 * yazdığı varsayıldı (`CariEkBilgi`, yoksa `CariTemelBilgi`). Değerler
 * Netsis'in "E"/"H" evet-hayır kodları ya da boolean/1-0 olabilir.
 */
const ARP_EINVOICE_FLAG_FIELDS = [
  "EFATURA_KULLANICISI",
  "EFATURA_KULLAN",
  "EFATURAKULLANICISI",
  "EFatKullanici",
] as const;
const ARP_EINVOICE_ALIAS_FIELDS = [
  "EFATURA_ETIKET",
  "EFATURA_PK_ETIKET",
  "PK_ETIKET",
  "GIB_ETIKET",
] as const;

function yesNo(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().toLocaleUpperCase("tr");
  if (["E", "EVET", "1", "TRUE", "T"].includes(text)) return true;
  if (["H", "HAYIR", "0", "FALSE", "F"].includes(text)) return false;
  return null;
}

/**
 * Carinin e-Fatura profili. Tanınmayan her şey `null` döner — çağıran
 * bilinmeyeni asla "mükellef" saymamalı.
 */
export function readNetsisArpEInvoiceProfile(
  arp: NetsisArp,
): NetsisArpEInvoiceProfile {
  const sources: NetsisRawRecord[] = [
    ...(isNetsisRecord(arp.CariEkBilgi) ? [arp.CariEkBilgi] : []),
    arp.CariTemelBilgi,
  ];
  let isEInvoiceUser: boolean | null = null;
  let alias: string | null = null;
  for (const source of sources) {
    for (const field of ARP_EINVOICE_FLAG_FIELDS) {
      isEInvoiceUser ??= yesNo(source[field]);
    }
    for (const field of ARP_EINVOICE_ALIAS_FIELDS) {
      const value = source[field];
      if (!alias && typeof value === "string" && value.trim()) {
        alias = value.trim();
      }
    }
  }
  return { isEInvoiceUser, alias };
}
