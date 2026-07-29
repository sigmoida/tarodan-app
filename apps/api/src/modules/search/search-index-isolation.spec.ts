import { SearchCommonService } from "./search-common.service";

function createService(values: Record<string, string | undefined>) {
  const config = {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  };
  return new SearchCommonService(config as any, {} as any, {} as any);
}

describe("SearchCommonService index isolation", () => {
  it("uses APP_ENV to isolate deployed environments", () => {
    const staging = createService({ APP_ENV: "staging" });
    const production = createService({ APP_ENV: "production" });

    expect(staging.productsIndex).toBe("staging-products");
    expect(staging.collectionsIndex).toBe("staging-collections");
    expect(production.productsIndex).toBe("production-products");
    expect(production.collectionsIndex).toBe("production-collections");
  });

  it("keeps legacy index names for local development", () => {
    const local = createService({});

    expect(local.productsIndex).toBe("products");
    expect(local.collectionsIndex).toBe("collections");
  });

  it("supports a sanitized explicit prefix", () => {
    const service = createService({
      APP_ENV: "staging",
      ELASTICSEARCH_INDEX_PREFIX: "Preview One",
    });

    expect(service.productsIndex).toBe("preview-one-products");
    expect(service.collectionsIndex).toBe("preview-one-collections");
  });
});
