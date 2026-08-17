/**
 * Sürat REST create uçlarının ORTAK taşıma katmanı.
 *
 * `GonderiyiKargoyaGonder` ve `GonderiOlustur` farklı gövdeler alır ama aynı
 * yanıt sözleşmesini paylaşır: dönüş tipi düz string'dir ("Tamam" ya da hata
 * mesajı). Timeout çevrimi, 4xx/5xx'in asla başarı sayılmaması ve bazı Sürat
 * kurulumlarının aynı sonucu `IsError`/`Message` zarfında vermesi de ortak.
 *
 * Bu mantık iki istemcide kopyalanırsa, birinde düzeltilen bir yanlış-başarı
 * hatası diğerinde yaşamaya devam eder — geçiş süresince ikisi de canlıda
 * kullanılabildiği için bu, gönderi oluşmadan "oluştu" demek anlamına gelir.
 */

interface SuratRestResult {
  Message?: string | null;
  IsError?: boolean;
  StatusCode?: number;
}

export function responseSnippet(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Sürat create ucuna POST atar ve dokümante edilen string sonucu döndürür.
 *
 * Boş gövde `""` döner — çağıran servis bunu EMPTY_RESPONSE teknik hatası
 * sayar. Bir yanıtın "Tamam" olup olmadığına burada KARAR VERİLMEZ; o
 * yorumlama servis katmanındadır, böylece iki uç da aynı kuralla ölçülür.
 */
export async function postSuratCreate(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();

    if (response.status >= 400) {
      const snippet = responseSnippet(text);
      const err = new Error(
        `HTTP ${response.status}${snippet ? `: ${snippet}` : ""}`,
      ) as Error & { statusCode?: number; rawBodySnippet?: string };
      err.statusCode = response.status;
      err.rawBodySnippet = snippet;
      throw err;
    }

    if (!text.trim()) return "";

    let decoded: string | SuratRestResult;
    try {
      decoded = JSON.parse(text) as string | SuratRestResult;
    } catch {
      // Dönüş tipi dokümanda string. Sunucu bunu JSON string yerine düz metin
      // döndürürse servis katmanı yalnız tam "Tamam" değerini başarı sayar;
      // HTML veya başka bir metin yanlışlıkla başarıya dönüşmez.
      decoded = text.trim();
    }

    if (typeof decoded === "string") return decoded.trim();

    const message = String(decoded.Message ?? "").trim();
    if (decoded.IsError === false) return "Tamam";

    return (
      message ||
      `Beklenmeyen Sürat yanıtı (hata kodu: ${decoded.StatusCode ?? "bilinmiyor"})`
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeout = new Error("ETIMEDOUT");
      (timeout as NodeJS.ErrnoException).code = "ETIMEDOUT";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Sürat test (api02) / canlı (api01) host seçimi — iki istemcide de aynı kural. */
export function suratHost(isTestMode: boolean): string {
  return isTestMode
    ? "https://api02.suratkargo.com.tr"
    : "https://api01.suratkargo.com.tr";
}
