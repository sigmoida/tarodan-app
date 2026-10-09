import { readFileSync } from "fs";
import { join } from "path";
import { apiAppRoot } from "./app-root";
import {
  assertUatSeedAllowed,
  parseUatAccounts,
  parseUatListings,
  parseUatSeedMode,
  planUatAccountSync,
  planUatSeedSteps,
  resolveUatPassword,
  shouldResetPasswords,
  UAT_PASSWORD_ENV,
  UAT_RESET_PASSWORDS_ENV,
} from "./seed-uat-accounts";

const readData = (dir: string, file: string): unknown =>
  JSON.parse(
    readFileSync(join(apiAppRoot(), "prisma", "data", dir, file), "utf8"),
  );

describe("assertUatSeedAllowed", () => {
  it.each(["production", "PRODUCTION", " production "])(
    "refuses APP_ENV=%j",
    (value) => {
      expect(() => assertUatSeedAllowed({ APP_ENV: value })).toThrow(
        /APP_ENV=production/,
      );
    },
  );

  it.each([
    { NODE_ENV: "production" },
    { NODE_ENV: "production", APP_ENV: "" },
    { NODE_ENV: "production", APP_ENV: "development" },
  ])("refuses a production build without APP_ENV=staging: %j", (env) => {
    expect(() => assertUatSeedAllowed(env)).toThrow(/APP_ENV=staging/);
  });

  it.each([
    { APP_ENV: "staging" },
    { NODE_ENV: "production", APP_ENV: "staging" },
    { APP_ENV: "development" },
    {},
  ])("allows %j", (env) => {
    expect(() => assertUatSeedAllowed(env)).not.toThrow();
  });
});

describe("resolveUatPassword", () => {
  const strong = "uat-initial-pass-2026!";

  it("returns the trimmed password", () => {
    expect(resolveUatPassword({ [UAT_PASSWORD_ENV]: ` ${strong}\n` })).toBe(
      strong,
    );
  });

  it("requires the variable", () => {
    expect(() => resolveUatPassword({})).toThrow(
      /UAT_SEED_PASSWORD is required/,
    );
    expect(() => resolveUatPassword({ [UAT_PASSWORD_ENV]: "   " })).toThrow(
      /required/,
    );
  });

  it("enforces the length bounds without echoing the value", () => {
    const short = "short-secret";
    let message = "";
    try {
      resolveUatPassword({ [UAT_PASSWORD_ENV]: short });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/16\+ characters/);
    expect(message).not.toContain(short);

    expect(() =>
      resolveUatPassword({ [UAT_PASSWORD_ENV]: "x".repeat(73) }),
    ).toThrow(/72 bytes/);
    // 40 karakter ama 80 bayt: bcrypt kesmesin diye reddedilir.
    expect(() =>
      resolveUatPassword({ [UAT_PASSWORD_ENV]: "ş".repeat(40) }),
    ).toThrow(/72 bytes/);
  });
});

describe("shouldResetPasswords", () => {
  it.each(["1", "true", "TRUE"])("is on for %j", (value) => {
    expect(shouldResetPasswords({ [UAT_RESET_PASSWORDS_ENV]: value })).toBe(
      true,
    );
  });

  it.each([undefined, "", "0", "false", "yes"])("is off for %j", (value) => {
    expect(shouldResetPasswords({ [UAT_RESET_PASSWORDS_ENV]: value })).toBe(
      false,
    );
  });
});

describe("planUatAccountSync (idempotency)", () => {
  it("creates a missing account and always writes its password", () => {
    for (const kind of ["member", "staff"] as const) {
      expect(
        planUatAccountSync({ kind, exists: false, resetPasswords: false }),
      ).toMatchObject({ create: true, writePassword: true });
    }
  });

  it("never rewrites an existing password unless the flag is set", () => {
    expect(
      planUatAccountSync({
        kind: "member",
        exists: true,
        resetPasswords: false,
      }).writePassword,
    ).toBe(false);
    expect(
      planUatAccountSync({
        kind: "staff",
        exists: true,
        resetPasswords: true,
      }).writePassword,
    ).toBe(true);
  });

  it("leaves an existing member's profile alone but re-asserts staff access", () => {
    expect(
      planUatAccountSync({ kind: "member", exists: true, resetPasswords: true })
        .reconcileFlags,
    ).toBe(false);
    expect(
      planUatAccountSync({ kind: "staff", exists: true, resetPasswords: false })
        .reconcileFlags,
    ).toBe(true);
  });
});

