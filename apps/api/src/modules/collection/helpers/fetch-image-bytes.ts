/**
 * Bounded server-side image download for the collection cover generator.
 *
 * The caller passes a URL it built from one of our own object keys; this
 * helper adds the transport limits: no redirects (a 3xx fails instead of
 * following to another host), a deadline over the whole request including the
 * body, and a byte cap checked against `Content-Length` and again while the
 * body streams (a missing or lying header cannot exceed it).
 */
export interface FetchImageLimits {
  maxBytes: number;
  timeoutMs: number;
}

export class ImageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageFetchError";
  }
}

export async function fetchImageBytes(
  url: string,
  limits: FetchImageLimits,
): Promise<Buffer> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(limits.timeoutMs),
  });

  if (response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new ImageFetchError(`Image download failed: HTTP ${response.status}`);
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limits.maxBytes) {
    await response.body.cancel().catch(() => undefined);
    throw new ImageFetchError(
      `Image download refused: ${declared} bytes exceeds ${limits.maxBytes}`,
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limits.maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImageFetchError(
        `Image download refused: body exceeds ${limits.maxBytes} bytes`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
