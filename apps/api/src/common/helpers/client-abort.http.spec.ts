import * as express from "express";
import type { NextFunction, Request, Response } from "express";
import * as http from "http";
import type { AddressInfo } from "net";
import * as net from "net";
import * as multer from "multer";
import { isClientAbort } from "./client-abort";

/**
 * `isClientAbort` against real sockets: the errors multer and the JSON parser
 * raise when a phone drops an upload, and the errors an upstream call raises
 * while (or after) the client is connected. Hand-built error objects cannot
 * tell whether Node really sets the request's abort flags before the body
 * readers fail, or whether a real `ECONNRESET` looks like a body-reader error.
 */
describe("isClientAbort on real requests", () => {
  interface Seen {
    error: unknown;
    request: Request;
  }

  let server: http.Server;
  let upstream: http.Server;
  let seen: Promise<Seen>;
  let arrived: Promise<void>;
  let resolveSeen: (value: Seen) => void;
  let resolveArrived: () => void;

  // An upstream (S3, carrier, mail relay over HTTP) that resets the socket.
  const callResettingUpstream = () =>
    new Promise<never>((_resolve, reject) => {
      const { port } = upstream.address() as AddressInfo;
      http
        .get({ host: "127.0.0.1", port, path: "/" }, () => undefined)
        .on("error", reject);
    });

  beforeAll(async () => {
    upstream = http.createServer((req) => req.socket.destroy());
    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );

    const app = express();
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      resolveArrived();
      next();
    });
    app.post(
      "/upload",
      multer({ storage: multer.memoryStorage() }).single("file"),
      (_req: Request, res: Response) => res.end(),
    );
    app.post("/json", express.json(), (_req: Request, res: Response) =>
      res.end(),
    );
    app.get(
      "/upstream",
      (_req: Request, _res: Response, next: NextFunction) => {
        callResettingUpstream().catch(next);
      },
    );
    // The client gives up on a slow request, then the upstream fails.
    app.get(
      "/upstream-after-client-left",
      (req: Request, _res: Response, next: NextFunction) => {
        req.socket.once("close", () => {
          callResettingUpstream().catch(next);
        });
      },
    );
    app.use(
      (
        error: unknown,
        request: Request,
        res: Response,
        _next: NextFunction,
      ) => {
        resolveSeen({ error, request });
        if (!res.socket?.destroyed) res.status(500).end();
      },
    );
    server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
  });

  beforeEach(() => {
    seen = new Promise((resolve) => (resolveSeen = resolve));
    arrived = new Promise((resolve) => (resolveArrived = resolve));
  });

  /** Sends the head and part of a body, then drops the connection. */
  async function abortMidBody(head: string, partialBody: string) {
    const { port } = server.address() as AddressInfo;
    const socket = net.connect(port, "127.0.0.1");
    socket.on("error", () => undefined);
    socket.write(head + partialBody);
    await arrived;
    socket.destroy();
    return seen;
  }

  it("a multipart upload the client drops is a client abort", async () => {
    const boundary = "----tarodan";
    const { error, request } = await abortMidBody(
      [
        "POST /upload HTTP/1.1",
        "Host: 127.0.0.1",
        `Content-Type: multipart/form-data; boundary=${boundary}`,
        "Content-Length: 1000000",
        "",
        "",
      ].join("\r\n"),
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="a.jpg"',
        "Content-Type: image/jpeg",
        "",
        "partial bytes",
      ].join("\r\n"),
    );

    expect((error as Error).message).toBe("Request aborted");
    expect(isClientAbort(error, request)).toBe(true);
  });

  it("a JSON body the client drops is a client abort", async () => {
    const { error, request } = await abortMidBody(
      [
        "POST /json HTTP/1.1",
        "Host: 127.0.0.1",
        "Content-Type: application/json",
        "Content-Length: 1000",
        "",
        "",
      ].join("\r\n"),
      '{"name":',
    );

    expect((error as { type?: string }).type).toBe("request.aborted");
    expect(isClientAbort(error, request)).toBe(true);
  });

  it("an upstream reset while the client waits stays a server error", async () => {
    const { port } = server.address() as AddressInfo;
    const response = new Promise<number | undefined>((resolve, reject) =>
      http
        .get({ host: "127.0.0.1", port, path: "/upstream" }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on("error", reject),
    );

    const { error, request } = await seen;

    expect((error as { code?: string }).code).toBe("ECONNRESET");
    expect(isClientAbort(error, request)).toBe(false);
    await expect(response).resolves.toBe(500);
  });

  it("an upstream reset after the client gave up stays a server error", async () => {
    const { port } = server.address() as AddressInfo;
    const client = http.get({
      host: "127.0.0.1",
      port,
      path: "/upstream-after-client-left",
    });
    client.on("error", () => undefined);
    await arrived;
    client.destroy();

    const { error, request } = await seen;

    // The request really is aborted here: only the error's origin keeps the
    // upstream outage reported.
    expect(request.readableAborted || request.aborted).toBe(true);
    expect((error as { code?: string }).code).toBe("ECONNRESET");
    expect(isClientAbort(error, request)).toBe(false);
  });
});
