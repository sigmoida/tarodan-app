import { readFileSync } from "fs";
import { join } from "path";
import { apiAppRoot } from "../app-root";
import {
  ORIGINAL_DEPENDENT_FAKES,
  UAT_MASKING_CATALOG,
  UAT_MASK_ALLOW_LIST,
  isCoveredByCatalog,
} from "./masking-catalog";

/**
 * Maskeleme kataloğu ↔ schema.prisma sözleşmesi.
 *
 * Asıl guard: adı kişisel veri söyleyen ya da tipi JSON olan HER kolonun ya
 * katalogda bir kuralı ya da gerekçeli izin listesinde bir satırı olmalı. Yeni
 * bir `secondaryPhone` / `metadata Json` kolonu eklenip katalog unutulursa bu
 * spec kırmızıdır — staging'e production'dan maskelenmemiş veri taşınamaz.
 *
 * Ters yön de denetlenir: katalogdaki her tablo/kolon şemada vardır (yeniden
 * adlandırma kuralı sessizce boşa düşürmesin), izin listesi bayatlamaz.
 */

interface SchemaColumn {
  model: string;
  field: string;
  table: string;
  column: string;
  type: string;
  optional: boolean;
}

/** schema.prisma → tablo/kolon listesi (ilişki alanları hariç). */
function parseSchemaColumns(source: string): SchemaColumn[] {
  const modelBlocks = [...source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  const modelNames = new Set(modelBlocks.map(([, name]) => name));
  const columns: SchemaColumn[] = [];
  for (const [, model, body] of modelBlocks) {
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model;
    for (const line of body.split("\n")) {
      const match = /^\s+(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line);
      if (!match) continue;
      const [, field, type, , optional, rest] = match;
      if (modelNames.has(type)) continue; // ilişki alanı, kolon değil
      columns.push({
        model,
        field,
        table,
        column: /@map\("([^"]+)"\)/.exec(rest)?.[1] ?? field,
        type,
        optional: Boolean(optional),
      });
    }
  }
  return columns;
}

/**
 * Kişisel veri kalıbı Prisma alan adına uygulanır. `ip` yalnız camelCase bir
 * SÖZCÜK olarak sayılır (`ipAddress`, `lastLoginIp`) — `description`,
 * `shipping`, `membershipId` içindeki harf dizisi sayılmaz.
 */
const PERSONAL_FIELD_PATTERN =
  /email|phone|iban|nationalId|tckn|address|fullName|firstName|lastName|birthDate|password|secret|token/i;
const IP_WORD_PATTERN = /(^ip|Ip)(?=[A-Z]|$)/;

const isPersonalOrJson = (column: SchemaColumn): boolean =>
  column.type === "Json" ||
  PERSONAL_FIELD_PATTERN.test(column.field) ||
  IP_WORD_PATTERN.test(column.field);

