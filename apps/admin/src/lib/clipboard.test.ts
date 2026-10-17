import { afterEach, describe, expect, it, vi } from "vitest";
import { writeToClipboard } from "./clipboard";

const setClipboard = (clipboard: unknown) =>
  vi.stubGlobal("navigator", { clipboard });

describe("writeToClipboard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves true once writeText has succeeded", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await expect(writeToClipboard("GRPAAAAAAAAAAT000001")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("GRPAAAAAAAAAAT000001");
  });

  it("resolves false when writeText rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    await expect(writeToClipboard("x")).resolves.toBe(false);
  });

  it("resolves false when the Clipboard API is missing", async () => {
    setClipboard(undefined);
    await expect(writeToClipboard("x")).resolves.toBe(false);
  });
});
