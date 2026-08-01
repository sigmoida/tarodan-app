import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { AdminModule } from "../../admin/admin.module";
import { PERMISSION_MAP, ROLE_ONLY_ADMIN_SEGMENTS } from "./roles.guard";

/**
 * SÖZLEŞME: kanonik `/api/admin/<segment>` route'larının HER segmenti ya izin
 * matrisinde (PERMISSION_MAP) ya da bilinçli rol-only istisna listesinde
 * (ROLE_ONLY_ADMIN_SEGMENTS) olmalı.
 *
 * Eşlenmemiş segment guard'da fail-closed'a düşer: super_admin dışındaki HERKES
 * 403 alır. Menü sayfayı gösterdiği için bu sessiz bir kırıklıktır — yaşandı:
 * ad-packages / finance / refund-attempts uçları eklendi ama haritaya
 * yazılmadı, `admin` rolü kendi menüsündeki sayfalarda 403 yiyordu.
 *
 * Test hem sınıf yolunu (@Controller("admin/x")) hem de `@Controller("admin")`
 * altındaki metod yollarının ilk segmentini (@Get("finance/overview")) tarar.
 */
describe("PERMISSION_MAP, admin route segmentlerinin tamamını kapsar", () => {
  const controllers: Array<new (...args: never[]) => unknown> =
    Reflect.getMetadata("controllers", AdminModule) ?? [];

  /** Bir controller'ın ürettiği kanonik admin segmentleri. */
  const segmentsOf = (ctrl: new (...args: never[]) => unknown): string[] => {
    const base = (Reflect.getMetadata(PATH_METADATA, ctrl) as string) ?? "";
    const cleanBase = base.replace(/^\/+/, "");
    if (!cleanBase.startsWith("admin")) return [];

    const afterAdmin = cleanBase.split("/").filter(Boolean).slice(1);
    // @Controller("admin/media") → segment sınıf yolundan gelir.
    if (afterAdmin.length > 0) return [afterAdmin[0]];

    // @Controller("admin") → segment her metodun kendi yolundan gelir.
    const proto = ctrl.prototype as Record<string, unknown>;
    const segments = new Set<string>();
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      const handler = proto[name];
      if (typeof handler !== "function") continue;
      if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const methodPath = (Reflect.getMetadata(PATH_METADATA, handler) ??
        "") as string;
      const seg = methodPath.replace(/^\/+/, "").split("/").filter(Boolean)[0];
      // Parametreyle başlayan yol (":id") kendi segmentini üretmez.
      if (seg && !seg.startsWith(":")) segments.add(seg);
    }
    return [...segments];
  };

  it("tarayacak controller bulur", () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  it("eşlenmemiş (fail-closed olacak) admin segmenti yok", () => {
    const unmapped = new Set<string>();
    for (const ctrl of controllers) {
      for (const seg of segmentsOf(ctrl)) {
        if (!PERMISSION_MAP[seg] && !ROLE_ONLY_ADMIN_SEGMENTS.has(seg)) {
          unmapped.add(seg);
        }
      }
    }
    expect([...unmapped].sort()).toEqual([]);
  });
});
