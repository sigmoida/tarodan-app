import { BadRequestException, NotFoundException } from "@nestjs/common";
import { pickSellerTrustFormulaParams } from "@tarodan/types";
import { TRUST_FORMULA_V1 } from "../../../seller-trust/helpers/trust-formula.constants";
import { SELLER_TRUST_GOLDEN_V1 } from "../../../seller-trust/helpers/trust-golden-v1";
import { candidateParamsHash } from "../../../seller-trust/lab/lab-request.helper";
import { AdminSellerTrustLabService } from "./admin-seller-trust-lab.service";

/**
 * The lab's admin side: the request is validated before any read, every
 * real-data call writes one audit row naming the actor, and a failed audit
 * write returns no result (fail closed, AC-A12). The scenario calculator
 * reads no real data and is not audited (D4).
 */
describe("AdminSellerTrustLabService", () => {
  const v1 = () => pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
  const sellerResult = { userId: "u1" };
  const populationResult = { summary: { rowsRead: 12 } };

  const build = () => {
    const lab = {
      params: jest.fn(() => ({ formulaVersion: 1 })),
      scenarios: jest.fn(() => []),
      scenario: jest.fn(() => ({ v1: {}, candidate: null })),
      seller: jest.fn().mockResolvedValue(sellerResult),
      population: jest.fn().mockResolvedValue(populationResult),
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminSellerTrustLabService(
      lab as never,
      audit as never,
    );
    return { service, lab, audit };
  };

  describe("seller", () => {
    it("audits the actor, the seller and the numeric request, then returns the result", async () => {
      const t = build();
      await expect(
        t.service.seller("admin-user", "u1", { asOf: "stored", params: v1() }),
      ).resolves.toBe(sellerResult);
      expect(t.lab.seller).toHaveBeenCalledWith("u1", "stored", v1());
      expect(t.audit.createRequiredAuditLog).toHaveBeenCalledTimes(1);
      expect(t.audit.createRequiredAuditLog).toHaveBeenCalledWith(
        "admin-user",
        "seller_trust_lab_seller",
        "user",
        "u1",
        null,
        {
          asOf: "stored",
          candidate: true,
          paramsHash: candidateParamsHash(v1()),
        },
      );
    });

    it("defaults to now without a candidate", async () => {
      const t = build();
      await t.service.seller("admin-user", "u1", {});
      expect(t.lab.seller).toHaveBeenCalledWith("u1", "now", null);
      expect(t.audit.createRequiredAuditLog.mock.calls[0][5]).toEqual({
        asOf: "now",
        candidate: false,
        paramsHash: null,
      });
    });

    it("refuses invalid params before any read and writes no audit row", async () => {
      const t = build();
      await expect(
        t.service.seller("admin-user", "u1", {
          params: { ...v1(), windows: { ratingDays: 1 } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(t.lab.seller).not.toHaveBeenCalled();
      expect(t.audit.createRequiredAuditLog).not.toHaveBeenCalled();
    });

    it("returns no result when the audit write fails", async () => {
      const t = build();
      t.audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));
      await expect(t.service.seller("admin-user", "u1", {})).rejects.toThrow(
        "audit down",
      );
    });

    it("writes no audit row for an unknown user (nothing was shown)", async () => {
      const t = build();
      t.lab.seller.mockRejectedValue(new NotFoundException());
      await expect(
        t.service.seller("admin-user", "u1", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(t.audit.createRequiredAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("population", () => {
    it("audits the params, the normalised filters and the rows read", async () => {
      const t = build();
      await expect(
        t.service.population("admin-user", {
          params: v1(),
          filters: { levels: [], minTransactions: 5 },
        }),
      ).resolves.toBe(populationResult);
      expect(t.lab.population).toHaveBeenCalledWith(v1(), {
        minTransactions: 5,
      });
      expect(t.audit.createRequiredAuditLog).toHaveBeenCalledWith(
        "admin-user",
        "seller_trust_lab_population",
        "seller_trust_scores",
        "population",
        null,
        { params: v1(), filters: { minTransactions: 5 }, rowsRead: 12 },
      );
    });

    it("requires params", async () => {
      const t = build();
      await expect(
        t.service.population("admin-user", { params: undefined }),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          i18nKey: "server.sellerTrustLab.invalidParams",
          i18nParams: { field: "params" },
        },
      });
      expect(t.lab.population).not.toHaveBeenCalled();
    });

    it("returns no result when the audit write fails", async () => {
      const t = build();
      t.audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));
      await expect(
        t.service.population("admin-user", { params: v1() }),
      ).rejects.toThrow("audit down");
    });
  });

  describe("params, scenarios and scenario", () => {
    it("write no audit row", async () => {
      const t = build();
      t.service.params();
      t.service.scenarios();
      t.service.scenario({ inputs: SELLER_TRUST_GOLDEN_V1[1].inputs });
      expect(t.lab.scenario).toHaveBeenCalledWith(
        SELLER_TRUST_GOLDEN_V1[1].inputs,
        null,
      );
      expect(t.audit.createRequiredAuditLog).not.toHaveBeenCalled();
    });

    it("refuses invalid scenario inputs", () => {
      const t = build();
      expect(() =>
        t.service.scenario({ inputs: { raters: Number.NaN } }),
      ).toThrow(BadRequestException);
      expect(t.lab.scenario).not.toHaveBeenCalled();
    });
  });
});
