import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { MAIL_INTERNAL_RECIPIENTS_MAX } from "@tarodan/types";
import type {
  MailAreaState,
  MailSenderAccountView,
} from "@/lib/api/mail-routing.types";
import {
  accountCreatePayload,
  accountPatchPayload,
  accountSchema,
  accountToFormValues,
  addRecipient,
  areaLabel,
  areaSchema,
  areaSenderUpdate,
  areaToFormValues,
  deliveryOptions,
  emptyAccountValues,
  eventKey,
  eventLabel,
  notificationUpdate,
  notifiableAreas,
  personSchema,
  personToFormValues,
  planPersonChange,
  readMailRoutingState,
  recipientsByPerson,
  removeRecipient,
  selectedAreaIds,
  senderOptions,
  setEventDelivery,
  setEventEnabled,
  testSendSchema,
  testStatus,
  toNotificationDraft,
} from "./mail-routing";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

const account = (
  patch: Partial<MailSenderAccountView> = {},
): MailSenderAccountView => ({
  id: "acc-1",
  address: "siparis@tarodan.com.tr",
  displayName: "Tarodan Sipariş",
  host: null,
  port: null,
  secure: null,
  username: "siparis@tarodan.com.tr",
  hasPassword: true,
  lastTestAt: null,
  lastTestOk: null,
  lastTestError: null,
  usedByAreas: [],
  ...patch,
});

const area = (patch: Partial<MailAreaState> = {}): MailAreaState => ({
  id: "order",
  templateKeys: [],
  senderAccountId: null,
  displayName: null,
  replyTo: null,
  internalRecipients: [],
  events: [{ id: "order.paid", enabled: true, delivery: "instant" }],
  ...patch,
});

const areas: MailAreaState[] = [
  area({
    id: "order",
    internalRecipients: ["serhat@tarodan.com.tr"],
  }),
  area({
    id: "trade",
    internalRecipients: ["serhat@tarodan.com.tr", "nur@tarodan.com.tr"],
    events: [
      { id: "trade.started", enabled: true, delivery: "instant" },
      { id: "trade.disputed", enabled: true, delivery: "hourly" },
    ],
  }),
  area({ id: "account", events: [], internalRecipients: ["x@tarodan.com.tr"] }),
];

describe("readMailRoutingState", () => {
  const state = { defaultFrom: "a@b.co", accounts: [], areas: [] };
  it("reads plain and enveloped responses", () => {
    expect(readMailRoutingState(state)).toEqual(state);
    expect(readMailRoutingState({ data: state })).toEqual(state);
  });
  it("returns undefined for an unrelated body", () => {
    expect(readMailRoutingState({})).toBeUndefined();
    expect(readMailRoutingState(undefined)).toBeUndefined();
  });
});

describe("labels", () => {
  it("builds catalog keys, replacing the dot of an event id", () => {
    expect(areaLabel(t, "guestMessage")).toBe(
      "admin.mailRouting.areas.guestMessage",
    );
    expect(eventKey("support.ticketOpened")).toBe("support_ticketOpened");
    expect(eventLabel(t, "order.paid")).toBe(
      "admin.mailRouting.events.order_paid",
    );
  });
  it("lists the three delivery modes", () => {
    expect(deliveryOptions(t).map((o) => o.value)).toEqual([
      "instant",
      "hourly",
      "daily",
    ]);
  });
  it("puts the default identity first in the sender options", () => {
    const options = senderOptions(t, [account()]);
    expect(options[0].value).toBe("");
    expect(options[1]).toMatchObject({
      value: "acc-1",
      label: "siparis@tarodan.com.tr",
    });
  });
  it("maps the last test result", () => {
    expect(testStatus({ lastTestOk: null })).toBeNull();
    expect(testStatus({ lastTestOk: true })).toBe("ok");
    expect(testStatus({ lastTestOk: false })).toBe("failed");
  });
});

describe("accountSchema", () => {
  const valid = {
    ...emptyAccountValues,
    address: "Siparis@Tarodan.com.tr",
    displayName: "Tarodan Sipariş",
    password: "secret",
  };

  it("accepts a valid new account", () => {
    expect(accountSchema(t, false).safeParse(valid).success).toBe(true);
  });
  it("requires the password on create but not on edit", () => {
    const noPassword = { ...valid, password: "" };
    expect(accountSchema(t, false).safeParse(noPassword).success).toBe(false);
    expect(accountSchema(t, true).safeParse(noPassword).success).toBe(true);
  });
  it("rejects display names with quotes or angle brackets", () => {
    const schema = accountSchema(t, false);
    expect(
      schema.safeParse({ ...valid, displayName: 'Tarodan "Sipariş"' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...valid, displayName: "Tarodan <x>" }).success,
    ).toBe(false);
  });
  it("rejects a bad address and an out-of-range port", () => {
    const schema = accountSchema(t, false);
    expect(schema.safeParse({ ...valid, address: "nope" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, port: "70000" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, port: "abc" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, port: "587" }).success).toBe(true);
  });
});

