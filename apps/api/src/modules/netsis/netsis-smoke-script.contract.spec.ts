import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../common/helpers/app-root";
import { NETSIS_SLIP_BY_TRACKING_KEY_SQL } from "./helpers/netsis.constants";

/**
 * `scripts/netsis-smoke.mjs` düz Node'dur, TypeScript sabitini içe aktaramaz:
 * fiş arama sorgusunun kopyasını taşır. Bu sözleşme kopyayı tek kaynağa
 * kilitler — smoke script'in doğruladığı sorgu, sağlayıcının koştuğu sorgu
 * olmalı.
 */
describe("netsis-smoke.mjs ↔ NETSIS_SLIP_BY_TRACKING_KEY_SQL", () => {
  const script = readFileSync(
    join(apiAppRoot(), "scripts", "netsis-smoke.mjs"),
    "utf8",
  );

  it("carries the same slip lookup SQL as the API", () => {
    expect(script).toContain(JSON.stringify(NETSIS_SLIP_BY_TRACKING_KEY_SQL));
  });

  it("binds the key the way bindNetsisQueryParams does (N'…' literal)", () => {
    expect(script).toContain(`"@trackingKey"`);
    expect(script).toContain("`N'${ettn}'`");
  });

  it("stays read-only: the lookup goes through Queries, nothing is written", () => {
    expect(script).toMatch(/call\("POST", "Queries"/);
    expect(script).not.toMatch(/call\("(PUT|DELETE)"/);
  });
});
