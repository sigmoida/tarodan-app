/** @format */

import type { AttributeGroupsStatus } from "../queries";

export interface OptionPlaceholderTexts {
  loading: string;
  failed: string;
  empty: string;
  ready: string;
}

/**
 * Boş bir seçenek listesinin ekranda ne diyeceği.
 *
 * "Tanımlanmamış" demek YALNIZ katalog gerçekten boşken doğrudur. İstek
 * düştüğünde aynı şeyi demek satıcıyı yanıltır — hatayı katalogda sanır ve
 * alan zorunluysa ilanı hiç kaydedemez; sayfayı yenilemek çözerken kimse
 * söylemez. Yükleme anında da göstermek, her açılışta "bozuk" görünen bir
 * form demektir. Ölçek/malzeme alanları ve özel grup kartı aynı kuralı
 * paylaşır.
 */
export function optionPlaceholder(
  status: AttributeGroupsStatus,
  count: number,
  texts: OptionPlaceholderTexts,
): { placeholder: string; disabled: boolean } {
  if (count > 0) return { placeholder: texts.ready, disabled: false };
  if (status === "loading")
    return { placeholder: texts.loading, disabled: true };
  if (status === "failed") return { placeholder: texts.failed, disabled: true };
  return { placeholder: texts.empty, disabled: true };
}
