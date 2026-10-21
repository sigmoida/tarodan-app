import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../../common/helpers/app-root";

/**
 * Migration contract: the (user_id, created_at) index of `security_logs`
 * lands on live data. It must add that one index and nothing else: no data
 * change, no drop, no other table. The name is Prisma's default for
 * `@@index([userId, createdAt])`, so the schema and the database agree and
 * `prisma migrate diff` stays empty.
 */
describe("security logs (user_id, created_at) index migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20261021190000_security_logs_user_created_at_index/migration.sql",
    ),
    "utf8",
  );
  /** Statements without `--` comments, so prose cannot satisfy an assertion. */
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  it("only creates the one index", () => {
    expect(statements).toEqual([
      'CREATE INDEX IF NOT EXISTS "security_logs_user_id_created_at_idx" ON "security_logs" ("user_id", "created_at")',
    ]);
  });

  it("matches the schema index of SecurityLog", () => {
    const schema = readFileSync(
      join(apiAppRoot(), "prisma/schema.prisma"),
      "utf8",
    );
    const model = schema.match(/model SecurityLog \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toContain('@@map("security_logs")');
    expect(model).toMatch(/@@index\(\[userId, createdAt\]\)/);
    expect(model).toMatch(/userId\s+String\?\s+@map\("user_id"\)/);
    expect(model).toMatch(/createdAt\s+DateTime[^\n]*@map\("created_at"\)/);
  });
});
