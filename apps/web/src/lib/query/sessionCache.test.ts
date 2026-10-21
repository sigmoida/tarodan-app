import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clearQueryCacheOnSessionChange,
  sessionOwnerChanged,
  type SessionOwner,
} from "./sessionCache";

const guest: SessionOwner = { user: null, isAuthenticated: false };
const signedIn = (id: string): SessionOwner => ({
  user: { id },
  isAuthenticated: true,
});
/** Signed in, but the profile has not loaded (transient checkAuth failure). */
const signedInNoProfile: SessionOwner = { user: null, isAuthenticated: true };

describe("sessionOwnerChanged", () => {
  it.each([
    ["logout", signedIn("u1"), guest],
    ["logout before the profile loaded", signedInNoProfile, guest],
    ["account switch", signedIn("u1"), signedIn("u2")],
    [
      "profile dropped while marked signed in",
      signedIn("u1"),
      signedInNoProfile,
    ],
  ])("is true on %s", (_case, prev, next) => {
    expect(sessionOwnerChanged(prev, next)).toBe(true);
  });

  it.each([
    ["sign-in from a guest session", guest, signedIn("u1")],
    ["the profile arriving", signedInNoProfile, signedIn("u1")],
    ["an update of the same user", signedIn("u1"), signedIn("u1")],
    ["a guest state change", guest, { ...guest }],
  ])("is false on %s", (_case, prev, next) => {
    expect(sessionOwnerChanged(prev, next)).toBe(false);
  });
});

describe("clearQueryCacheOnSessionChange", () => {
  const key = ["orders", "list"];
  const seeded = () => {
    const client = new QueryClient();
    client.setQueryData(key, [{ id: "o1" }]);
    return client;
  };

  it("empties the cache on logout", () => {
    const client = seeded();
    clearQueryCacheOnSessionChange(() => client)(guest, signedIn("u1"));
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("empties the cache when the user changes without a reload", () => {
    const client = seeded();
    clearQueryCacheOnSessionChange(() => client)(
      signedIn("u2"),
      signedIn("u1"),
    );
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("keeps the cache for re-renders of the same user", () => {
    const client = seeded();
    const listener = clearQueryCacheOnSessionChange(() => client);
    listener(signedIn("u1"), signedIn("u1"));
    listener({ ...signedIn("u1") }, signedIn("u1"));
    expect(client.getQueryData(key)).toEqual([{ id: "o1" }]);
  });
});
