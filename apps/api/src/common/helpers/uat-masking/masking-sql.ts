import {
  ColumnRule,
  FakeKind,
  MaskColumnsRule,
  MaskRule,
  UAT_MASKING_CATALOG,
} from "./masking-catalog";
import {
  UAT_MASK_EMAIL_DOMAIN,
  UAT_MASK_PHONE_PREFIX,
  fakeBirthDate,
  fakeCompanyName,
  fakeEmail,
  fakeFileName,
  fakeFirstName,
  fakeFullName,
  fakeIban,
  fakeLastName,
  fakePhone,
  fakeStreet,
  fakeTaxId,
  fakeTckn,
  fakeToken,
  fakeUsername,
} from "./masking-fakes";
import { scrubFreeText, scrubJson } from "./masking-scrub";

/**
 * Katalog → SQL. Saf: veritabanına dokunmaz, yalnız çalıştırılacak ifadeleri ve
 * satır başına yeni değeri üretir. Çalıştırıcı (`prisma/uat/mask-database.ts`)
 * bunları sırayla uygular.
 *
 * Strateji (tablo büyük olabilir, satır satır JS döngüsü yok):
 *  - `null` / `constant` kolonlar tek bir küme UPDATE'iyle;
 *  - satır anahtarından hesaplanan kolonlar (`fake` / `json` / `freeText`)
 *    birincil anahtar sırasıyla sayfa sayfa okunur ve sayfa başına TEK
 *    `UPDATE … FROM unnest(ids, values)` ile yazılır;
 *  - tekil kolonlar önce satırın `ctid`'inden türeyen geçici değere çekilir:
 *    yeni sahte değer henüz işlenmemiş bir satırın eski değeriyle çakışamaz,
 *    yalnız sahte–sahte çakışması kalır, o da denemeyle (`attempt`) çözülür.
 */

export const UAT_MASK_BATCH_SIZE = 1000;
export const UAT_MASK_TEMP_PREFIX = "__uat_tmp__";

