import { escrowReleaseAtOf } from "./order-escrow-release";

describe("escrowReleaseAtOf", () => {
  const EARLY = new Date("2026-10-16T10:00:00.000Z");
  const LATE = new Date("2026-10-31T10:00:00.000Z");

  it("bekleyen hold'un damgalı serbest bırakma tarihini döner", () => {
    expect(escrowReleaseAtOf([{ status: "held", releaseAt: EARLY }])).toBe(
      EARLY,
    );
  });

  it("birden çok bekleyen hold varsa en geç tarihi döner", () => {
    expect(
      escrowReleaseAtOf([
        { status: "held", releaseAt: EARLY },
        { status: "held", releaseAt: LATE },
      ]),
    ).toBe(LATE);
  });

  it("serbest bırakılmış ya da iptal edilmiş hold sayılmaz", () => {
    expect(
      escrowReleaseAtOf([
        { status: "released", releaseAt: LATE },
        { status: "cancelled", releaseAt: LATE },
      ]),
    ).toBeNull();
  });

  it("tarihi henüz yazılmamış hold (teslim edilmedi) null döner", () => {
    expect(escrowReleaseAtOf([{ status: "held", releaseAt: null }])).toBeNull();
  });

  it("hold yoksa ya da ilişki yüklenmemişse null döner", () => {
    expect(escrowReleaseAtOf([])).toBeNull();
    expect(escrowReleaseAtOf(undefined)).toBeNull();
    expect(escrowReleaseAtOf(null)).toBeNull();
  });
});
