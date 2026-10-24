import type { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { initAppLogger } from "../../common/logging/logger";
import { SentryModule } from "./sentry.module";
import type { SentryService } from "./sentry.service";

jest.mock("@sentry/node", () => ({
  getClient: jest.fn(),
  init: jest.fn(),
}));
jest.mock("../../common/logging/logger", () => ({
  initAppLogger: jest.fn(),
}));

const getClient = Sentry.getClient as jest.Mock;
const init = Sentry.init as jest.Mock;
const DSN = "https://public@example.ingest.sentry.io/1";

function moduleWith(dsn: string | undefined) {
  const config = { get: jest.fn().mockReturnValue(dsn) };
  const sentryService = {} as SentryService;
  return {
    module: new SentryModule(config as unknown as ConfigService, sentryService),
    sentryService,
  };
}

/**
 * The worker entry point initializes Sentry before Nest boots, and the
 * headless AppModule then loads SentryModule in the same process. A second
 * `Sentry.init` would replace the worker's client, so SentryModule skips it;
 * the app logger still gets its Sentry sink in every case.
 */
describe("SentryModule.onModuleInit", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not initialize Sentry again when the entry point already did", () => {
    getClient.mockReturnValue({});
    const { module, sentryService } = moduleWith(DSN);

    module.onModuleInit();

    expect(init).not.toHaveBeenCalled();
    expect(initAppLogger).toHaveBeenCalledWith(sentryService);
  });

  it("initializes Sentry with the shared options when no client exists", () => {
    getClient.mockReturnValue(undefined);
    const { module, sentryService } = moduleWith(DSN);

    module.onModuleInit();

    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toMatchObject({
      dsn: DSN,
      sampleRate: 1,
    });
    expect(init.mock.calls[0][0]).not.toHaveProperty("profilesSampleRate");
    expect(initAppLogger).toHaveBeenCalledWith(sentryService);
  });

  it("stays off without a DSN and still sets up the app logger", () => {
    getClient.mockReturnValue(undefined);
    const { module, sentryService } = moduleWith(undefined);

    module.onModuleInit();

    expect(init).not.toHaveBeenCalled();
    expect(initAppLogger).toHaveBeenCalledWith(sentryService);
  });
});