describe("testSendSchema", () => {
  it("needs one valid recipient address", () => {
    const schema = testSendSchema(t);
    expect(schema.safeParse({ to: "" }).success).toBe(false);
    expect(schema.safeParse({ to: "x" }).success).toBe(false);
    expect(schema.safeParse({ to: "me@tarodan.com.tr" }).success).toBe(true);
  });
});

describe("account payloads", () => {
  it("lower-cases the address and nulls empty advanced fields on create", () => {
    expect(
      accountCreatePayload({
        ...emptyAccountValues,
        address: " Siparis@Tarodan.com.tr ",
        displayName: " Tarodan Sipariş ",
        password: "pw",
      }),
    ).toEqual({
      address: "siparis@tarodan.com.tr",
      displayName: "Tarodan Sipariş",
      host: null,
      port: null,
      secure: null,
      username: null,
      password: "pw",
    });
  });

  it("never prefills the password when editing", () => {
    expect(accountToFormValues(account()).password).toBe("");
  });

  it("shows a default (address) username empty so it is not sent", () => {
    expect(accountToFormValues(account()).username).toBe("");
  });

  it("does not send a username when the address changes under a default username", () => {
    const original = account();
    const values = {
      ...accountToFormValues(original),
      address: "info@tarodan.com.tr",
    };
    expect(accountPatchPayload(values, original)).toEqual({
      address: "info@tarodan.com.tr",
    });
  });

  it("keeps an explicit custom username and sends a changed one", () => {
    const original = account({ username: "custom-login" });
    const form = accountToFormValues(original);
    expect(form.username).toBe("custom-login");
    expect(
      accountPatchPayload(
        { ...form, address: "info@tarodan.com.tr" },
        original,
      ),
    ).toEqual({ address: "info@tarodan.com.tr" });
    expect(
      accountPatchPayload({ ...form, username: "other" }, original),
    ).toEqual({ username: "other" });
    expect(accountPatchPayload({ ...form, username: "" }, original)).toEqual({
      username: null,
    });
  });

  it("returns null when nothing changed", () => {
    const original = account();
    expect(
      accountPatchPayload(accountToFormValues(original), original),
    ).toBeNull();
  });

  it("sends only changed fields and omits an empty password", () => {
    const original = account();
    const values = {
      ...accountToFormValues(original),
      displayName: "Yeni Ad",
      port: "465",
      secure: "true",
    };
    expect(accountPatchPayload(values, original)).toEqual({
      displayName: "Yeni Ad",
      port: 465,
      secure: true,
    });
  });

  it("sends the password only when one was typed", () => {
    const original = account();
    const values = { ...accountToFormValues(original), password: "new" };
    expect(accountPatchPayload(values, original)).toEqual({ password: "new" });
  });

  it("can clear host back to the default server", () => {
    const original = account({ host: "mail.example.com" });
    const values = { ...accountToFormValues(original), host: "" };
    expect(accountPatchPayload(values, original)).toEqual({ host: null });
  });
});

describe("area sender form", () => {
  it("validates the reply-to address only when filled", () => {
    const schema = areaSchema(t);
    const base = { senderAccountId: "", displayName: "", replyTo: "" };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, replyTo: "x" }).success).toBe(false);
    expect(
      schema.safeParse({ ...base, replyTo: "destek@tarodan.com.tr" }).success,
    ).toBe(true);
  });

  it("validates the area display-name override like the account's", () => {
    const schema = areaSchema(t);
    const base = { senderAccountId: "", displayName: "", replyTo: "" };
    expect(schema.safeParse({ ...base, displayName: "a<b" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...base, displayName: "Tarodan" }).success).toBe(
      true,
    );
  });

  it("returns null without changes and only changed fields otherwise", () => {
    const current = area({ senderAccountId: "acc-1", replyTo: "a@b.co" });
    expect(areaSenderUpdate(areaToFormValues(current), current)).toBeNull();
    expect(
      areaSenderUpdate(
        { senderAccountId: "", displayName: "Tarodan", replyTo: "a@b.co" },
        current,
      ),
    ).toEqual({ senderAccountId: null, displayName: "Tarodan" });
  });
});

