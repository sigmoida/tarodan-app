import {
  MaskColumnsRule,
  UAT_MASKING_CATALOG,
} from "./masking-catalog";
import {
  UAT_MASK_TEMP_PREFIX,
  buildBatchUpdateSql,
  buildDeleteSql,
  buildEnabledTriggersSql,
  buildSelectBatchSql,
  buildSetSql,
  buildTempUniqueSql,
  buildTriggerToggleSql,
  buildVerificationQueries,
  computeMaskedValue,
  keyColumnOf,
  planMaskRule,
  quoteIdent,
} from "./masking-sql";
import { fakeFullName } from "./masking-fakes";

const maskRule = (table: string, predicate?: (r: MaskColumnsRule) => boolean) => {
  const rule = UAT_MASKING_CATALOG.find(
    (r): r is MaskColumnsRule =>
      r.action === "mask" && r.table === table && (!predicate || predicate(r)),
  );
  if (!rule) throw new Error(`no mask rule for ${table}`);
  return rule;
};

describe("UAT masking SQL", () => {
  const users = maskRule("users", (r) => Boolean(r.keepWhere));

  it("refuses identifiers that are not plain snake_case", () => {
    expect(quoteIdent("users")).toBe('"users"');
    expect(() => quoteIdent('users"; DROP TABLE x; --')).toThrow(/Unsafe/);
    expect(() => quoteIdent("Users")).toThrow(/Unsafe/);
  });

  it("deletes whole tables", () => {
    expect(buildDeleteSql("refresh_tokens")).toBe('DELETE FROM "refresh_tokens"');
  });

  it("splits a rule into set-based, computed and unique columns", () => {
    const plan = planMaskRule(users);
    expect(plan.setColumns).toEqual([]);
    expect(plan.uniqueColumns).toEqual([
      "email",
      "phone",
      "username",
      "national_id",
      "company_name",
    ]);
    expect(plan.computedColumns.map(([c]) => c)).toContain("display_name");
  });

  it("writes NULL/constant columns in one UPDATE", () => {
    expect(buildSetSql(maskRule("mail_area_settings"))).toBe(
      `UPDATE "mail_area_settings" SET "sender_account_id" = NULL, "reply_to" = NULL, "internal_recipients" = '[]'::jsonb WHERE TRUE`,
    );
    expect(buildSetSql(users)).toBeNull();
  });

  it("never touches the kept system rows", () => {
    for (const sql of [
      buildSelectBatchSql(users),
      buildTempUniqueSql(users, "email"),
    ]) {
      expect(sql).toContain("AND NOT (\"email\" IN ('platform@tarodan.com', 'guest@tarodan.system')");
      expect(sql).toContain("deleted\\.local$");
    }
  });

  it("parks unique columns on a per-row temporary value first", () => {
    expect(buildTempUniqueSql(users, "email")).toMatch(
      new RegExp(`^UPDATE "users" SET "email" = '${UAT_MASK_TEMP_PREFIX}' \\|\\| ctid::text WHERE "email" IS NOT NULL`),
    );
  });

  it("pages by primary key (keyset) and selects the key columns", () => {
    const addresses = maskRule("addresses");
    const sql = buildSelectBatchSql(addresses);
    expect(sql).toContain('"user_id"::text AS "__key_user_id"');
    expect(sql).toContain('WHERE "id" > $1');
    expect(sql).toMatch(/ORDER BY "id" LIMIT \$2$/);
    expect(keyColumnOf(addresses, addresses.columns.full_name as never)).toBe(
      "user_id",
    );
    expect(keyColumnOf(addresses, addresses.columns.phone as never)).toBe("id");
    const bank = maskRule("seller_bank_accounts");
    expect(keyColumnOf(bank, bank.columns.iban as never)).toBe("user_id");
  });

  it("writes a page with one set-based UPDATE … FROM unnest per column", () => {
    expect(buildBatchUpdateSql(users, "email", users.columns.email as never)).toBe(
      `UPDATE "users" AS t SET "email" = v.val FROM unnest($1::text[], $2::text[]) AS v(id, val) WHERE t."id" = v.id`,
    );
    expect(
      buildBatchUpdateSql(users, "birth_date", users.columns.birth_date as never),
    ).toContain('"birth_date" = v.val::timestamp(3)');
    const orders = maskRule("orders");
    expect(
      buildBatchUpdateSql(orders, "shipping_address", orders.columns.shipping_address as never),
    ).toContain('"shipping_address" = v.val::jsonb');
  });

  it("computes values from the key, not from the original", () => {
    const rule = users.columns.display_name as never;
    expect(computeMaskedValue("display_name", rule, "user-1", "Gerçek Ad")).toBe(
      fakeFullName("user-1"),
    );
    const json = computeMaskedValue(
      "shipping_address",
      maskRule("orders").columns.shipping_address as never,
      "order-1",
      JSON.stringify({ fullName: "Gerçek Ad", city: "Ankara" }),
    );
    expect(JSON.parse(json)).toEqual({
      fullName: expect.not.stringMatching("Gerçek"),
      city: "Ankara",
    });
  });

  it("derives verification from the catalogue", () => {
    const queries = buildVerificationQueries();
    const byName = (prefix: string) =>
      queries.find((q) => q.name.startsWith(prefix));
    expect(byName("users.email")?.sql).toContain(`"email" !~* '@uat\\.invalid$'`);
    expect(byName("users.email")?.sql).toContain("AND NOT (");
    expect(byName("users.password_hash")?.sql).toBe(
      'SELECT count(*)::int AS n FROM "users" WHERE "password_hash" IS NOT NULL',
    );
    expect(byName("users.phone")?.sql).toContain(`!~ '^\\+90500[0-9]{7}$'`);
    expect(byName("refresh_tokens")?.sql).toBe(
      'SELECT count(*)::int AS n FROM "refresh_tokens"',
    );
    expect(queries[queries.length - 1].sql).toContain("tgenabled = 'D'");
  });

  it("toggles user triggers by name on the touched tables only", () => {
    expect(buildEnabledTriggersSql()).toContain("NOT t.tgisinternal");
    expect(buildEnabledTriggersSql()).toContain("'consent_records'");
    expect(buildTriggerToggleSql("ledger_entries", "ledger_entries_append_only_guard", false)).toBe(
      'ALTER TABLE "ledger_entries" DISABLE TRIGGER "ledger_entries_append_only_guard"',
    );
    expect(buildTriggerToggleSql("ledger_entries", "ledger_entries_append_only_guard", true)).toMatch(
      /ENABLE TRIGGER/,
    );
  });
});
