type JsonRecord = Record<string, unknown>;

function asList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as JsonRecord;
  for (const key of ["data", "products", "items", "results"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

async function getJson(baseUrl: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function assertEmpty(baseUrl: string, path: string): Promise<void> {
  const payload = await getJson(baseUrl, path);
  const items = asList(payload);
  if (items.length !== 0) {
    throw new Error(`${path} is not empty (${items.length} records)`);
  }
}

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "production") {
    throw new Error(
      "Empty production verification requires APP_ENV=production",
    );
  }

  const port = process.env.PORT?.trim() || "3001";
  const baseUrl =
    process.env.PRODUCTION_EMPTY_SMOKE_BASE_URL?.replace(/\/+$/, "") ||
    `http://127.0.0.1:${port}/api`;

  const readiness = (await getJson(baseUrl, "/health/ready")) as JsonRecord;
  if (readiness.status !== "ready") {
    throw new Error("API readiness did not report ready");
  }

  await assertEmpty(baseUrl, "/categories");
  await assertEmpty(baseUrl, "/manufacturers");
  await assertEmpty(baseUrl, "/ads/active?position=header&device=desktop");
  await assertEmpty(baseUrl, "/products?page=1&limit=1");
  await assertEmpty(baseUrl, "/search/products?page=1&pageSize=1");

  console.log("Production API is ready and public catalog is empty.");
}

main().catch((error) => {
  console.error("Empty production verification failed.", error);
  process.exitCode = 1;
});
