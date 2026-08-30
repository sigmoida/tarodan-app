import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { RegisterDto } from "./register.dto";

/**
 * DOĞUM TARİHİ OPSİYONEL — App Store Review 5.1.1(v) (16 Tem 2026).
 *
 * Apple reddi: "uygulama, çekirdek işlevi için doğrudan gerekli olmayan kişisel
 * bilgiyi zorunlu tutuyor — Date of Birth". Pazar yerinin kayıt akışı doğum
 * tarihi olmadan çalıştığı için alan zorunluluktan çıkarıldı.
 *
 * Bu test iki yönü birden kilitler: alan GÖNDERİLMEZSE kayıt geçerli olmalı,
 * GÖNDERİLİRSE 18+ ve tarih biçimi kuralları hâlâ işlemeli. Yalnız DTO
 * doğrulaması sınanır — Prisma/servis bağımlılığı yok.
 */
const base = {
  username: "gorkemtest",
  email: "test@demo.com",
  displayName: "Test Kullanıcı",
  password: "Demo1234",
};

const errorsFor = (payload: Record<string, unknown>) =>
  validateSync(plainToInstance(RegisterDto, payload), {
    whitelist: true,
  });

const birthDateErrors = (payload: Record<string, unknown>) =>
  errorsFor(payload).filter((e) => e.property === "birthDate");

describe("RegisterDto — doğum tarihi opsiyonel", () => {
  it("alan hiç gönderilmezse geçerlidir", () => {
    expect(errorsFor(base)).toHaveLength(0);
  });

  it("geçerli bir 18+ tarih gönderilirse geçerlidir", () => {
    expect(errorsFor({ ...base, birthDate: "1990-01-15" })).toHaveLength(0);
  });

  it("18 yaşından küçük tarih hâlâ reddedilir", () => {
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 10);
    const errors = birthDateErrors({
      ...base,
      birthDate: recent.toISOString().slice(0, 10),
    });
    expect(errors).toHaveLength(1);
  });

  it("bozuk biçimli tarih hâlâ reddedilir", () => {
    expect(birthDateErrors({ ...base, birthDate: "15/01/1990" })).toHaveLength(
      1,
    );
  });
});
