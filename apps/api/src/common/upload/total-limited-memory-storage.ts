import { PayloadTooLargeException } from "@nestjs/common";
import type { Request } from "express";
import type { StorageEngine } from "multer";

interface BufferedFile {
  buffer?: Buffer;
  size?: number;
  stream: NodeJS.ReadableStream;
}

type StorageCallback = (
  error: Error | null,
  info?: { buffer: Buffer; size: number },
) => void;

interface RequestUploadState {
  bytes: number;
  rejected: boolean;
}

/** Buffers multipart files while enforcing a cap across the whole request. */
export function totalLimitedMemoryStorage(
  maxTotalBytes: number,
): StorageEngine {
  const requestStates = new WeakMap<Request, RequestUploadState>();

  return {
    _handleFile(
      request: Request,
      file: BufferedFile,
      callback: StorageCallback,
    ) {
      const state = requestStates.get(request) ?? { bytes: 0, rejected: false };
      requestStates.set(request, state);
      const chunks: Buffer[] = [];
      let size = 0;
      let completed = false;

      const finish = (
        error: Error | null,
        info?: { buffer: Buffer; size: number },
      ) => {
        if (completed) return;
        completed = true;
        callback(error, info);
      };

      file.stream.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        state.bytes += buffer.length;

        if (state.rejected || state.bytes > maxTotalBytes) {
          state.rejected = true;
          chunks.length = 0;
          finish(
            new PayloadTooLargeException({
              code: "PRODUCT_BULK_IMPORT_TOTAL_SIZE_EXCEEDED",
              message: `Toplu yüklemenin toplam boyutu ${Math.floor(
                maxTotalBytes / 1024 / 1024,
              )} MB sınırını aşamaz.`,
            }),
          );
          return;
        }

        chunks.push(buffer);
      });
      file.stream.once("error", (error) => finish(error));
      file.stream.once("end", () => {
        if (state.rejected) return;
        finish(null, { buffer: Buffer.concat(chunks), size });
      });
    },
    _removeFile(
      _request: Request,
      file: BufferedFile,
      callback: (error: Error | null) => void,
    ) {
      delete file.buffer;
      callback(null);
    },
  };
}
