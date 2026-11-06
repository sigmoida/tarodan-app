import { fetchImageBytes, ImageFetchError } from "./fetch-image-bytes";

const LIMITS = { maxBytes: 8, timeoutMs: 1000 };
const URL_ = "https://cdn.example.com/prod/collections/user/u1/a.webp";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("fetchImageBytes", () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => fetchSpy.mockRestore());

  const respond = (response: Response) => {
    fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(response);
  };

  it("returns the body and never follows redirects", async () => {
    respond(new Response(Buffer.from("abc")));
    await expect(fetchImageBytes(URL_, LIMITS)).resolves.toEqual(
      Buffer.from("abc"),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      URL_,
      expect.objectContaining({
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([301, 302, 403, 404, 500])("refuses HTTP %i", async (status) => {
    respond(new Response(null, { status }));
    await expect(fetchImageBytes(URL_, LIMITS)).rejects.toBeInstanceOf(
      ImageFetchError,
    );
  });

  it("refuses a declared Content-Length over the cap", async () => {
    respond(
      new Response(Buffer.from("abc"), { headers: { "content-length": "9" } }),
    );
    await expect(fetchImageBytes(URL_, LIMITS)).rejects.toThrow(/exceeds 8/);
  });

  it("refuses a streamed body over the cap without a Content-Length", async () => {
    respond(new Response(streamOf([new Uint8Array(5), new Uint8Array(5)])));
    await expect(fetchImageBytes(URL_, LIMITS)).rejects.toThrow(
      /body exceeds 8 bytes/,
    );
  });

  it("accepts a body exactly at the cap", async () => {
    respond(new Response(streamOf([new Uint8Array(4), new Uint8Array(4)])));
    await expect(fetchImageBytes(URL_, LIMITS)).resolves.toHaveLength(8);
  });

  it("passes a deadline signal that aborts", async () => {
    respond(new Response(Buffer.from("a")));
    await fetchImageBytes(URL_, { maxBytes: 8, timeoutMs: 5 });
    const [, init] = fetchSpy.mock.calls[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((init as RequestInit).signal?.aborted).toBe(true);
  });
});
