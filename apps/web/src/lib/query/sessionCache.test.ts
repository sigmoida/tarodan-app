import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  sessionChange,
  syncQueryCacheWithSession,
  type SessionOwner,
} from "./sessionCache";

const guest: SessionOwner = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};
const resolving: SessionOwner = { ...guest, isLoading: true };
const signedIn = (id: string): SessionOwner => ({
  user: { id },
  isAuthenticated: true,
  isLoading: false,
});
/** Signed in, but the profile has not loaded (transient checkAuth failure). */
const signedInNoProfile: SessionOwner = { user: null, isAuthenticated: true };

describe("sessionChange", () => {
  it.each([
    ["logout", signedIn("u1"), guest, false, "ended"],
    [
      "logout before the profile loaded",
      signedInNoProfile,
      guest,
      false,
      "ended",
    ],
    ["account switch", signedIn("u1"), signedIn("u2"), false, "switched"],
    [
      "sign-in after browsing as a guest",
      resolving,
      signedIn("u1"),
      true,
      "signedIn",
    ],
    ["session restore on load", resolving, signedIn("u1"), false, null],
    ["the profile arriving", signedInNoProfile, signedIn("u1"), false, null],
    ["an update of the same user", signedIn("u1"), signedIn("u1"), false, null],
    ["a guest state change", guest, resolving, true, null],
  ] as const)("%s -> %s", (_case, prev, next, wasGuest, expected) => {
    expect(sessionChange(prev, next, wasGuest)).toBe(expected);
  });
});

describe("syncQueryCacheWithSession", () => {
  const key = ["orders", "list"];
  const seeded = () => {
    const client = new QueryClient();
    client.setQueryData(key, [{ id: "o1" }]);
    return client;
  };

  it("empties the cache on logout", () => {
    const client = seeded();
    syncQueryCacheWithSession(() => client, signedIn("u1"))(
      guest,
      signedIn("u1"),
    );
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("empties the cache when the user changes without a reload", () => {
    const client = seeded();
    syncQueryCacheWithSession(() => client, signedIn("u1"))(
      signedIn("u2"),
      signedIn("u1"),
    );
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("drops the guest cache on sign-in but keeps a guest mutation", async () => {
    const client = seeded();
    const mutation = new MutationObserver(client, {
      mutationFn: () => new Promise(() => undefined),
    });
    void mutation.mutate();
    const listener = syncQueryCacheWithSession(() => client, guest);

    listener(resolving, guest);
    listener(signedIn("u1"), resolving);

    expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(1);
  });

  it("keeps the server-seeded cache when the session is restored on load", () => {
    const client = seeded();
    syncQueryCacheWithSession(() => client, resolving)(
      signedIn("u1"),
      resolving,
    );
    expect(client.getQueryData(key)).toEqual([{ id: "o1" }]);
  });

  it("pushes the empty state to a still-mounted observer", () => {
    const client = seeded();
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: () => [{ id: "o1" }],
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    expect(observer.getCurrentResult().data).toEqual([{ id: "o1" }]);

    syncQueryCacheWithSession(() => client, signedIn("u1"))(
      guest,
      signedIn("u1"),
    );

    expect(observer.getCurrentResult().data).toBeUndefined();
    unsubscribe();
  });

  it("drops a fetch of the previous user that resolves after logout", async () => {
    const client = new QueryClient();
    let resolve!: (rows: unknown) => void;
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: () => new Promise((r) => (resolve = r)),
    });
    const unsubscribe = observer.subscribe(() => undefined);

    syncQueryCacheWithSession(() => client, signedIn("u1"))(
      guest,
      signedIn("u1"),
    );
    resolve([{ id: "o1" }]);
    await new Promise((r) => setTimeout(r, 0));

    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(key)).toBeUndefined();
    unsubscribe();
  });

  it("keeps the cache for re-renders of the same user", () => {
    const client = seeded();
    const listener = syncQueryCacheWithSession(() => client, signedIn("u1"));
    listener(signedIn("u1"), signedIn("u1"));
    listener({ ...signedIn("u1") }, signedIn("u1"));
    expect(client.getQueryData(key)).toEqual([{ id: "o1" }]);
  });
});
