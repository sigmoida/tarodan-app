import { MaskColumnsRule, UAT_MASKING_CATALOG } from "./masking-catalog";
import {
  UAT_MASK_TEMP_PREFIX,
  buildBatchUpdateSql,
  buildDeleteSql,
  buildEnabledTriggersSql,
  buildSampleSql,
  buildSelectBatchSql,
  buildSetSql,
  buildTempUniqueSql,
  buildTriggerToggleSql,
  buildVerificationQueries,
  computeMaskedCell,
  keyColumnOf,
  planMaskRule,
  quoteIdent,
  scrubbedColumns,
} from "./masking-sql";
import { fakeFullName } from "./masking-fakes";

const maskRule = (
  table: string,
  predicate?: (r: MaskColumnsRule) => boolean,
) => {
  const rule = UAT_MASKING_CATALOG.find(
    (r): r is MaskColumnsRule =>
      r.action === "mask" && r.table === table && (!predicate || predicate(r)),
  );
  if (!rule) throw new Error(`no mask rule for ${table}`);
  return rule;
};

describe("UAT masking SQL", () => {
  // users: kimlik kuralı (yalnız gerçek sistem hesapları korunur) ve
  // e-posta/ad kuralı (sistem hesapları + silinmiş hesabın sentinel'i korunur).
  const usersIdentity = maskRule("users", (r) => "username" in r.columns);
  const usersContact = maskRule("users", (r) => "email" in r.columns);

  it("refuses identifiers that are not plain snake_case", () => {
    expect(quoteIdent("users")).toBe('"users"');
    expect(() => quoteIdent('users"; DROP TABLE x; --')).toThrow(/Unsafe/);
    expect(() => quoteIdent("Users")).toThrow(/Unsafe/);
  });

  it("deletes whole tables", () => {
    expect(buildDeleteSql("refresh_tokens")).toBe(
      'DELETE FROM "refresh_tokens"',
    );
  });

  it("splits a rule into set-based, computed and unique columns", () => {
    const plan = planMaskRule(usersIdentity);
    expect(plan.setColumns).toEqual([]);
    expect(plan.uniqueColumns).toEqual([
      "phone",
      "username",
      "national_id",
      "company_name",
    ]);
    expect(plan.computedColumns.map(([c]) => c)).toEqual(
      expect.arrayContaining(["birth_date", "bio"]),
    );
    expect(planMaskRule(usersContact).uniqueColumns).toEqual(["email"]);
  });

  it("writes NULL/constant columns in one UPDATE", () => {
    expect(buildSetSql(maskRule("mail_area_settings"))).toBe(
      `UPDATE "mail_area_settings" SET "sender_account_id" = NULL, "reply_to" = NULL, "internal_recipients" = '[]'::jsonb WHERE TRUE`,
    );
    expect(buildSetSql(usersIdentity)).toBeNull();
  });

  it("keeps only the genuine system accounts out of identity masking (deleted accounts are masked)", () => {
    for (const sql of [
      buildSelectBatchSql(usersIdentity),
      buildTempUniqueSql(usersIdentity, "username"),
    ]) {
      expect(sql).toContain(
        `AND NOT ("email" IN ('platform@tarodan.com', 'guest@tarodan.system'))`,
      );
      expect(sql).not.toContain("deleted");
    }
  });

  it("keeps a deleted account's e-mail/name only while both carry the anonymized sentinel", () => {
    const sql = buildSelectBatchSql(usersContact);
    expect(sql).toContain(`"email" ~* '^deleted_.+@deleted\\.local$'`);
    expect(sql).toContain(`AND "display_name" = 'Silinmiş Kullanıcı'`);
  });

  it("parks unique columns on a per-row temporary value first", () => {
    expect(buildTempUniqueSql(usersContact, "email")).toMatch(
      new RegExp(
        `^UPDATE "users" SET "email" = '${UAT_MASK_TEMP_PREFIX}' \\|\\| ctid::text WHERE "email" IS NOT NULL`,
      ),
    );
  });

  it("pages by primary key (keyset) and selects the key columns", () => {
    const addresses = maskRule("addresses", (r) => "full_name" in r.columns);
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
    expect(
      buildBatchUpdateSql(
        usersContact,
        "email",
        usersContact.columns.email as never,
      ),
    ).toBe(
      `UPDATE "users" AS t SET "email" = v.val FROM unnest($1::text[], $2::text[]) AS v(id, val) WHERE t."id" = v.id`,
    );
    expect(
      buildBatchUpdateSql(
        usersIdentity,
        "birth_date",
        usersIdentity.columns.birth_date as never,
      ),
    ).toContain('"birth_date" = v.val::timestamp(3)');
    const orders = maskRule("orders");
    expect(
      buildBatchUpdateSql(
        orders,
        "shipping_address",
        orders.columns.shipping_address as never,
      ),
    ).toContain('"shipping_address" = v.val::jsonb');
  });

  describe("computeMaskedCell", () => {
    const shipping = maskRule("orders").columns.shipping_address as never;

    it("computes values from the key, not from the original", () => {
      const rule = usersContact.columns.display_name as never;
      expect(
        computeMaskedCell("display_name", rule, "user-1", "Gerçek Ad"),
      ).toEqual({ value: fakeFullName("user-1"), changed: true });
      const cell = computeMaskedCell(
        "shipping_address",
        shipping,
        "order-1",
        JSON.stringify({ fullName: "Gerçek Ad", city: "Ankara" }),
      );
      expect(cell.changed).toBe(true);
      expect(JSON.parse(cell.value)).toEqual({
        fullName: expect.not.stringMatching("Gerçek"),
        city: "Ankara",
      });
    });

    it("does not rewrite a JSON cell that holds nothing personal, whatever its text format", () => {
      // jsonb::text spacing differs from JSON.stringify; still unchanged.
      expect(
        computeMaskedCell(
          "shipping_address",
          shipping,
          "order-1",
          '{"city": "Ankara", "amount": 10.50}',
        ).changed,
      ).toBe(false);
    });

    it("is a fixed point on its own output (idempotent run, verification sample)", () => {
      const first = computeMaskedCell(
        "shipping_address",
        shipping,
        "order-1",
        '{"fullName": "Gerçek Ad", "phone": "0532 123 45 67", "note": "a@b.co"}',
      );
      expect(
        computeMaskedCell("shipping_address", shipping, "order-1", first.value),
      ).toEqual({ value: first.value, changed: false });
    });

    it("keeps integers above 2^53 and decimal scale exact when a cell is rewritten", () => {
      const cell = computeMaskedCell(
        "shipping_address",
        shipping,
        "order-1",
        '{"fullName": "Gerçek Ad", "providerRef": 9007199254740993123, "amount": 10.50}',
      );
      expect(cell.changed).toBe(true);
      expect(cell.value).toContain('"providerRef":9007199254740993123');
      expect(cell.value).toContain('"amount":10.50');
    });
  });

  it("derives verification from the catalogue", () => {
    const queries = buildVerificationQueries();
    const byName = (prefix: string) =>
      queries.find((q) => q.name.startsWith(prefix));
    expect(byName("users.email")?.sql).toContain(
      `"email" !~* '@uat\\.invalid$'`,
    );
    expect(byName("users.email")?.sql).toContain("Silinmiş Kullanıcı");
    expect(byName("users.password_hash")?.sql).toBe(
      'SELECT count(*)::int AS n FROM "users" WHERE "password_hash" IS NOT NULL',
    );
    expect(byName("users.phone")?.sql).toContain(`!~ '^\\+90500[0-9]{7}$'`);
    expect(byName("users.phone")?.sql).not.toContain("deleted");
    expect(byName("refresh_tokens")?.sql).toBe(
      'SELECT count(*)::int AS n FROM "refresh_tokens"',
    );
    expect(queries[queries.length - 1].sql).toContain("tgenabled = 'D'");
  });

  it("samples every free-text and JSON column for the post-mask leak scan", () => {
    const targets = scrubbedColumns().map((t) => `${t.rule.table}.${t.column}`);
    expect(targets).toEqual(
      expect.arrayContaining([
        "messages.content",
        "ratings.comment",
        "users.bio",
        "orders.shipping_address",
        "audit_logs.new_value",
      ]),
    );
    const ratings = scrubbedColumns().find(
      (t) => t.rule.table === "ratings" && t.column === "comment",
    )!;
    expect(buildSampleSql(ratings)).toBe(
      `SELECT "id"::text AS "id", "id"::text AS "__key_id", "comment"::text AS "comment" FROM "ratings" WHERE "comment" IS NOT NULL ORDER BY random() LIMIT $1`,
    );
  });

  it("toggles user triggers by name on the touched tables only", () => {
    expect(buildEnabledTriggersSql()).toContain("NOT t.tgisinternal");
    // Prisma cannot deserialize Postgres `name` columns: read them as text.
    expect(buildEnabledTriggersSql()).toContain('t.tgname::text AS "trigger"');
    expect(buildEnabledTriggersSql()).toContain("'consent_records'");
    expect(
      buildTriggerToggleSql(
        "ledger_entries",
        "ledger_entries_append_only_guard",
        false,
      ),
    ).toBe(
      'ALTER TABLE "ledger_entries" DISABLE TRIGGER "ledger_entries_append_only_guard"',
    );
    expect(
      buildTriggerToggleSql(
        "ledger_entries",
        "ledger_entries_append_only_guard",
        true,
      ),
    ).toMatch(/ENABLE TRIGGER/);
  });
});
