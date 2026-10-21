import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  ParseUUIDPipe,
  UnauthorizedException,
  ValidationPipe,
  type PipeTransform,
} from "@nestjs/common";
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { IS_ADMIN_ROUTE_KEY } from "../../../auth/decorators/admin-route.decorator";
import { IS_PUBLIC_KEY } from "../../../auth/decorators/public.decorator";
import { PERMISSION_KEY } from "../../../auth/decorators/require-permission.decorator";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../../common/validators/global-validation-pipe-options";
import { AdminSignInMethodEventsQueryDto } from "../../dto/admin-sign-in-method-events-query.dto";
import { AdminUserSignInMethodsController } from "./admin-user-sign-in-methods.controller";

/**
 * Authorization of the admin sign-in methods read (security data). Pinned on
 * the real decorators and guards, so a silently changed decorator breaks it.
 */
describe("AdminUserSignInMethodsController authorization", () => {
  const USER_ID = "00000000-0000-4000-8000-000000000001";
  const handlers = [
    ["getSignInMethods", `/api/admin/users/${USER_ID}/sign-in-methods`],
    ["listEvents", `/api/admin/users/${USER_ID}/sign-in-methods/events`],
  ] as const;
  type Handler = (typeof handlers)[number][0];

  /** RolesGuard with the stored permission matrix (null: the defaults). */
  const rolesGuard = (matrix: Record<string, string[]> | null = null) =>
    new RolesGuard(new Reflector(), {
      platformSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            matrix ? { settingValue: JSON.stringify(matrix) } : null,
          ),
      },
    } as never);

  const context = (
    handler: Handler,
    url: string,
    user: Record<string, unknown> | undefined,
  ): ExecutionContext =>
    ({
      getHandler: () => AdminUserSignInMethodsController.prototype[handler],
      getClass: () => AdminUserSignInMethodsController,
      switchToHttp: () => ({
        getRequest: () => ({ user, method: "GET", originalUrl: url }),
      }),
    }) as unknown as ExecutionContext;

  it("is an admin route behind the admin JWT guard and RolesGuard, never public", () => {
    const guards: Array<{ name: string }> =
      Reflect.getMetadata(GUARDS_METADATA, AdminUserSignInMethodsController) ??
      [];
    expect(guards.map((g) => g.name)).toEqual([
      AdminJwtAuthGuard.name,
      RolesGuard.name,
    ]);
    expect(
      Reflect.getMetadata(IS_ADMIN_ROUTE_KEY, AdminUserSignInMethodsController),
    ).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AdminUserSignInMethodsController),
    ).toBeUndefined();
    for (const [handler] of handlers) {
      const fn = AdminUserSignInMethodsController.prototype[handler];
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, fn)).toBeUndefined();
    }
  });

  it.each(handlers)(
    "%s takes the staff roles and the users permission itself",
    (handler) => {
      const fn = AdminUserSignInMethodsController.prototype[handler];
      expect(Reflect.getMetadata(ROLES_KEY, fn)).toEqual([
        AdminRole.super_admin,
        AdminRole.admin,
        AdminRole.moderator,
      ]);
      expect(Reflect.getMetadata(PERMISSION_KEY, fn)).toBe("users");
    },
  );

  it("a customer session is refused by the admin JWT guard", () => {
    const guard = new AdminJwtAuthGuard(new Reflector());
    expect(() =>
      guard.handleRequest(null, { id: "u1", isAdmin: false }, undefined),
    ).toThrow(UnauthorizedException);
    expect(() => guard.handleRequest(null, false, undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it.each(handlers)(
    "%s: a request without an admin user is refused by RolesGuard",
    async (handler, url) => {
      await expect(
        rolesGuard().canActivate(context(handler, url, undefined)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        rolesGuard().canActivate(
          context(handler, url, { id: "u1", isAdmin: false }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(
    handlers.flatMap(([handler, url]) =>
      [AdminRole.super_admin, AdminRole.admin, AdminRole.moderator].map(
        (role) => [handler, url, role] as const,
      ),
    ),
  )("%s: %s %s passes with the default matrix", async (handler, url, role) => {
    await expect(
      rolesGuard().canActivate(context(handler, url, { isAdmin: true, role })),
    ).resolves.toBe(true);
  });

  it.each(handlers)(
    "%s: a role without the users permission is refused",
    async (handler, url) => {
      const matrix = { admin: ["orders"], moderator: ["support"] };
      for (const role of [AdminRole.admin, AdminRole.moderator]) {
        await expect(
          rolesGuard(matrix).canActivate(
            context(handler, url, { isAdmin: true, role }),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
    },
  );

  it.each(handlers)(
    "%s: seller_performance alone does not open it (the users segment would)",
    async (handler, url) => {
      await expect(
        rolesGuard({ moderator: ["seller_performance"] }).canActivate(
          context(handler, url, { isAdmin: true, role: AdminRole.moderator }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});

/** Request validation in front of the service: the id and the paging query. */
describe("AdminUserSignInMethodsController request validation", () => {
  const USER_ID = "00000000-0000-4000-8000-000000000001";
  const handlerNames = ["getSignInMethods", "listEvents"] as const;

  /** The pipes Nest runs on the `:id` route parameter of a handler. */
  const idPipes = (handler: (typeof handlerNames)[number]): PipeTransform[] => {
    const args: Record<string, { data?: string; pipes: PipeTransform[] }> =
      Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        AdminUserSignInMethodsController,
        handler,
      ) ?? {};
    return Object.values(args).find((arg) => arg.data === "id")?.pipes ?? [];
  };

  it.each(handlerNames)(
    "%s refuses a non-UUID id with 400 before the service runs",
    async (handler) => {
      const pipes = idPipes(handler);
      expect(pipes).toHaveLength(1);
      expect(pipes[0]).toBeInstanceOf(ParseUUIDPipe);
      const metadata = { type: "param", data: "id" } as const;
      await expect(
        pipes[0].transform("not-a-uuid", metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipes[0].transform("1 OR 1=1", metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(pipes[0].transform(USER_ID, metadata)).resolves.toBe(
        USER_ID,
      );
    },
  );

  describe("events query (the global ValidationPipe settings)", () => {
    const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
    const parse = (query: Record<string, string>) =>
      pipe.transform(query, {
        type: "query",
        metatype: AdminSignInMethodEventsQueryDto,
        data: "",
      });

    it("is the query type of listEvents", () => {
      const paramTypes: unknown[] = Reflect.getMetadata(
        "design:paramtypes",
        AdminUserSignInMethodsController.prototype,
        "listEvents",
      );
      expect(paramTypes[1]).toBe(AdminSignInMethodEventsQueryDto);
    });

    it("defaults to page 1 and 20 rows", async () => {
      await expect(parse({})).resolves.toEqual({ page: 1, limit: 20 });
    });

    it("keeps only page and limit: sort, search and date filters are dropped", async () => {
      await expect(
        parse({
          page: "2",
          limit: "500",
          sortBy: "ipAddress",
          sortOrder: "asc",
          sortType: "text",
          search: "203.0.113.7",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          eventType: "failed_login",
        }),
      ).resolves.toEqual({ page: 2, limit: 500 });
    });

    it.each([
      ["limit", "501"],
      ["limit", "0"],
      ["limit", "abc"],
      ["page", "0"],
      ["page", "-1"],
    ])("refuses %s=%s with 400", async (key, value) => {
      await expect(parse({ [key]: value })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
