import { PATH_METADATA } from "@nestjs/common/constants";
import { IS_ADMIN_ROUTE_KEY } from "../../auth/decorators/admin-route.decorator";
import { AdminModule } from "../admin.module";

/**
 * SÖZLEŞME: `admin/*` altındaki her controller @AdminRoute() taşımalı.
 *
 * Global JwtAuthGuard normal kullanıcının `access_token` cookie'sini bekler;
 * admin oturumunda yalnız `admin_token` vardır. @AdminRoute() olmayan bir admin
 * controller'ının HER isteği global guard'da 401 yer ve panel o sayfada
 * "expired=session" ile login'e atar (yaşandı: /system/media — medya tarayıcısı
 * eklenirken dekoratör unutulmuştu, route'a her giriş oturumu düşürüyordu).
 * Bu test AdminModule'e eklenen yeni controller'ları otomatik kapsar.
 */
describe("admin controllers carry @AdminRoute()", () => {
  const controllers: Array<new (...args: never[]) => unknown> =
    Reflect.getMetadata("controllers", AdminModule) ?? [];

  it("finds the admin module controllers", () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  it("every admin/* controller skips the global user guard via @AdminRoute()", () => {
    const missing = controllers
      .filter((ctrl) => {
        const path = Reflect.getMetadata(PATH_METADATA, ctrl) as
          string | undefined;
        return typeof path === "string" && path.startsWith("admin");
      })
      .filter((ctrl) => !Reflect.getMetadata(IS_ADMIN_ROUTE_KEY, ctrl))
      .map((ctrl) => ctrl.name);

    expect(missing).toEqual([]);
  });
});