describe("UAT masking catalogue ↔ schema.prisma", () => {
  const columns = parseSchemaColumns(
    readFileSync(join(apiAppRoot(), "prisma", "schema.prisma"), "utf8"),
  );
  const byTable = new Map<string, SchemaColumn[]>();
  for (const column of columns) {
    byTable.set(column.table, [...(byTable.get(column.table) ?? []), column]);
  }
  const find = (table: string, column: string) =>
    byTable.get(table)?.find((c) => c.column === column);

  it("parses the schema (self-check: the guard is actually looking)", () => {
    expect(byTable.size).toBeGreaterThan(100);
    expect(find("users", "email")?.type).toBe("String");
    expect(find("orders", "shipping_address")?.type).toBe("Json");
    expect(isPersonalOrJson(find("users", "email")!)).toBe(true);
    expect(isPersonalOrJson(find("admin_users", "last_login_ip")!)).toBe(true);
    expect(isPersonalOrJson(find("products", "description")!)).toBe(false);
    expect(
      isPersonalOrJson(find("trade_shipments", "recipient_user_id")!),
    ).toBe(false);
  });

  it("every personal-looking or JSON column is masked or explicitly allowed", () => {
    const uncovered = columns
      .filter(isPersonalOrJson)
      .filter(
        (c) =>
          !isCoveredByCatalog(c.table, c.column) &&
          !(`${c.table}.${c.column}` in UAT_MASK_ALLOW_LIST),
      )
      .map((c) => `${c.table}.${c.column} (${c.model}.${c.field})`);
    expect(uncovered).toEqual([]);
  });

  it("every catalogued table and column exists in the schema", () => {
    const missing: string[] = [];
    for (const rule of UAT_MASKING_CATALOG) {
      if (!byTable.has(rule.table)) {
        missing.push(rule.table);
        continue;
      }
      if (rule.action === "deleteRows") continue;
      const keys = [
        rule.keyColumn,
        ...Object.values(rule.columns).map((c) =>
          "key" in c ? c.key : undefined,
        ),
      ].filter((key): key is string => Boolean(key));
      for (const column of [...Object.keys(rule.columns), ...keys]) {
        if (!find(rule.table, column)) missing.push(`${rule.table}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("tables with computed rules page by a text `id` primary key", () => {
    for (const rule of UAT_MASKING_CATALOG) {
      if (rule.action !== "mask") continue;
      const computed = Object.values(rule.columns).some(
        (c) => c.strategy !== "null" && c.strategy !== "constant",
      );
      if (!computed) continue;
      expect([rule.table, find(rule.table, "id")?.type]).toEqual([
        rule.table,
        "String",
      ]);
    }
  });

  it("only nullable columns are set to NULL", () => {
    const notNullable: string[] = [];
    for (const rule of UAT_MASKING_CATALOG) {
      if (rule.action !== "mask") continue;
      for (const [column, columnRule] of Object.entries(rule.columns)) {
        if (
          columnRule.strategy === "null" &&
          !find(rule.table, column)?.optional
        ) {
          notNullable.push(`${rule.table}.${column}`);
        }
      }
    }
    expect(notNullable).toEqual([]);
  });

  it("JSON scrubbing targets JSON columns only, fakes target text/date columns", () => {
    for (const rule of UAT_MASKING_CATALOG) {
      if (rule.action !== "mask") continue;
      for (const [column, columnRule] of Object.entries(rule.columns)) {
        const type = find(rule.table, column)?.type;
        if (columnRule.strategy === "json") {
          expect(`${rule.table}.${column}:${type}`).toBe(
            `${rule.table}.${column}:Json`,
          );
        }
        if (
          columnRule.strategy === "fake" ||
          columnRule.strategy === "freeText"
        ) {
          const expected =
            columnRule.strategy === "fake" && columnRule.fake === "birthDate"
              ? "DateTime"
              : "String";
          expect(`${rule.table}.${column}:${type}`).toBe(
            `${rule.table}.${column}:${expected}`,
          );
        }
      }
    }
  });

  it("unique columns use fakes that do not read the original value", () => {
    for (const rule of UAT_MASKING_CATALOG) {
      if (rule.action !== "mask") continue;
      for (const [column, columnRule] of Object.entries(rule.columns)) {
        if (columnRule.strategy === "fake" && columnRule.unique) {
          expect([
            column,
            ORIGINAL_DEPENDENT_FAKES.includes(columnRule.fake),
          ]).toEqual([column, false]);
        }
      }
    }
  });

  it("the allow-list is not stale and every entry gives a reason", () => {
    for (const [entry, reason] of Object.entries(UAT_MASK_ALLOW_LIST)) {
      const [table, column] = entry.split(".");
      expect([entry, Boolean(find(table, column))]).toEqual([entry, true]);
      expect([entry, isCoveredByCatalog(table, column)]).toEqual([
        entry,
        false,
      ]);
      expect(reason.trim().length).toBeGreaterThan(5);
    }
  });

  it("every rule says why it exists", () => {
    for (const rule of UAT_MASKING_CATALOG) {
      expect([rule.table, rule.reason.trim().length > 5]).toEqual([
        rule.table,
        true,
      ]);
    }
  });

  it("deletes the secrets the owner listed and wipes every password hash", () => {
    const deleted = UAT_MASKING_CATALOG.filter(
      (rule) => rule.action === "deleteRows",
    ).map((rule) => rule.table);
    expect(deleted).toEqual(
      expect.arrayContaining([
        "oauth_accounts",
        "two_factor_secrets",
        "password_reset_tokens",
        "email_verification_tokens",
        "phone_verification_tokens",
        "refresh_tokens",
        "admin_sessions",
        "mail_sender_accounts",
        "push_tokens",
        "saved_cards",
      ]),
    );
    const passwordRule = UAT_MASKING_CATALOG.find(
      (rule) =>
        rule.action === "mask" &&
        rule.table === "users" &&
        "password_hash" in rule.columns,
    );
    expect(passwordRule).toMatchObject({
      columns: { password_hash: { strategy: "null" } },
    });
    // Sistem satırı istisnası şifreyi kapsamaz.
    expect(
      passwordRule && "keepWhere" in passwordRule && passwordRule.keepWhere,
    ).toBeFalsy();
  });

  it("clears the sender-account link before deleting the sender accounts (FK RESTRICT)", () => {
    const tables = UAT_MASKING_CATALOG.map((rule) => rule.table);
    expect(tables.indexOf("mail_area_settings")).toBeLessThan(
      tables.indexOf("mail_sender_accounts"),
    );
  });
});
