/**
 * Private mesaj ekinin servis ucu URL'si — kurulumu ve çözümü TEK kaynak.
 *
 * Yükleme (`POST /media/upload?folder=messages`) istemciye bu URL'yi döner,
 * istemci de mesaj gövdesine `[IMG:<url>]` olarak gömer. Mesaj gönderiminde
 * gövdedeki her işaretin bu biçimde olduğu buradan doğrulanır; biçim iki yerde
 * ayrı ayrı yazılırsa sessizce ayrışır.
 */
export const MESSAGE_ATTACHMENT_PATH = "/api/media/message-attachment/";

/** MediaFile id'si `@default(uuid())` — küçük harf, tireli 36 karakter. */
const MESSAGE_ATTACHMENT_ID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MESSAGE_ATTACHMENT_ID_RE = new RegExp(
  `/api/media/message-attachment/(${MESSAGE_ATTACHMENT_ID_PATTERN})$`,
);
const BARE_ID_RE = new RegExp(`^${MESSAGE_ATTACHMENT_ID_PATTERN}$`);

/** Servis ucunun `:id` parametresi geçerli bir ek id'si mi (biçim). */
export function isMessageAttachmentId(id: string): boolean {
  return BARE_ID_RE.test(id);
}

/** `${apiUrl}/api/media/message-attachment/<id>` (sondaki `/` kırpılır). */
export function messageAttachmentUrl(
  apiUrl: string,
  mediaFileId: string,
): string {
  return `${apiUrl.replace(/\/$/, "")}${MESSAGE_ATTACHMENT_PATH}${mediaFileId}`;
}

/**
 * URL'nin sonundaki mesaj eki id'si; biçim tutmuyorsa `null`. Kökü (API_URL)
 * DOĞRULAMAZ — çağıran, id'den yeniden kurduğu URL ile birebir karşılaştırır.
 */
export function messageAttachmentIdFromUrl(url: string): string | null {
  return MESSAGE_ATTACHMENT_ID_RE.exec(url)?.[1] ?? null;
}
