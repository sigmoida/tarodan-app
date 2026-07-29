import { GUARDS_METADATA } from "@nestjs/common/constants";
import { CategoryController } from "../../category/category.controller";
import { MembershipController } from "../../membership/membership.controller";
import { NotificationController } from "../../notification/notification.controller";
import { SearchController } from "../../search/search.controller";
import { SecurityController } from "../../security/security.controller";
import { IS_ADMIN_ROUTE_KEY } from "../decorators/admin-route.decorator";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { RolesGuard } from "./roles.guard";

describe("non-canonical admin route guards", () => {
  const cases: Array<{
    controller: any;
    method: string;
    permission: string;
  }> = [
    {
      controller: MembershipController,
      method: "getAllTiersAdmin",
      permission: "membership_tiers",
    },
    {
      controller: MembershipController,
      method: "createTier",
      permission: "membership_tiers",
    },
    {
      controller: MembershipController,
      method: "updateTier",
      permission: "membership_tiers",
    },
    {
      controller: CategoryController,
      method: "create",
      permission: "categories",
    },
    {
      controller: CategoryController,
      method: "update",
      permission: "categories",
    },
    {
      controller: CategoryController,
      method: "remove",
      permission: "categories",
    },
    {
      controller: SearchController,
      method: "reindexAll",
      permission: "products",
    },
    {
      controller: SearchController,
      method: "indexProduct",
      permission: "products",
    },
    {
      controller: NotificationController,
      method: "getProviderStatus",
      permission: "notifications",
    },
    {
      controller: SecurityController,
      method: "getAdminSessions",
      permission: "settings",
    },
    {
      controller: SecurityController,
      method: "terminateAdminSession",
      permission: "settings",
    },
    {
      controller: SecurityController,
      method: "terminateAllAdminSessions",
      permission: "settings",
    },
  ];

  it.each(cases)(
    "protects $controller.name.$method with admin JWT, role and permission guards",
    ({ controller, method, permission }) => {
      const handler = controller.prototype[method];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

      expect(Reflect.getMetadata(IS_ADMIN_ROUTE_KEY, handler)).toBe(true);
      expect(guards).toEqual(
        expect.arrayContaining([AdminJwtAuthGuard, RolesGuard]),
      );
      expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe(permission);
    },
  );
});
