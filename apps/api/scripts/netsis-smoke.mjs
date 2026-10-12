#!/usr/bin/env node

/**
 * Read-only Logo Netsis (NetOpenX REST) diagnostics + model dump.
 *
 * Usage from apps/api:
 *   pnpm smoke:netsis
 *   pnpm smoke:netsis -- --read-only          (the default; the only mode)
 *   pnpm smoke:netsis -- --out /some/dir      (default: scripts/netsis-definitions/)
 *   pnpm smoke:netsis -- --ettn <invoice ETTN> (also run the slip lookup)
 *
 * Steps: public Ping + Version + CompanyList, token, authenticated ping, then
 * GET definitions/<R> and services/<R> for every resource the client models,
 * plus services/describe. Every JSON lands in the output directory
 * (gitignored) so the guessed models in src/modules/netsis/helpers/
 * netsis.types.ts can be pinned. The token is revoked at the end so the
 * licence seat is released.
 *
 * Slip lookup: the invoicing provider finds a slip it created by our ETTN
 * (written to EKACK1) before creating one, so a retry after a lost response
 * never opens a second sales invoice. The script prints that read-only SELECT
 * and, with --ettn, runs it through Queries — the way to check the guessed
 * table/column names (TBLFATUIRS, FATIRS_NO, FTIRSIP, EKACK1).
 *
 * Never creates, updates or deletes anything in Netsis. Reads the same
 * NETSIS_* variables (and defaults) as src/config/netsis.ts — keep the two in
 * step. Secrets and the token are redacted from everything printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RESOURCES = [
  "ARPs",
  "Items",
  "ItemSlips",
  "EDocument",
  "MixedReceiptsMain",
  "BankRemittanceTransfer",
];

/**
 * Mirror of NETSIS_SLIP_BY_TRACKING_KEY_SQL (src/modules/netsis/helpers/
 * netsis.constants.ts) — Node cannot import the TypeScript constant, so
 * netsis-smoke-script.contract.spec.ts pins this copy to it.
 */
const SLIP_BY_TRACKING_KEY_SQL =
  "SELECT FATIRS_NO, FTIRSIP FROM TBLFATUIRS WHERE EKACK1 = @trackingKey ORDER BY FATIRS_NO";
/** ETTN shape only (UUID characters), so the literal needs no escaping. */
const ETTN_PATTERN = /^[0-9A-Za-z-]{1,64}$/;

const args = process.argv.slice(2).filter((argument) => argument !== "--");
let outDir = fileURLToPath(new URL("./netsis-definitions/", import.meta.url));
let ettn = null;
for (let index = 0; index < args.length; index++) {
  const argument = args[index];
  if (argument === "--read-only") continue;
  if (argument === "--out" && args[index + 1]) {
    outDir = args[++index];
    continue;
  }
  if (argument === "--ettn" && args[index + 1]) {
    ettn = args[++index].trim();
    if (!ETTN_PATTERN.test(ettn)) {
      console.error("--ettn must be an ETTN (letters, digits and dashes).");
      process.exit(2);
    }
    continue;
  }
  console.error(
    `Unknown argument '${argument}'. This script is read-only and accepts only --read-only, --out <dir> and --ettn <ettn>.`,
  );
  process.exit(2);
}

const config = {
  baseUrl: (process.env.NETSIS_BASE_URL ?? "").trim().replace(/\/+$/, ""),
  username: process.env.NETSIS_USERNAME ?? "",
  password: process.env.NETSIS_PASSWORD ?? "",
  dbName: process.env.NETSIS_DB_NAME ?? "",
  dbUser: process.env.NETSIS_DB_USER ?? "",
  dbPassword: process.env.NETSIS_DB_PASSWORD ?? "",
  dbType: process.env.NETSIS_DB_TYPE?.trim() || "vtMSSQL",
  branchCode: process.env.NETSIS_BRANCH_CODE?.trim() || "0",
  timeoutMs:
    Number(process.env.NETSIS_TIMEOUT_MS) > 0
      ? Number(process.env.NETSIS_TIMEOUT_MS)
      : 15000,
};

const secrets = new Set([config.password, config.dbPassword].filter(Boolean));

function redact(text) {
  let result = String(text);
  for (const secret of secrets) {
    if (secret.length >= 3) result = result.split(secret).join("***");
  }
  return result;
}

