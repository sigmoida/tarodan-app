import { Logger } from "@nestjs/common";
import { notifyWebRevalidate, resolveWebRevalidateUrl } from "./revalidate";

describe("resolveWebRevalidateUrl", () => {
  it("appends the revalidate route to a bare origin", () => {
    expect(resolveWebRevalidateUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/api/revalidate",
    );
    expect(resolveWebRevalidateUrl("https://tarodan.com.tr/")).toBe(
      "https://tarodan.com.tr/api/revalidate",
    );
  });

  it("keeps an explicit endpoint path", () => {
    expect(resolveWebRevalidateUrl("http://web:3000/api/revalidate")).toBe(
      "http://web:3000/api/revalidate",
    );
  });

  it("returns null for an unparsable value", () => {
    expect(resolveWebRevalidateUrl("not a url")).toBeNull();
  });
});

describe("notifyWebRevalidate", () => {
  const env = { ...process.env };
  let fetchMock: jest.Mock;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    process.env.WEB_REVALIDATE_URL = "http://web:3000";
    process.env.REVALIDATE_SECRET = "s3cret";
  });

  afterEach(() => {
    process.env = { ...env };
    warn.mockRestore();
  });

  it("POSTs the tags to the resolved endpoint with the secret", async () => {
    await notifyWebRevalidate(["home:hero"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://web:3000/api/revalidate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tags: ["home:hero"] }),
        headers: expect.objectContaining({ "x-revalidate-secret": "s3cret" }),
      }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("is a no-op without configuration or tags", async () => {
    delete process.env.REVALIDATE_SECRET;
    await notifyWebRevalidate(["home:hero"]);
    process.env.REVALIDATE_SECRET = "s3cret";
    await notifyWebRevalidate([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns (never throws) when the web rejects or is unreachable", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(notifyWebRevalidate(["home:hero"])).resolves.toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(notifyWebRevalidate(["home:hero"])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
