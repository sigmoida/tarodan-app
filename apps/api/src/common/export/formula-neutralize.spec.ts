import { neutralizeFormula } from "./formula-neutralize";

describe("neutralizeFormula", () => {
  /**
   * Elektronik tablo `=`, `+`, `-`, `@`, sekme ve satır başıyla başlayan
   * hücreyi formül sayar. Kullanıcının yazdığı bir başlık dosyayı açan kişinin
   * makinesinde çalışmamalı.
   */
  it("formül başlatan karakterleri tek tırnakla metne sabitler", () => {
    expect(neutralizeFormula('=HYPERLINK("http://kotu.site","tikla")')).toBe(
      `'=HYPERLINK("http://kotu.site","tikla")`,
    );
    expect(neutralizeFormula("+1-555")).toBe("'+1-555");
    expect(neutralizeFormula("-2+3")).toBe("'-2+3");
    expect(neutralizeFormula("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(neutralizeFormula("\tgizli")).toBe("'\tgizli");
    expect(neutralizeFormula("\rgizli")).toBe("'\rgizli");
  });

  it("sıradan metne dokunmaz", () => {
    expect(neutralizeFormula("Ford Mustang 1967")).toBe("Ford Mustang 1967");
    expect(neutralizeFormula("Yılmaz, Ltd.")).toBe("Yılmaz, Ltd.");
    expect(neutralizeFormula("")).toBe("");
  });
});