/** Katalogdaki adlar sabit metindir; yine de SQL'e girmeden doğrulanır. */
export function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier in masking catalog: ${name}`);
  }
  return `"${name}"`;
}

const keepClause = (rule: MaskColumnsRule): string =>
  rule.keepWhere ? ` AND NOT ${rule.keepWhere}` : "";

export function buildDeleteSql(table: string): string {
  return `DELETE FROM ${quoteIdent(table)}`;
}

type SetColumnRule = Extract<ColumnRule, { strategy: "null" | "constant" }>;
type ComputedColumnRule = Exclude<ColumnRule, SetColumnRule>;

export interface MaskRulePlan {
  /** Tek UPDATE ile yazılan kolonlar (`null` / `constant`). */
  setColumns: [string, SetColumnRule][];
  /** Satır anahtarından hesaplanan kolonlar. */
  computedColumns: [string, ComputedColumnRule][];
  /** Geçici değer ön geçişi isteyen tekil kolonlar. */
  uniqueColumns: string[];
}

export function planMaskRule(rule: MaskColumnsRule): MaskRulePlan {
  const plan: MaskRulePlan = {
    setColumns: [],
    computedColumns: [],
    uniqueColumns: [],
  };
  for (const [column, columnRule] of Object.entries(rule.columns)) {
    if (columnRule.strategy === "null" || columnRule.strategy === "constant") {
      plan.setColumns.push([column, columnRule]);
    } else {
      plan.computedColumns.push([column, columnRule]);
      if (columnRule.strategy === "fake" && columnRule.unique) {
        plan.uniqueColumns.push(column);
      }
    }
  }
  return plan;
}

/** `null`/`constant` kolonlarının tek UPDATE'i (yoksa `null`). */
export function buildSetSql(rule: MaskColumnsRule): string | null {
  const { setColumns } = planMaskRule(rule);
  if (setColumns.length === 0) return null;
  const assignments = setColumns
    .map(
      ([column, columnRule]) =>
        `${quoteIdent(column)} = ${columnRule.strategy === "null" ? "NULL" : columnRule.sql}`,
    )
    .join(", ");
  return `UPDATE ${quoteIdent(rule.table)} SET ${assignments} WHERE TRUE${keepClause(rule)}`;
}

export function buildTempUniqueSql(
  rule: MaskColumnsRule,
  column: string,
): string {
  const col = quoteIdent(column);
  return (
    `UPDATE ${quoteIdent(rule.table)} SET ${col} = '${UAT_MASK_TEMP_PREFIX}' || ctid::text` +
    ` WHERE ${col} IS NOT NULL${keepClause(rule)}`
  );
}

/** Hesaplanan kolonun anahtar kolonu: kolon > tablo > `id`. */
export function keyColumnOf(
  rule: MaskColumnsRule,
  columnRule: ComputedColumnRule,
): string {
  return columnRule.key ?? rule.keyColumn ?? "id";
}

const keyAlias = (column: string) => `__key_${column}`;

/**
 * Bir sayfa: `id`, gereken anahtar kolonları ve hesaplanan kolonların metin
 * hali. `$1` = son görülen id (ilk sayfada boş metin), `$2` = sayfa boyu.
 * Sayfalama birincil anahtar üzerinden (keyset; maskelenen her tablonun `id`
 * kolonu metin UUID'dir — contract spec doğrular), OFFSET yok.
 */
export function buildSelectBatchSql(rule: MaskColumnsRule): string {
  const { computedColumns } = planMaskRule(rule);
  const keys = new Set(
    computedColumns.map(([, columnRule]) => keyColumnOf(rule, columnRule)),
  );
  const selected = [
    `${quoteIdent("id")}::text AS ${quoteIdent("id")}`,
    ...[...keys].map(
      (key) => `${quoteIdent(key)}::text AS ${quoteIdent(keyAlias(key))}`,
    ),
    ...computedColumns.map(
      ([column]) => `${quoteIdent(column)}::text AS ${quoteIdent(column)}`,
    ),
  ].join(", ");
  return (
    `SELECT ${selected} FROM ${quoteIdent(rule.table)}` +
    ` WHERE ${quoteIdent("id")} > $1${keepClause(rule)}` +
    ` ORDER BY ${quoteIdent("id")} LIMIT $2`
  );
}

/** Kolonun SQL tipine dönüş: metin dışındaki hesaplanan kolonlar için. */
export function castFor(columnRule: ComputedColumnRule): string {
  if (columnRule.strategy === "json") return "::jsonb";
  if (columnRule.strategy === "fake" && columnRule.fake === "birthDate") {
    return "::timestamp(3)";
  }
  return "";
}

/** Bir sayfanın tek kolon yazımı: `$1` = id'ler, `$2` = yeni değerler. */
export function buildBatchUpdateSql(
  rule: MaskColumnsRule,
  column: string,
  columnRule: ComputedColumnRule,
): string {
  return (
    `UPDATE ${quoteIdent(rule.table)} AS t SET ${quoteIdent(column)} = v.val${castFor(columnRule)}` +
    ` FROM unnest($1::text[], $2::text[]) AS v(id, val)` +
    ` WHERE t.${quoteIdent("id")} = v.id`
  );
}

const FAKERS: Record<
  FakeKind,
  (key: string, original: string, attempt: number) => string
> = {
  email: (key, _o, attempt) => fakeEmail(key, attempt),
  phone: (key, _o, attempt) => fakePhone(key, attempt),
  tckn: (key, _o, attempt) => fakeTckn(key, attempt),
  taxId: (key, original) => fakeTaxId(key, original),
  iban: (key) => fakeIban(key),
  firstName: (key) => fakeFirstName(key),
  lastName: (key) => fakeLastName(key),
  fullName: (key) => fakeFullName(key),
  street: (key) => fakeStreet(key),
  companyName: (key, _o, attempt) => fakeCompanyName(key, attempt),
  username: (key, _o, attempt) => fakeUsername(key, attempt),
  birthDate: (key) => fakeBirthDate(key),
  token: (key, _o, attempt) => fakeToken(key, attempt),
  fileName: (key, original) => fakeFileName(key, original),
};

/**
 * Bir hücrenin yeni değeri. `key` satırın anahtar kolonunun değeri; JSON ve
 * serbest metin için kolon adı da eklenir ki aynı satırın iki kolonu aynı
 * sahte değerleri üretmesin.
 */
export function computeMaskedValue(
  column: string,
  columnRule: ComputedColumnRule,
  key: string,
  original: string,
  attempt = 0,
): string {
  switch (columnRule.strategy) {
    case "fake":
      return FAKERS[columnRule.fake](key, original, attempt);
    case "json":
      return JSON.stringify(
        scrubJson(JSON.parse(original), `${key}:${column}`),
      );
    case "freeText":
      return scrubFreeText(original, `${key}:${column}`);
  }
}

/** Disable/enable edilecek kullanıcı tetikleyicileri için dokunulan tablolar. */
export function catalogTableNames(
  catalog: readonly MaskRule[] = UAT_MASKING_CATALOG,
): string[] {
  return [...new Set(catalog.map((rule) => rule.table))];
}

export interface VerificationQuery {
  name: string;
  /** Tek satır, `n` kolonu: ihlal sayısı. Sıfır olmalı. */
  sql: string;
}

const escapeRegex = (value: string) => value.replace(/[.+]/g, "\\$&");

/**
 * Maskeleme sonrası doğrulama — katalogdan TÜRER (ikinci bir kural listesi
 * yok): silinen tablo boş, NULL kolon boş, sahte e-posta kolonu yalnız
 * `@uat.invalid` (sistem satırları hariç), sahte telefon yalnız `+90500…`.
 * Ek olarak dokunulan tablolarda kapalı kalmış tetikleyici olmamalı.
 */
export function buildVerificationQueries(
  catalog: readonly MaskRule[] = UAT_MASKING_CATALOG,
): VerificationQuery[] {
  const queries: VerificationQuery[] = [];
  for (const rule of catalog) {
    const table = quoteIdent(rule.table);
    if (rule.action === "deleteRows") {
      queries.push({
        name: `${rule.table}: rows left`,
        sql: `SELECT count(*)::int AS n FROM ${table}`,
      });
      continue;
    }
    for (const [column, columnRule] of Object.entries(rule.columns)) {
      const col = quoteIdent(column);
      const base = `SELECT count(*)::int AS n FROM ${table} WHERE ${col} IS NOT NULL${keepClause(rule)}`;
      if (columnRule.strategy === "null") {
        queries.push({ name: `${rule.table}.${column}: not null`, sql: base });
      } else if (
        columnRule.strategy === "fake" &&
        columnRule.fake === "email"
      ) {
        queries.push({
          name: `${rule.table}.${column}: address outside ${UAT_MASK_EMAIL_DOMAIN}`,
          sql: `${base} AND ${col} !~* '@${escapeRegex(UAT_MASK_EMAIL_DOMAIN)}$'`,
        });
      } else if (
        columnRule.strategy === "fake" &&
        columnRule.fake === "phone"
      ) {
        queries.push({
          name: `${rule.table}.${column}: phone outside ${UAT_MASK_PHONE_PREFIX}`,
          sql: `${base} AND ${col} !~ '^${escapeRegex(UAT_MASK_PHONE_PREFIX)}[0-9]{7}$'`,
        });
      }
    }
  }
  const tables = catalogTableNames(catalog)
    .map((name) => `'${name}'`)
    .join(", ");
  queries.push({
    name: "user triggers left disabled",
    sql:
      `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid` +
      ` WHERE NOT t.tgisinternal AND t.tgenabled = 'D'` +
      ` AND c.relnamespace = 'public'::regnamespace AND c.relname IN (${tables})`,
  });
  return queries;
}

/**
 * Dokunulan tablolardaki AÇIK kullanıcı tetikleyicileri (adıyla). Adlar
 * `::text`'e çevrilir: Prisma ham sorgusu Postgres'in `name` tipini okuyamaz.
 */
export function buildEnabledTriggersSql(
  catalog: readonly MaskRule[] = UAT_MASKING_CATALOG,
): string {
  const tables = catalogTableNames(catalog)
    .map((name) => `'${name}'`)
    .join(", ");
  return (
    `SELECT c.relname::text AS "table", t.tgname::text AS "trigger" FROM pg_trigger t` +
    ` JOIN pg_class c ON c.oid = t.tgrelid` +
    ` WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'` +
    ` AND c.relnamespace = 'public'::regnamespace AND c.relname IN (${tables})` +
    ` ORDER BY 1, 2`
  );
}

export function buildTriggerToggleSql(
  table: string,
  trigger: string,
  enable: boolean,
): string {
  return `ALTER TABLE ${quoteIdent(table)} ${enable ? "ENABLE" : "DISABLE"} TRIGGER ${quoteIdent(trigger)}`;
}
