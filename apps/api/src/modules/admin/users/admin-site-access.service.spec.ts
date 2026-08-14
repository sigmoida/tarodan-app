import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  AdminSiteAccessService,
  SITE_ACCESS_INVITE_TEMPLATE,
} from "./admin-site-access.service";

describe("AdminSiteAccessService", () => {
  let prisma: any;
  let pinService: any;
  let notifications: any;
  let audit: any;
  let service: AdminSiteAccessService;

  const basePin = {
    id: "pin-1",
    code: "ABCD2345",
    label: "Ayşe",
    email: "ayse@example.com",
    isActive: true,
  };

  beforeEach(() => {
    prisma = {
      siteAccessPin: {
        findUnique: jest.fn().mockResolvedValue(basePin),
        update: jest.fn().mockResolvedValue({ ...basePin }),
        delete: jest.fn().mockResolvedValue(basePin),
      },
      adminUser: { findFirst: jest.fn().mockResolvedValue({ id: "admin-1" }) },
    };
    pinService = {
      createWithUniqueCode: jest.fn().mockResolvedValue(basePin),
      normalizeCode: jest.fn((v: string) =>
        v.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      ),
    };
    notifications = {
      sendTemplateEmailToAddress: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };
    audit = { createAuditLog: jest.fn() };
    service = new AdminSiteAccessService(
      prisma,
      pinService,
      notifications,
      audit,
    );
  });

  describe("createPin", () => {
    it("creates with a generated code and audits", async () => {
      const pin = await service.createPin("user-1", { label: "Ayşe" });

      expect(pin).toEqual(basePin);
      expect(pinService.createWithUniqueCode).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Ayşe", email: null, maxUses: null }),
      );
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "site_access_pin.create",
        "SiteAccessPin",
        "pin-1",
        null,
        basePin,
      );
      expect(notifications.sendTemplateEmailToAddress).not.toHaveBeenCalled();
    });

    it("sends the invite immediately when sendEmail is set and email exists", async () => {
      await service.createPin("user-1", {
        label: "Ayşe",
        email: "ayse@example.com",
        sendEmail: true,
      });

      expect(notifications.sendTemplateEmailToAddress).toHaveBeenCalledWith(
        "ayse@example.com",
        SITE_ACCESS_INVITE_TEMPLATE,
        { name: "Ayşe", code: "ABCD2345" },
      );
      expect(prisma.siteAccessPin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pin-1" },
          data: { lastSentAt: expect.any(Date) },
        }),
      );
    });
  });

  describe("sendInvite", () => {
    it("rejects when the pin has no email", async () => {
      prisma.siteAccessPin.findUnique.mockResolvedValue({
        ...basePin,
        email: null,
      });

      await expect(
        service.sendInvite("user-1", "pin-1"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(notifications.sendTemplateEmailToAddress).not.toHaveBeenCalled();
    });

    it("404s for an unknown pin", async () => {
      prisma.siteAccessPin.findUnique.mockResolvedValue(null);
      await expect(service.sendInvite("user-1", "nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("sends the template email and stamps lastSentAt", async () => {
      await service.sendInvite("user-1", "pin-1");

      expect(notifications.sendTemplateEmailToAddress).toHaveBeenCalledWith(
        "ayse@example.com",
        SITE_ACCESS_INVITE_TEMPLATE,
        { name: "Ayşe", code: "ABCD2345" },
      );
      expect(prisma.siteAccessPin.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastSentAt: expect.any(Date) } }),
      );
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "site_access_pin.send_invite",
        "SiteAccessPin",
        "pin-1",
        null,
        { email: "ayse@example.com" },
      );
    });
  });

  describe("updatePin", () => {
    it("revokes via isActive:false and audits old/new", async () => {
      const revoked = { ...basePin, isActive: false };
      prisma.siteAccessPin.update.mockResolvedValue(revoked);

      const result = await service.updatePin("user-1", "pin-1", {
        isActive: false,
      });

      expect(result).toEqual(revoked);
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "site_access_pin.update",
        "SiteAccessPin",
        "pin-1",
        basePin,
        revoked,
      );
    });

    it("404s for an unknown pin", async () => {
      prisma.siteAccessPin.findUnique.mockResolvedValue(null);
      await expect(
        service.updatePin("user-1", "nope", { label: "x" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("deletePin", () => {
    it("hard deletes and audits", async () => {
      await expect(service.deletePin("user-1", "pin-1")).resolves.toEqual({
        success: true,
      });
      expect(prisma.siteAccessPin.delete).toHaveBeenCalledWith({
        where: { id: "pin-1" },
      });
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "site_access_pin.delete",
        "SiteAccessPin",
        "pin-1",
        basePin,
        null,
      );
    });
  });
});
