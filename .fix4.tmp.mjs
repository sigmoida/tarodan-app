import fs from "node:fs";
const edit = (file, pairs) => {
  let s = fs.readFileSync(file, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(`${file}: missing\n${a}`);
    s = s.replace(a, b);
  }
  fs.writeFileSync(file, s);
};
const reg = "apps/api/src/common/timing-rules/timing-rules.registry.spec.ts";
edit(reg, [
  [
    `  // Bugünkü davranış = varsayılan eylem. Sonraki paketler yalnız bayrağı çevirir.
  const LATER_ACTIONS = {
  } satisfies Partial<
    Record<TimingRuleId, [TimingExpiryAction, TimingExpiryAction]>
  >;

  it.each(Object.entries(LATER_ACTIONS))(
    "%s — gelecekteki seçeneği tanımlı ama henüz kapalı",
    (id, [current, later]) => {
      expect(TIMING_RULES[id as TimingRuleId].actions).toEqual([
        { action: current, available: true },
        { action: later, available: false },
      ]);
    },
  );
`,
    `  // Bugünkü davranış = varsayılan eylem. Paketlerin hepsi birleşti: kayıtta
  // "tanımlı ama kapalı" eylem KALMADI. Yeni bir kapalı eylem eklenirse bu test
  // onu bilinçli bir karar olarak işaretletir.
  it("hiçbir kayıt kapalı (henüz açılmamış) eylem taşımıyor", () => {
    expect(
      TIMING_RULE_IDS.filter((id) =>
        TIMING_RULES[id].actions.some((option) => !option.available),
      ),
    ).toEqual([]);
  });
`,
  ],
  [`      [...Object.keys(LATER_ACTIONS), ...Object.keys(ENABLED_ACTIONS)].sort(),`, `      Object.keys(ENABLED_ACTIONS).sort(),`],
  [
    `  it("henüz açılmamış eylemi reddeder", () => {
@@UNAVAILABLE_EXAMPLE@@
  });`,
    `  it("henüz açılmamış eylemi reddeder", async () => {
    await withActionUnavailable("listingTtlDays", "auto_renew", () => {
      expect(validateTimingAction("listingTtlDays", "auto_renew")).toEqual({
        code: "actionUnavailable",
      });
    });
    // Bayrak geri açıldı: gerçek kayıt etkilenmedi.
    expect(validateTimingAction("listingTtlDays", "auto_renew")).toBeNull();
  });`,
  ],
]);
{
  let s = fs.readFileSync(reg, "utf8");
  const firstImportEnd = s.indexOf('} from "@tarodan/types";') + '} from "@tarodan/types";'.length;
  s = s.slice(0, firstImportEnd) + `\nimport { withActionUnavailable } from "./timing-rules.test-helpers";` + s.slice(firstImportEnd);
  fs.writeFileSync(reg, s);
}
const res = "apps/api/src/common/timing-rules/timing-rules.resolver.spec.ts";
edit(res, [
  [
    `  it("henüz açılmamış bir eylem DB'ye yazılmış olsa bile uygulanmaz", () => {
    expect(pickTimingAction("preparingDeadlineDays", "extend_once")).toBe(
      "cancel_and_refund",
    );
  });`,
    `  it("henüz açılmamış bir eylem DB'ye yazılmış olsa bile uygulanmaz", async () => {
    await withActionUnavailable("preparingDeadlineDays", "extend_once", () => {
      expect(pickTimingAction("preparingDeadlineDays", "extend_once")).toBe(
        "cancel_and_refund",
      );
    });
  });`,
  ],
]);
const svc = "apps/api/src/modules/timing-rules/timing-rules.service.spec.ts";
edit(svc, [
  [
    `      for (const [id, action] of [
@@UNAVAILABLE_LIST@@
      ] as const) {
        await expectRejected(
          service.applyChanges([{ id, action }], "u"),
          "server.admin.timingRules.actionUnavailable",
        );
      }`,
    `      for (const [id, action] of [
        ["listingTtlDays", "auto_renew"],
        ["offerExpiryHours", "extend_once"],
        ["preparingDeadlineDays", "extend_once"],
      ] as const) {
        await withActionUnavailable(id, action, () =>
          expectRejected(
            service.applyChanges([{ id, action }], "u"),
            "server.admin.timingRules.actionUnavailable",
          ),
        );
      }`,
  ],
]);
console.log("ok");
