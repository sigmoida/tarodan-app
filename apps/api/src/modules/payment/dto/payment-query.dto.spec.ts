import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PaymentQueryDto } from "./payment-query.dto";

// TARODAN-API-1M: `status=paid` (bir OrderStatus) doğrulanmadan Prisma'ya
// geçince 500 dönüyordu; artık DTO 400 ile reddeder.
describe("PaymentQueryDto", () => {
  const parse = (q: Record<string, string>) =>
    plainToInstance(PaymentQueryDto, q);
  const failing = async (q: Record<string, string>) =>
    (await validate(parse(q))).map((e) => e.property).sort();

  it("accepts a valid PaymentStatus", async () => {
    expect(await failing({ status: "completed", limit: "50" })).toEqual([]);
  });

  it("rejects an OrderStatus value such as paid", async () => {
    expect(await failing({ status: "paid", limit: "50" })).toEqual(["status"]);
  });

  it("rejects a limit above 100 and a malformed date", async () => {
    expect(await failing({ limit: "500", startDate: "yesterday" })).toEqual([
      "limit",
      "startDate",
    ]);
  });

  it("rejects fractional page/limit (Prisma skip/take need Int)", async () => {
    expect(await failing({ page: "1.3", limit: "2.5" })).toEqual([
      "limit",
      "page",
    ]);
  });

  it("treats blank query values as unset instead of failing", async () => {
    const q = {
      status: "",
      provider: " ",
      startDate: "",
      endDate: "",
      page: "",
      limit: "",
    };
    expect(await failing(q)).toEqual([]);
    expect(parse(q)).toEqual({});
  });
});
