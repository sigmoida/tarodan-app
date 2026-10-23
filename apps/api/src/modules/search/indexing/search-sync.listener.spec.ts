import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import { OUTBOX_SEARCH_PRODUCT_REINDEX } from "../../outbox/outbox.types";
import { SearchSyncListener } from "./search-sync.listener";

describe("SearchSyncListener outbox handler", () => {
  it("registers the product re-index event, which queues an index job for that product", async () => {
    const registry = new OutboxHandlerRegistry();
    const searchIndexing = {
      queueIndexProduct: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new SearchSyncListener(
      searchIndexing as never,
      {} as never,
      registry,
    );

    listener.onModuleInit();
    const handler = registry.get(OUTBOX_SEARCH_PRODUCT_REINDEX);
    expect(handler).toBeDefined();
    await handler?.({ productId: "p-1" }, {} as never);

    expect(searchIndexing.queueIndexProduct).toHaveBeenCalledWith("p-1");
  });
});
