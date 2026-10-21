import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("./client", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

import { usersApi } from "./users";

const USER_ID = "8f0c6a1e-2b7d-4c3a-9e15-0d4b6f2a7c91";

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: {} });
});

/**
 * The paths and query names of the admin sign-in methods routes
 * (`AdminUserSignInMethodsController`, `AdminSignInMethodEventsQueryDto`).
 * The section test mocks this client, so a wrong path or param name would
 * only show up here.
 */
describe("usersApi sign-in methods", () => {
  it("reads the methods from the user's sign-in methods route", async () => {
    await usersApi.getUserSignInMethods(USER_ID);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(`/admin/users/${USER_ID}/sign-in-methods`);
  });

  it("reads the history with only the page and limit query params", async () => {
    await usersApi.getUserSignInMethodEvents(USER_ID, { page: 3, limit: 50 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      `/admin/users/${USER_ID}/sign-in-methods/events`,
      { params: { page: 3, limit: 50 } },
    );
  });
});
