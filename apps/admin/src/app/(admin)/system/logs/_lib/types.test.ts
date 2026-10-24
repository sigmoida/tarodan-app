import { describe, expect, it } from "vitest";
import { SIGN_IN_METHOD_EVENT_TYPES } from "@tarodan/types";
import { signInMethodEventLabels } from "@/lib/sign-in-methods";
import { eventTypeLabels } from "./types";

/** Echoes the key, so the test can check which catalog key a label uses. */
const t = ((key: string) => key) as unknown as Parameters<
  typeof eventTypeLabels
>[0];

describe("eventTypeLabels", () => {
  it("labels every sign-in method event with the shared admin label", () => {
    const labels = eventTypeLabels(t);
    const shared = signInMethodEventLabels(t);

    for (const type of SIGN_IN_METHOD_EVENT_TYPES) {
      expect(labels[type], type).toBe(shared[type]);
      expect(labels[type], type).toMatch(/^admin\.system\.logs\.events\./);
    }
  });

  it("keeps the labels of the other security events", () => {
    expect(eventTypeLabels(t)).toMatchObject({
      failed_login: "admin.system.logs.events.failedLogin",
      account_locked: "admin.system.logs.events.accountLocked",
    });
  });
});
