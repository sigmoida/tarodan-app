import type { NetsisItemsApi } from "../gateway/netsis-gateway";
import { classifyNetsisError } from "../http/netsis-error";
import { netsisItemCode } from "./netsis-model.helper";
import type { NetsisCallOptions, NetsisItem } from "./netsis.types";

/**
 * Hizmet kartını "varsa al, yoksa aç". İki süreç aynı kartı aynı anda açmaya
 * kalkarsa ikincisi çakışma alır; o durumda kart artık vardır ve onu döndürmek
 * doğru sonuçtur. Canlı istemci ve stub aynı akışı kullanır.
 */
export async function ensureNetsisItem(
  api: Pick<NetsisItemsApi, "findByCode" | "create">,
  item: NetsisItem,
  options?: NetsisCallOptions,
): Promise<NetsisItem> {
  const code = netsisItemCode(item);
  const existing = await api.findByCode(code, options);
  if (existing) return existing;
  try {
    return await api.create(item, options);
  } catch (error: unknown) {
    if (classifyNetsisError(error) !== "conflict") throw error;
    const raced = await api.findByCode(code, options);
    if (raced) return raced;
    throw error;
  }
}
