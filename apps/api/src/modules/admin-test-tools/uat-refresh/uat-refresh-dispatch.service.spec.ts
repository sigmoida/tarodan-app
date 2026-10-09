import { UatRefreshDispatchService } from "./uat-refresh-dispatch.service";

/**
 * GitHub workflow_dispatch çağrısı: doğru uç, ref ve girdiler; token yalnız
 * Authorization başlığında, hiçbir hata metninde değil.
 */
describe("UatRefreshDispatchService", () => {
  const config = {
    token: "github_pat_SECRET",
    repo: "sigmoida/tarodan-app",
    ref: "development",
  };
  const inputs = { runId: "run-1", reportToken: "report-token", dryRun: true };
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockFetch = (impl: () => Promise<unknown>) => {
    const fn = jest.fn(impl);
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  it("posts the dispatch for staging-refresh-from-prod.yml with string inputs", async () => {
    const fetchMock = mockFetch(async () => ({ ok: true, status: 204 }));
    const result = await new UatRefreshDispatchService().dispatch(
      config,
      inputs,
    );
    expect(result).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe(
      "https://api.github.com/repos/sigmoida/tarodan-app/actions/workflows/staging-refresh-from-prod.yml/dispatches",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer github_pat_SECRET");
    expect(JSON.parse(String(init.body))).toEqual({
      ref: "development",
      inputs: {
        run_id: "run-1",
        report_token: "report-token",
        dry_run: "true",
        confirm: "STAGING",
      },
    });
  });

  it("reports a 4xx as a DEFINITE refusal without leaking the token", async () => {
    mockFetch(async () => ({ ok: false, status: 404 }));
    const result = await new UatRefreshDispatchService().dispatch(config, {
      ...inputs,
      dryRun: false,
    });
    expect(result).toEqual({
      ok: false,
      definite: true,
      error: "GitHub workflow dispatch failed: HTTP 404",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("reports a 5xx as ambiguous (GitHub may still have accepted it)", async () => {
    mockFetch(async () => ({ ok: false, status: 502 }));
    const result = await new UatRefreshDispatchService().dispatch(
      config,
      inputs,
    );
    expect(result).toEqual({
      ok: false,
      definite: false,
      error: "GitHub workflow dispatch failed: HTTP 502",
    });
  });

  it("reports a network failure / timeout as ambiguous, by error name only", async () => {
    mockFetch(async () => {
      const error = new Error("connect ECONNREFUSED github_pat_SECRET");
      error.name = "TimeoutError";
      throw error;
    });
    const result = await new UatRefreshDispatchService().dispatch(
      config,
      inputs,
    );
    expect(result).toEqual({
      ok: false,
      definite: false,
      error: "GitHub workflow dispatch failed: TimeoutError",
    });
  });

  it("reads its configuration from the env accessor", () => {
    const saved = { ...process.env };
    process.env.GITHUB_DISPATCH_TOKEN = "t";
    process.env.GITHUB_DISPATCH_REPO = "o/r";
    delete process.env.GITHUB_DISPATCH_REF;
    try {
      expect(new UatRefreshDispatchService().config()).toEqual({
        token: "t",
        repo: "o/r",
        ref: "development",
      });
      delete process.env.GITHUB_DISPATCH_TOKEN;
      expect(new UatRefreshDispatchService().config()).toBeNull();
    } finally {
      process.env = saved;
    }
  });
});
