import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  INestApplication,
  UseInterceptors,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as Sentry from "@sentry/node";
import * as request from "supertest";
import { scopedSentryTag } from "./scoped-sentry-tag.interceptor";
import { sentryRequestScopeMiddleware } from "./sentry-request-scope.middleware";

/**
 * Runs the real Nest pipeline: the 5xx is reported from the exception filter,
 * which runs outside the handler's async context, so this is where a tag on
 * the wrong scope would go missing.
 */
describe("scopedSentryTag with the per-request Sentry scope", () => {
  const featureTag = () =>
    Sentry.getIsolationScope().getScopeData().tags.feature;
  const seen: { handler?: unknown; filter?: unknown } = {};

  @Catch()
  class RecordingFilter implements ExceptionFilter {
    catch(_exception: unknown, host: ArgumentsHost) {
      seen.filter = featureTag();
      host.switchToHttp().getResponse().status(500).json({});
    }
  }

  @UseInterceptors(scopedSentryTag({ key: "feature", value: "demo" }))
  @Controller("tagged")
  class TaggedController {
    @Get()
    async fail() {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.handler = featureTag();
      throw new Error("boom");
    }
  }

  @Controller("untagged")
  class UntaggedController {
    @Get()
    async fail() {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.handler = featureTag();
      throw new Error("boom");
    }
  }

  let app: INestApplication;

  // Isolation scopes only fork once the SDK has installed its async context
  // (as the app does at start-up); the bare stack strategy shares one.
  beforeAll(async () => {
    Sentry.init({ defaultIntegrations: false, tracesSampleRate: 0 });
    const moduleRef = await Test.createTestingModule({
      controllers: [TaggedController, UntaggedController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(sentryRequestScopeMiddleware);
    app.useGlobalFilters(new RecordingFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await Sentry.close();
  });

  beforeEach(() => {
    delete seen.handler;
    delete seen.filter;
  });

  it("puts the tag on the scope the 5xx is reported from", async () => {
    await request(app.getHttpServer()).get("/tagged").expect(500);

    expect(seen.handler).toBe("demo");
    expect(seen.filter).toBe("demo");
  });

  it("leaves the tag neither on the process-wide scope nor on the next request", async () => {
    await request(app.getHttpServer()).get("/tagged").expect(500);
    await request(app.getHttpServer()).get("/untagged").expect(500);

    expect(seen.handler).toBeUndefined();
    expect(seen.filter).toBeUndefined();
    expect(featureTag()).toBeUndefined();
  });
});