describe("parseUatAccounts", () => {
  const valid = {
    members: [{ email: " Nur@Tarodan.com.tr ", displayName: "Nur" }],
    staff: [{ email: "tarodan@tarodan.com.tr", role: "super_admin" }],
  };

  it("normalizes emails and derives a missing display name", () => {
    const parsed = parseUatAccounts(valid);
    expect(parsed.members).toEqual([
      { email: "nur@tarodan.com.tr", displayName: "Nur" },
    ]);
    expect(parsed.staff).toEqual([
      {
        email: "tarodan@tarodan.com.tr",
        displayName: "tarodan",
        role: "super_admin",
      },
    ]);
  });

  it("rejects malformed input", () => {
    expect(() => parseUatAccounts(null)).toThrow(/expected an object/);
    expect(() => parseUatAccounts({ members: [] })).toThrow(/arrays/);
    expect(() =>
      parseUatAccounts({ members: [{ email: "not-an-email" }], staff: [] }),
    ).toThrow(/invalid email/);
  });

  it("rejects an unknown staff role", () => {
    expect(() =>
      parseUatAccounts({
        members: [],
        staff: [{ email: "a@tarodan.com.tr", role: "root" }],
      }),
    ).toThrow(/unknown admin role/);
  });

  it("keeps staff and member accounts strictly separate", () => {
    expect(() =>
      parseUatAccounts({
        members: [{ email: "a@tarodan.com.tr" }],
        staff: [{ email: "A@tarodan.com.tr", role: "super_admin" }],
      }),
    ).toThrow(/duplicate email/);
    expect(() =>
      parseUatAccounts({
        members: [{ email: "a@tarodan.com.tr" }, { email: "a@tarodan.com.tr" }],
        staff: [],
      }),
    ).toThrow(/duplicate email/);
  });

  it("refuses the platform service account", () => {
    expect(() =>
      parseUatAccounts({
        members: [{ email: "platform@tarodan.com" }],
        staff: [],
      }),
    ).toThrow(/platform service account/);
  });
});

describe("parseUatListings", () => {
  const members = ["nur@tarodan.com.tr"];
  const listing = {
    ownerEmail: "Nur@tarodan.com.tr",
    slug: "hot-wheels-ford-mustang-mach1-1971-1",
    imageAssetBase: "hot-wheels-ford-mustang-mach1-1971",
    status: "active",
    kind: "listing",
  };

  it("accepts a well-formed active listing and normalizes the owner", () => {
    expect(parseUatListings([listing], members)[0].ownerEmail).toBe(
      "nur@tarodan.com.tr",
    );
  });

  it("rejects an owner that is not a seeded member", () => {
    expect(() =>
      parseUatListings(
        [{ ...listing, ownerEmail: "x@tarodan.com.tr" }],
        members,
      ),
    ).toThrow(/not a seeded member/);
  });

  it("rejects duplicate slugs and non-active listings", () => {
    expect(() => parseUatListings([listing, listing], members)).toThrow(
      /duplicate slug/,
    );
    expect(() =>
      parseUatListings([{ ...listing, status: "inactive" }], members),
    ).toThrow(/active listings/);
  });

  it("rejects a slug the image step could not map to its asset base", () => {
    expect(() =>
      parseUatListings([{ ...listing, slug: "benim-mustang-ilanim" }], members),
    ).toThrow(/imageAssetBase/);
  });
});