describe("recipients", () => {
  it("adds a lower-cased valid address", () => {
    expect(addRecipient([], " Serhat@Tarodan.com.tr ")).toEqual({
      ok: true,
      list: ["serhat@tarodan.com.tr"],
    });
  });
  it("rejects invalid, duplicate and over-limit addresses", () => {
    expect(addRecipient([], "nope")).toEqual({ ok: false, error: "invalid" });
    expect(addRecipient(["a@b.co"], "A@B.co")).toEqual({
      ok: false,
      error: "duplicate",
    });
    const full = Array.from(
      { length: MAIL_INTERNAL_RECIPIENTS_MAX },
      (_, i) => `u${i}@b.co`,
    );
    expect(addRecipient(full, "new@b.co")).toEqual({
      ok: false,
      error: "limit",
    });
  });
  it("removes an address", () => {
    expect(removeRecipient(["a@b.co", "c@d.co"], "a@b.co")).toEqual(["c@d.co"]);
  });
});

describe("notification draft diff", () => {
  const saved = areas[1];

  it("is null for an untouched draft", () => {
    expect(notificationUpdate(toNotificationDraft(saved), saved)).toBeNull();
  });

  it("sends only the changed events", () => {
    let draft = toNotificationDraft(saved);
    draft = setEventEnabled(draft, "trade.started", false);
    draft = setEventDelivery(draft, "trade.disputed", "hourly"); // unchanged
    expect(notificationUpdate(draft, saved)).toEqual({
      events: [{ id: "trade.started", enabled: false, delivery: "instant" }],
    });
  });

  it("sends recipients when the set changed, ignoring order", () => {
    const draft = toNotificationDraft(saved);
    draft.internalRecipients = [...draft.internalRecipients].reverse();
    expect(notificationUpdate(draft, saved)).toBeNull();
    draft.internalRecipients = ["nur@tarodan.com.tr"];
    expect(notificationUpdate(draft, saved)).toEqual({
      internalRecipients: ["nur@tarodan.com.tr"],
    });
  });

  it("does not mutate the saved area", () => {
    const draft = toNotificationDraft(saved);
    setEventDelivery(draft, "trade.started", "daily");
    draft.internalRecipients.push("z@b.co");
    expect(saved.internalRecipients).toHaveLength(2);
    expect(saved.events[0].delivery).toBe("instant");
  });
});

describe("recipient by person pivot", () => {
  it("lists areas without events as not notifiable", () => {
    expect(notifiableAreas(areas).map((a) => a.id)).toEqual(["order", "trade"]);
  });

  it("groups every address with the areas it receives, sorted", () => {
    expect(recipientsByPerson(areas)).toEqual([
      { address: "nur@tarodan.com.tr", areaIds: ["trade"] },
      { address: "serhat@tarodan.com.tr", areaIds: ["order", "trade"] },
    ]);
  });
});

describe("planPersonChange", () => {
  it("adds and removes across areas, one update per changed area", () => {
    const plan = planPersonChange(areas, "Nur@tarodan.com.tr", ["order"]);
    expect(plan.overLimit).toEqual([]);
    expect(plan.updates).toEqual([
      {
        areaId: "order",
        update: {
          internalRecipients: ["serhat@tarodan.com.tr", "nur@tarodan.com.tr"],
        },
      },
      {
        areaId: "trade",
        update: { internalRecipients: ["serhat@tarodan.com.tr"] },
      },
    ]);
  });

  it("produces nothing when the selection matches the current state", () => {
    expect(
      planPersonChange(areas, "serhat@tarodan.com.tr", ["order", "trade"]),
    ).toEqual({ updates: [], overLimit: [] });
  });

  it("reports a full area instead of planning it", () => {
    const full = area({
      id: "order",
      internalRecipients: Array.from(
        { length: MAIL_INTERNAL_RECIPIENTS_MAX },
        (_, i) => `u${i}@b.co`,
      ),
    });
    expect(planPersonChange([full], "new@b.co", ["order"])).toEqual({
      updates: [],
      overLimit: ["order"],
    });
  });
});

describe("person form", () => {
  it("seeds one checkbox per notifiable area", () => {
    const values = personToFormValues(areas, {
      address: "serhat@tarodan.com.tr",
      areaIds: ["order"],
    });
    expect(values).toEqual({
      address: "serhat@tarodan.com.tr",
      area_order: true,
      area_trade: false,
    });
    expect(selectedAreaIds(values, areas)).toEqual(["order"]);
  });

  it("requires a valid address", () => {
    const schema = personSchema(t, areas);
    const values = personToFormValues(areas);
    expect(schema.safeParse(values).success).toBe(false);
    expect(schema.safeParse({ ...values, address: "a@b.co" }).success).toBe(
      true,
    );
  });
});
