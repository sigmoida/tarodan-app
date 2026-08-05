import { PayloadTooLargeException } from "@nestjs/common";
import type { Request } from "express";
import { Readable } from "stream";
import { totalLimitedMemoryStorage } from "./total-limited-memory-storage";

function upload(
  storage: ReturnType<typeof totalLimitedMemoryStorage>,
  request: Request,
  bytes: number,
) {
  return new Promise<{ buffer: Buffer; size: number }>((resolve, reject) => {
    storage._handleFile(
      request,
      { stream: Readable.from(Buffer.alloc(bytes)) } as never,
      (error, info) => {
        if (error) reject(error);
        else resolve(info as { buffer: Buffer; size: number });
      },
    );
  });
}

describe("totalLimitedMemoryStorage", () => {
  it("counts bytes across all files in one multipart request", async () => {
    const storage = totalLimitedMemoryStorage(10);
    const request = {} as Request;

    await expect(upload(storage, request, 6)).resolves.toMatchObject({
      size: 6,
    });
    await expect(upload(storage, request, 5)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });
});
