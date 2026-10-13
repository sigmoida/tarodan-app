import {
  hasProfanity,
  maskAmbiguousProfanity,
  scanProfanity,
  trLowerCase,
} from "./profanity";

/**
 * Regresyon: kalıplar `i` bayraklıydı (`u`'suz) — İ/ı katlanmıyordu. "SİKTİR",
 * "İBNE", "ŞEREFSİZ" kaçıyor; "sık sık" ("SIK SIK"), "8 am" ve "SIKIŞIK"
 * meşru metinler küfür sayılıyordu.
 */
describe("profanity", () => {
  describe("trLowerCase", () => {
    it("İ→i, I→ı ve uzunluğu korur", () => {
      expect(trLowerCase("SİKTİR")).toBe("siktir");
      expect(trLowerCase("SIK")).toBe("sık");
      expect(trLowerCase("ÇĞÖŞÜ")).toBe("çğöşü");
      for (const text of ["İİ", "Iı", "Şİ", "😀A"]) {
        expect(trLowerCase(text)).toHaveLength(text.length);
      }
    });
  });

  describe("güçlü küfür (belirsiz olmayan)", () => {
    it.each([
      "SİKTİR",
      "Siktir git",
      "İBNE",
      "ŞEREFSİZ",
      "serefsiz",
      "orospu çocuğu",
      "OROSPU",
      "AMINA KOYAYIM",
      "amına koyayım",
      "yavsak",
      "SÜRTÜK",
      "sana göt",
    ])("%s", (text) => {
      expect(scanProfanity(text).strong).toBe(true);
    });
  });

  describe("meşru metin küfür sayılmaz", () => {
    it.each([
      "Fiyatın tamamını nakit öderim",
      "Tamamcık, anlaştık",
      "KUTU SIKIŞIK",
      "kutu sıkışık",
      "canım sıkık",
      // "sıktır" (sıktırmak) ile "siktir" büyük harf ASCII'de ayrışmaz; sik
      // ailesi yalnız doğru yazılmış metinde güçlüdür, sert reddedilmez.
      "SIKTIR",
    ])("%s", (text) => {
      const scan = scanProfanity(text);
      expect(scan.strong).toBe(false);
      expect(scan.ambiguous).toEqual([]);
    });

    it("'götür' tam kelime olmadığından yakalanmaz", () => {
      expect(scanProfanity("bunu götür").strong).toBe(false);
    });
  });

  describe("belirsiz kısa kökler", () => {
    it.each([
      [
        "sik sik kullanildi",
        [
          [0, 3],
          [4, 7],
        ],
      ],
      [
        "SIK SIK kullanıldı",
        [
          [0, 3],
          [4, 7],
        ],
      ],
      ["8 am teslim", [[2, 4]]],
    ])("%s", (text, expected) => {
      const scan = scanProfanity(text);
      expect(scan.strong).toBe(false);
      expect(scan.ambiguous).toEqual(expected);
    });

    it("maskeler, güçlü küfür ve diğer metne dokunmaz", () => {
      expect(maskAmbiguousProfanity("8 am teslim")).toBe("8 *** teslim");
      expect(maskAmbiguousProfanity("SIK SIK kullanıldı")).toBe(
        "*** *** kullanıldı",
      );
      expect(maskAmbiguousProfanity("temiz metin")).toBe("temiz metin");
    });

    it("kelime içinde eşleşmez", () => {
      expect(scanProfanity("amper sıkıntı Siki").ambiguous).toEqual([]);
    });
  });

  describe("hasProfanity", () => {
    it("güçlü ya da belirsiz eşleşmede true, temizde false", () => {
      expect(hasProfanity("SİKTİR")).toBe(true);
      expect(hasProfanity("8 am")).toBe(true);
      expect(hasProfanity("merhaba")).toBe(false);
      expect(hasProfanity(null)).toBe(false);
    });
  });
});
