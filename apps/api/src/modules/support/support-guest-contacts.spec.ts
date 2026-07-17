import { SupportService } from "./support.service";

/**
 * #101 faz-2: server pagination for the cache-backed guest-contacts list.
 * Verifies the no-search path hydrates ONLY the current page (the memory win)
 * and that search filters across the object fields before paginating.
 */
describe("SupportService.getGuestContacts — #101 faz-2 cache pagination", () => {
  let cache: { get: jest.Mock };
  let service: SupportService;

  const contacts: Record<string, any> = {
    R1: {
      referenceNumber: "R1",
      name: "Ada Lovelace",
      email: "ada@x.com",
      subject: "Login issue",
    },
    R2: {
      referenceNumber: "R2",
      name: "Alan Turing",
      email: "alan@x.com",
      subject: "Payment",
    },
    R3: {
      referenceNumber: "R3",
      name: "Grace Hopper",
      email: "grace@y.com",
      subject: "Bug report",
    },
  };
  const refs = ["R1", "R2", "R3"];

  beforeEach(() => {
    cache = {
      get: jest.fn((key: string) => {
        if (key === "guest_contacts:list") return Promise.resolve(refs);
        const m = key.match(/^guest_contact:submission:(.+)$/);
        if (m) return Promise.resolve(contacts[m[1]] ?? null);
        return Promise.resolve(null);
      }),
    };
    service = new SupportService({} as any, cache as any, {} as any);
  });

  it("paginates the reference list and hydrates ONLY the current page", async () => {
    const res = await service.getGuestContacts({ page: 1, limit: 2 });
    expect(res.data.map((c) => c.referenceNumber)).toEqual(["R1", "R2"]);
    expect(res.meta).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 });
    // R3 is on page 2 → its object must NOT be fetched on page 1 (the memory win).
    expect(cache.get).not.toHaveBeenCalledWith("guest_contact:submission:R3");
  });

  it("returns the second page", async () => {
    const res = await service.getGuestContacts({ page: 2, limit: 2 });
    expect(res.data.map((c) => c.referenceNumber)).toEqual(["R3"]);
    expect(res.meta.page).toBe(2);
  });

  it("search filters across name/email/subject then paginates", async () => {
    const res = await service.getGuestContacts({
      page: 1,
      limit: 10,
      search: "turing",
    });
    expect(res.data.map((c) => c.referenceNumber)).toEqual(["R2"]);
    expect(res.meta.total).toBe(1);
  });

  it("empty list → empty data, total 0", async () => {
    cache.get = jest.fn(() => Promise.resolve(null));
    const res = await service.getGuestContacts({ page: 1, limit: 20 });
    expect(res.data).toEqual([]);
    expect(res.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });
});
