import { BadRequestException, Injectable } from "@nestjs/common";
import type { NetsisQueriesApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import { asNetsisRecordList } from "../helpers/netsis-response.helper";
import type {
  NetsisQueryParams,
  NetsisRawRecord,
} from "../helpers/netsis.types";
import { i18nMessage } from "../../i18n/localized-message";
import { NetsisHttpClient } from "../http/netsis-http.client";

/**
 * Yazma/şema değiştiren ya da başka ifade zincirleyen her şey. `SELECT … INTO`
 * da yasak: yeni tablo yaratır. Kelime sınırıyla aranır ki `UPDATED_AT` gibi
 * kolon adları takılmasın.
 */
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|into|openrowset|opendatasource|bulk|backup|restore|shutdown|dbcc|waitfor)\b/i;

/**
 * NetRS ham SQL ucunu YALNIZ okumaya açan bekçi. Netsis'e gitmeden reddeder:
 * tek bir `SELECT` (ya da `WITH … SELECT`), yorum yok, `;` yok, yazma anahtar
 * kelimesi yok. Değer gereken sorgu `@ad` yer tutucusu taşır ve değer
 * `bindNetsisQueryParams` ile bağlanır — kullanıcı girdisi asla elle
 * birleştirilmez.
 *
 * Bu bir sözdizimi bekçisi, güvenlik sınırı değil: asıl sınır Netsis'te
 * NETSIS_DB_USER'ın yetkileridir (docs/NETSIS.md).
 */
export function assertNetsisReadOnlySelect(sql: string): string {
  const statement = sql.trim();
  const readOnly =
    /^(select|with)\s/i.test(statement) &&
    !/;|--|\/\*|\*\//.test(statement) &&
    !FORBIDDEN_KEYWORDS.test(statement);
  if (!readOnly) {
    throw new BadRequestException(
      i18nMessage("server.netsis.queryNotReadOnly"),
    );
  }
  return statement;
}

/** `@ad` yer tutucusu; `@@ROWCOUNT` gibi sistem değişkenleri yer tutucu değildir. */
const PLACEHOLDER = /(?<!@)@([A-Za-z_][A-Za-z0-9_]*)/g;

const hasControlCharacter = (value: string): boolean =>
  [...value].some((char) => char.charCodeAt(0) < 0x20);

/**
 * VERIFY: NetOpenX `Queries` ucunun parametre desteği belgelenmemiş; bu
 * yüzden bağlama BİZDE yapılır. Her `@ad` bir T-SQL Unicode metin literaline
 * (`N'…'`, tek tırnak ikilenir) dönüşür. Eksik ya da fazla parametre ve kontrol
 * karakteri taşıyan değer Netsis'e gitmeden reddedilir.
 *
 * Bekçi (`assertNetsisReadOnlySelect`) BAĞLAMADAN ÖNCE, sabit sorgu üzerinde
 * çalışır: değerin içindeki bir "delete" kelimesi literal içindedir ve sorguyu
 * yazmaya çevirmez.
 */
export function bindNetsisQueryParams(
  sql: string,
  params: NetsisQueryParams = {},
): string {
  const invalid = (name: string) =>
    new BadRequestException(
      i18nMessage("server.netsis.queryParamInvalid", { name }),
    );
  const used = new Set<string>();
  const bound = sql.replace(PLACEHOLDER, (_match, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(params, name)
      ? params[name]
      : undefined;
    if (typeof value !== "string" || hasControlCharacter(value)) {
      throw invalid(name);
    }
    used.add(name);
    return `N'${value.replace(/'/g, "''")}'`;
  });
  const unused = Object.keys(params).find((name) => !used.has(name));
  if (unused !== undefined) throw invalid(unused);
  return bound;
}

@Injectable()
export class NetsisQueriesClient implements NetsisQueriesApi {
  constructor(private readonly http: NetsisHttpClient) {}

  /** VERIFY: gövde `{ Query }` varsayıldı. */
  async select(
    sql: string,
    params?: NetsisQueryParams,
  ): Promise<NetsisRawRecord[]> {
    const query = bindNetsisQueryParams(assertNetsisReadOnlySelect(sql), params);
    return asNetsisRecordList(
      await this.http.post(NETSIS_PATHS.queries, { Query: query }),
    );
  }
}