describe("shipped UAT data files", () => {
  const accounts = parseUatAccounts(readData("uat", "accounts.json"));

  it("seeds exactly the agreed people", () => {
    expect(accounts.members.map((m) => m.email)).toEqual([
      "nur@tarodan.com.tr",
      "serhat@tarodan.com.tr",
    ]);
    expect(accounts.staff.map((s) => [s.email, s.role])).toEqual([
      ["tarodan@tarodan.com.tr", "super_admin"],
      ["developers@tarodan.com.tr", "super_admin"],
    ]);
  });

  it("keeps every member's starter listings within the free-tier quota", () => {
    const listings = parseUatListings(
      readData("uat", "listings.json"),
      accounts.members.map((m) => m.email),
    );
    const business = readData("launch", "business-config.json") as {
      membershipTiers: Array<{ type: string; maxFreeListings: number }>;
    };
    const free = business.membershipTiers.find((t) => t.type === "free");
    for (const member of accounts.members) {
      const owned = listings.filter((l) => l.ownerEmail === member.email);
      expect(owned.length).toBeGreaterThan(0);
      expect(owned.length).toBeLessThanOrEqual(free?.maxFreeListings ?? 0);
    }
  });

  it("builds listings only from the launch catalog", () => {
    const listings = readData("uat", "listings.json") as Array<
      Record<string, string | string[] | null>
    >;
    const slugs = (file: string) =>
      new Set(
        (readData("launch", file) as Array<{ slug: string }>).map(
          (row) => row.slug,
        ),
      );
    const categories = slugs("categories.json");
    const brands = slugs("brands.json");
    const models = slugs("car-models.json");
    const manufacturers = slugs("manufacturers.json");
    const attributes = new Set(
      (
        readData("launch", "attribute-groups.json") as Array<{
          values: Array<{ slug: string }>;
        }>
      ).flatMap((group) => group.values.map((value) => value.slug)),
    );
    for (const item of listings) {
      expect(categories.has(item.categorySlug as string)).toBe(true);
      expect(brands.has(item.brandSlug as string)).toBe(true);
      expect(models.has(item.carModelSlug as string)).toBe(true);
      expect(manufacturers.has(item.manufacturerSlug as string)).toBe(true);
      for (const slug of item.attributeSlugs as string[]) {
        expect(attributes.has(slug)).toBe(true);
      }
    }
  });
});

describe("UAT seed modes", () => {
  it("parses the run mode; --check wins over --accounts-only", () => {
    expect(parseUatSeedMode(["node", "seed-uat.js"])).toBe("full");
    expect(parseUatSeedMode(["node", "seed-uat.js", "--check"])).toBe("check");
    expect(parseUatSeedMode(["node", "seed-uat.js", "--accounts-only"])).toBe(
      "accountsOnly",
    );
    expect(
      parseUatSeedMode(["node", "seed-uat.js", "--accounts-only", "--check"]),
    ).toBe("check");
  });

  it("--check writes nothing", () => {
    expect(planUatSeedSteps("check")).toEqual({
      referenceData: false,
      accounts: false,
      warehouseAddress: false,
      starterListings: false,
    });
  });

  it("--accounts-only re-applies only the fixed accounts (production data stays)", () => {
    expect(planUatSeedSteps("accountsOnly")).toEqual({
      referenceData: false,
      accounts: true,
      warehouseAddress: false,
      starterListings: false,
    });
  });

  it("a full run (staging reset) writes everything", () => {
    expect(planUatSeedSteps("full")).toEqual({
      referenceData: true,
      accounts: true,
      warehouseAddress: true,
      starterListings: true,
    });
  });

  it("seed-uat.ts gates every non-account write behind its step", () => {
    const source = readFileSync(
      join(apiAppRoot(), "prisma", "seed-uat.ts"),
      "utf8",
    );
    const main = source.slice(source.indexOf("async function main"));
    const gate = (step: string, write: string) => {
      const at = main.indexOf(`if (steps.${step})`);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(main.indexOf(write));
    };
    gate("referenceData", "seedBusinessConfig(");
    gate("referenceData", "seedCommissionRuleSet(");
    gate("warehouseAddress", "seedWarehouseAddress(");
    gate("starterListings", "upsertSeedProduct(");
    expect(main).toContain("parseUatSeedMode(process.argv)");
  });
});