function mask(value) {
  if (!value) return "not-configured";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

async function call(method, path, { token, form, json } = {}) {
  const url = `${config.baseUrl}/api/v2/${path}`;
  const headers = { Accept: "application/json" };
  let body;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

function preview(result) {
  return redact(result.text.replace(/\s+/g, " ").trim().slice(0, 300));
}

function save(name, result) {
  const file = join(outDir, name);
  const content =
    result.json !== null ? JSON.stringify(result.json, null, 2) : result.text;
  writeFileSync(file, redact(content), { mode: 0o600 });
  return file;
}

/** `showBody: false` for responses that carry the token. */
async function step(label, fn, { showBody = true } = {}) {
  try {
    const result = await fn();
    const ok = result.status < 400;
    const body = showBody || !ok ? preview(result) : "(body hidden)";
    console.log(`${ok ? "OK  " : "FAIL"} ${label} [${result.status}] ${body}`);
    return result;
  } catch (error) {
    console.log(
      `FAIL ${label} [network] ${redact(error?.cause?.code ?? error?.name ?? error)}`,
    );
    return null;
  }
}

async function main() {
  if (!config.baseUrl) {
    console.error("NETSIS_BASE_URL is required");
    process.exit(2);
  }
  if (!config.baseUrl.startsWith("https://")) {
    console.warn(
      "WARNING: NETSIS_BASE_URL is not HTTPS — credentials travel in the token request.",
    );
  }

  console.log("=== CONFIG ===");
  console.log(`Base URL:  ${config.baseUrl}`);
  console.log(`User:      ${mask(config.username)}`);
  console.log(
    `Database:  ${config.dbName || "not-configured"} (${config.dbType}, branch ${config.branchCode})`,
  );
  console.log(`DB user:   ${mask(config.dbUser)}`);
  console.log(`Output:    ${outDir}`);
  mkdirSync(outDir, { recursive: true });

  console.log("\n=== PUBLIC (no licence seat) ===");
  await step("GET public/Ping", () => call("GET", "public/Ping"));
  const version = await step("GET public/Version", () =>
    call("GET", "public/Version"),
  );
  if (version) save("public-version.json", version);
  const companies = await step("GET public/CompanyList", () =>
    call("GET", "public/CompanyList"),
  );
  if (companies) save("public-company-list.json", companies);
  if (config.username && config.dbName) {
    const branches = await step("GET public/AuthorizedBranches", () =>
      call(
        "GET",
        `public/AuthorizedBranches?company=${encodeURIComponent(config.dbName)}&username=${encodeURIComponent(config.username)}`,
      ),
    );
    if (branches) save("public-authorized-branches.json", branches);
  }

  if (!config.username || !config.password || !config.dbName) {
    console.log(
      "\nNETSIS_USERNAME / NETSIS_PASSWORD / NETSIS_DB_NAME missing — stopping before the token.",
    );
    return;
  }

  console.log("\n=== TOKEN (one licence seat while this runs) ===");
  const tokenResult = await step(
    "POST token",
    () =>
      call("POST", "token", {
        form: {
          grant_type: "password",
          username: config.username,
          password: config.password,
          dbname: config.dbName,
          dbuser: config.dbUser,
          dbpassword: config.dbPassword,
          dbtype: config.dbType,
          branchcode: config.branchCode,
        },
      }),
    { showBody: false },
  );
  const token = tokenResult?.json?.access_token;
  if (!token) {
    console.log(
      "No access_token in the response — check the token body (see docs/NETSIS.md).",
    );
    return;
  }
  secrets.add(token);
  console.log(
    `Token: type=${tokenResult.json.token_type ?? "?"} expires_in=${tokenResult.json.expires_in ?? "?"} keys=${Object.keys(tokenResult.json).join(",")}`,
  );

  try {
    await step("GET ping (authenticated)", () =>
      call("GET", "ping", { token }),
    );

    console.log("\n=== MODEL DEFINITIONS ===");
    for (const resource of RESOURCES) {
      const definition = await step(`GET definitions/${resource}`, () =>
        call("GET", `definitions/${resource}`, { token }),
      );
      if (definition) save(`${resource}.definition.json`, definition);
      const services = await step(`GET services/${resource}`, () =>
        call("GET", `services/${resource}`, { token }),
      );
      if (services) save(`${resource}.services.json`, services);
    }
    const describe = await step("GET services/describe", () =>
      call("GET", "services/describe", { token }),
    );
    if (describe) save("services-describe.json", describe);

    console.log("\n=== SLIP LOOKUP BY TRACKING KEY (read-only) ===");
    console.log(`SQL: ${SLIP_BY_TRACKING_KEY_SQL}`);
    if (!ettn) {
      console.log("Pass --ettn <invoice ETTN> to run it against Netsis.");
    } else {
      // VERIFY: Queries body `{ Query }`. Same binding as the API: N'…'.
      const query = SLIP_BY_TRACKING_KEY_SQL.replace(
        "@trackingKey",
        `N'${ettn}'`,
      );
      const lookup = await step(`POST Queries (EKACK1 = ${ettn})`, () =>
        call("POST", "Queries", { token, json: { Query: query } }),
      );
      if (lookup) {
        save("slip-by-tracking-key.json", lookup);
        const rows = lookup.json?.Data ?? lookup.json;
        console.log(
          Array.isArray(rows)
            ? `Rows: ${rows.length}${rows.length > 1 ? " — more than one slip carries this ETTN (duplicate)" : ""}`
            : "Rows: unexpected response shape (see the saved file)",
        );
      }
    }
  } finally {
    await step("GET revoke", () => call("GET", "revoke", { token }));
    console.log("\nDone. Nothing was written to Netsis.");
  }
}

main().catch((error) => {
  console.error(redact(error?.stack ?? error));
  process.exit(1);
});
