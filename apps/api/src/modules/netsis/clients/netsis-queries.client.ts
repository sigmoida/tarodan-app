import { BadRequestException, Injectable } from "@nestjs/common";
import type { NetsisQueriesApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import { asNetsisRecordList } from "../helpers/netsis-response.helper";
import type { NetsisRawRecord } from "../helpers/netsis.types";
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
 * kelimesi yok. Parametre desteği yok — çağıran sabit bir sorgu verir, kullanıcı
 * girdisi asla birleştirilmez (bu sınıf onu tırnaklayamaz).
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

@Injectable()
export class NetsisQueriesClient implements NetsisQueriesApi {
  constructor(private readonly http: NetsisHttpClient) {}

  /** VERIFY: gövde `{ Query }` varsayıldı. */
  async select(sql: string): Promise<NetsisRawRecord[]> {
    const query = assertNetsisReadOnlySelect(sql);
    return asNetsisRecordList(
      await this.http.post(NETSIS_PATHS.queries, { Query: query }),
    );
  }
}
