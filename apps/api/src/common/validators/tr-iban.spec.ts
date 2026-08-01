import { validate } from "class-validator";
import { isValidTrIban } from "./tr-iban";
import { UpsertBankAccountDto } from "../../modules/user/dto/bank-account.dto";

/**
 * IBAN doğrulaması SUNUCUDA da mod-97 içermeli. Eskiden DTO yalnız
 * `^TR\d{24}$` regex'i kontrol ediyordu: web'i atlayan bir istemci TR + 24
 * rastgele rakamı kaydedebiliyor, hata ancak payout gününde (Y4 kontrolü)
 * ortaya çıkıyordu. Tek kaynak: isValidTrIban (payout servisi de bunu kullanır).
 */

const VALID_IBAN = "TR330006100519786457841326";
const BAD_CHECKSUM_IBAN = "TR330006100519786457841327";

describe("isValidTrIban", () => {
  it("accepts a checksum-valid TR IBAN (spaces/lowercase normalized)", () => {
    expect(isValidTrIban(VALID_IBAN)).toBe(true);
    expect(isValidTrIban("tr33 0006 1005 1978 6457 8413 26")).toBe(true);
  });

  it("rejects a checksum-invalid IBAN (rastgele rakam girişi)", () => {
    expect(isValidTrIban(BAD_CHECKSUM_IBAN)).toBe(false);
  });

  it("rejects wrong length, non-TR and empty input", () => {
    expect(isValidTrIban("TR33000610051978645784132")).toBe(false);
    expect(isValidTrIban("DE89370400440532013000")).toBe(false);
    expect(isValidTrIban("")).toBe(false);
  });
});

describe("UpsertBankAccountDto iban validation", () => {
  function makeDto(iban: string): UpsertBankAccountDto {
    const dto = new UpsertBankAccountDto();
    dto.accountHolder = "Ahmet Yılmaz";
    dto.iban = iban;
    return dto;
  }

  it("accepts a checksum-valid TR IBAN", async () => {
    const errors = await validate(makeDto(VALID_IBAN));
    expect(errors).toHaveLength(0);
  });

  it("rejects a regex-matching but checksum-invalid IBAN", async () => {
    const errors = await validate(makeDto(BAD_CHECKSUM_IBAN));
    expect(errors.some((e) => e.property === "iban")).toBe(true);
  });

  it("rejects an empty iban (boş bırakıp kaydetme engeli)", async () => {
    const errors = await validate(makeDto(""));
    expect(errors.some((e) => e.property === "iban")).toBe(true);
  });
});
