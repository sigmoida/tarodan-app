/**
 * PDF için Türkçe karakter destekli Unicode font çözümü (tek kaynak).
 *
 * pdfkit'in varsayılan Helvetica'sı yalnız Latin-1 kapsar ve İ/ı/ş/ğ'yi bozar.
 * Paketlenmiş DejaVu Sans (tam Türkçe kapsama, serbestçe dağıtılabilir)
 * node:alpine gibi sistem fontu olmayan ortamlarda da doğru çıktı verir.
 * Sipariş özeti PDF'i ve mali fatura görsel kopyası aynı çözümü paylaşır.
 */
import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

export type PdfFontWeight = "regular" | "bold";

/**
 * Öncelik: paketlenmiş DejaVu -> env override (yalnız regular) -> sistem
 * fontları -> null (Helvetica).
 */
export function resolvePdfFontPath(
  weight: PdfFontWeight = "regular",
  envFontPath?: unknown,
): string | null {
  const bundledName =
    weight === "bold" ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf";
  // Hem dev hem build düzenini kapsa (kod dist/src/... altında koşar, asset'ler dist/ altına düşer).
  const bundledCandidates = [
    path.join(__dirname, "../assets/fonts", bundledName),
    path.join(__dirname, "../../assets/fonts", bundledName),
    path.join(__dirname, "../../../assets/fonts", bundledName),
    path.join(__dirname, "../../../../assets/fonts", bundledName),
    path.join(process.cwd(), "dist/src/assets/fonts", bundledName),
    path.join(process.cwd(), "dist/assets/fonts", bundledName),
    path.join(process.cwd(), "src/assets/fonts", bundledName),
    path.join(process.cwd(), "assets/fonts", bundledName),
  ];
  for (const p of bundledCandidates) {
    if (fs.existsSync(p)) return p;
  }

  if (
    weight === "regular" &&
    envFontPath &&
    typeof envFontPath === "string" &&
    fs.existsSync(envFontPath)
  )
    return envFontPath;

  // Sistem font yedekleri (Arial ve DejaVu Türkçe destekler).
  const candidates: string[] = [];
  if (process.platform === "win32") {
    candidates.push(
      weight === "bold"
        ? "C:\\Windows\\Fonts\\arialbd.ttf"
        : "C:\\Windows\\Fonts\\arial.ttf",
      "C:\\Windows\\Fonts\\arial.ttf",
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      weight === "bold"
        ? "/Library/Fonts/Arial Bold.ttf"
        : "/System/Library/Fonts/Supplemental/Arial.ttf",
      "/System/Library/Fonts/Supplemental/Arial.ttf",
      "/Library/Fonts/Arial.ttf",
    );
  } else {
    candidates.push(
      weight === "bold"
        ? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/msttcorefonts/arial.ttf",
      "/usr/share/fonts/TTF/Arial.ttf",
    );
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** pdfkit'in font kaydı için ihtiyaç duyduğu dar yüz. */
interface FontRegistrar {
  registerFont(name: string, src: string): unknown;
}

export interface PdfFontNames {
  regular: string;
  bold: string;
}

const HELVETICA: PdfFontNames = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
};

/**
 * Unicode fontu belgeye kaydeder ve kullanılacak font adlarını döner; font
 * bulunamaz ya da kayıt patlarsa Helvetica'ya düşer (uyarı loglanır).
 */
export function registerPdfFonts(
  doc: FontRegistrar,
  options: { envFontPath?: unknown; logger?: Logger } = {},
): PdfFontNames {
  const regularPath = resolvePdfFontPath("regular", options.envFontPath);
  const boldPath = resolvePdfFontPath("bold", options.envFontPath);
  if (!regularPath) {
    options.logger?.warn(
      "No Unicode invoice font found — Turkish characters may not render. Bundle DejaVu Sans or set INVOICE_FONT_PATH.",
    );
    return HELVETICA;
  }
  try {
    doc.registerFont("body", regularPath);
    doc.registerFont("body-bold", boldPath || regularPath);
    return { regular: "body", bold: "body-bold" };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    options.logger?.warn(
      `Failed to register invoice font (${regularPath}): ${message}. Falling back to Helvetica.`,
    );
    return HELVETICA;
  }
}
