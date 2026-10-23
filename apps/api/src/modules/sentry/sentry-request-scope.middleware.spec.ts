import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  INestApplication,
  Param,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as Sentry from "@sentry/node";
import { readFileSync } from "fs";
import { resolve } from "path";
import * as request from "supertest";
import { sentryRequestScopeMiddleware } from "./sentry-request-scope.middleware";

/**
 * Two requests in flight at once, each writing a user, tags and a breadcrumb
 * before either fails. The events Sentry would send are read from `beforeSend`,
 * so what is checked is the event itself, not a scope we think it reads.
 */
describe("sentryRequestScopeMiddleware with concurrent requests", () => {
  const events: Sentry.ErrorEvent[] = [];
  const eventFor = (message: string) =>
    events.find((e) => e.exception?.values?.[0]?.value === message);
  const crumbs = (event?: Sentry.ErrorEvent) =>
    (event?.breadcrumbs ?? []).map((b) => b.message);

  // Each handler waits until both have written their scope: without one scope
  // per request, the second writer's values land on the first one's event.
  let arrivals: Promise<void>[] = [];
  let arrive: Record<string, () => void> = {};

  @Catch()
  class CapturingFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
      Sentry.captureException(exception);
      host.switchToHttp().getResponse().status(500).json({});
    }
  }

  @Controller("concurrent")
  class ConcurrentController {
    @Get(":who")
    async fail(@Param("who") who: string) {
      Sentry.setUser({ id: `user-${who}` });
      Sentry.setTag("caller", who);
      if (who === "a") Sentry.setTag("feature", "saved_search");
      Sentry.addBreadcrumb({ message: `crumb-${who}` });
      arrive[who]();
      await Promise.all(arrivals);
      throw new Error(`boom-${who}`);
    }
  }

  let app: INestApplication;

  beforeAll(async () => {
    Sentry.init({
      dsn: "https://public@sentry.invalid/1",
      defaultIntegrations: false,
      tracesSampleRate: 0,
      transport: () => ({
        send: () => Promise.resolve({}),
        flush: () => Promise.resolve(true),
      }),
      beforeSend: (event) => {
        events.push(event);
        return null;
      },
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [ConcurrentController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(sentryRequestScopeMiddleware);
    app.useGlobalFilters(new CapturingFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await Sentry.close();
  });

  beforeEach(() => {
    events.length = 0;
    arrive = {};
    arrivals = ["a", "b"].map(
      (who) => new Promise<void>((resolve) => (arrive[who] = resolve)),
    );
  });

  it("keeps each request's user, tags and breadcrumbs on its own event", async () => {
    const server = app.getHttpServer();
    await Promise.all([
      request(server).get("/concurrent/a").expect(500),
      request(server).get("/concurrent/b").expect(500),
    ]);
    await Sentry.flush(2000);

    const a = eventFor("boom-a");
    const b = eventFor("boom-b");
    expect(a?.user?.id).toBe("user-a");
    expect(a?.tags).toMatchObject({ caller: "a", feature: "saved_search" });
    expect(crumbs(a)).toContain("crumb-a");
    expect(crumbs(a)).not.toContain("crumb-b");

    expect(b?.user?.id).toBe("user-b");
    expect(b?.tags?.caller).toBe("b");
    expect(b?.tags?.feature).toBeUndefined();
    expect(crumbs(b)).toContain("crumb-b");
    expect(crumbs(b)).not.toContain("crumb-a");
  });

  it("leaves nothing from the requests on a cron event afterwards", async () => {
    const server = app.getHttpServer();
    await Promise.all([
      request(server).get("/concurrent/a").expect(500),
      request(server).get("/concurrent/b").expect(500),
    ]);

    // A cron or queue job runs outside every request.
    Sentry.captureException(new Error("cron-failure"));
    await Sentry.flush(2000);

    const cron = eventFor("cron-failure");
    expect(cron).toBeDefined();
    expect(cron?.user).toBeUndefined();
    expect(cron?.tags?.caller).toBeUndefined();
    expect(cron?.tags?.feature).toBeUndefined();
    expect(crumbs(cron)).toEqual([]);
  });
});

/**
 * The behaviour tests above register the middleware themselves; this pins
 * that the app does too, and where: after the request id (so both contexts
 * are open together) and before every parser and route mount, so guards,
 * handlers and the exception filter all run inside the request's scope.
 */
describe("sentryRequestScopeMiddleware registration in main.ts", () => {
  const source = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
  const at = (snippet: string) => {
    const index = source.indexOf(snippet);
    expect(index).toBeGreaterThan(-1);
    return index;
  };

  it("is registered right after the request id, before parsers and routes", () => {
    const scope = at("app.use(sentryRequestScopeMiddleware)");

    expect(at("app.use(requestIdMiddleware)")).toBeLessThan(scope);
    for (const later of [
      "app.use(json(",
      "app.use(urlencoded(",
      "setupBullBoard(app",
      "app.use(helmet())",
      "app.listen(",
    ]) {
      expect(scope).toBeLessThan(at(later));
    }
  });
});
