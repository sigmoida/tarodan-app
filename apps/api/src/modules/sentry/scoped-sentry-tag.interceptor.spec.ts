import { CallHandler, ExecutionContext } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Observable, lastValueFrom, of } from "rxjs";
import { delay, tap } from "rxjs/operators";
import { scopedSentryTag } from "./scoped-sentry-tag.interceptor";

describe("scopedSentryTag", () => {
  // Isolation scopes only fork once the SDK has installed its async context
  // (as the app does at start-up); the bare stack strategy shares one.
  beforeAll(() => {
    Sentry.init({ defaultIntegrations: false, tracesSampleRate: 0 });
  });
  afterAll(async () => {
    await Sentry.close();
  });

  const Interceptor = scopedSentryTag({ key: "feature", value: "demo" });
  const context = {} as ExecutionContext;

  it("tags the scope the handler runs in, even across async steps", async () => {
    let seen: unknown;
    const handler: CallHandler = {
      handle: () =>
        of(1).pipe(
          delay(1),
          tap(() => {
            seen = Sentry.getIsolationScope().getScopeData().tags.feature;
          }),
        ),
    };

    await lastValueFrom(
      new Interceptor().intercept(context, handler) as Observable<unknown>,
    );

    expect(seen).toBe("demo");
  });

  it("does not leave the tag on the process-wide scope", async () => {
    const handler: CallHandler = { handle: () => of(1) };

    await lastValueFrom(
      new Interceptor().intercept(context, handler) as Observable<unknown>,
    );

    expect(Sentry.getIsolationScope().getScopeData().tags.feature).toBe(
      undefined,
    );
  });
});
