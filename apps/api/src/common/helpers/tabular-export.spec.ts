import {
  csvField,
  neutralizeFormula,
  renderSheet,
  toCsv,
} from "./tabular-export";

describe("csvField", () => {
  /**
   * Eski raporlar alanları hiç tırnaklamıyordu. Adında virgül olan bir satıcı
   * ("Mehmet Yılmaz, Ltd.") dosyanın o satırındaki BÜTÜN kolonları kaydırıyor,
   * açıklamasında satır sonu olan bir kayıt ikiye bölünüyordu.
   */
  it("virgül içeren alanı sarar", () => {
    expect(csvField("Yılmaz, Ltd.")).toBe('"Yılmaz, Ltd."');
  });

  it("satır sonu içeren alanı sarar", () => {
    expect(csvField("iki\nsatır")).toBe('"iki\nsatır"');
  });

  it("tırnağı ikiler ve alanı sarar", () => {
    expect(csvField('12" jant')).toBe('"12"" jant"');
  });

  it("zararsız alanı olduğu gibi bırakır", () => {
    expect(csvField("Ankara")).toBe("Ankara");
  });

  it("boş değerleri boş hücre yapar", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("sayıyı tırnaklamaz", () => {
    expect(csvField(1250.5)).toBe("1250.5");
  });
});

describe("neutralizeFormula", () => {
  /**
   * Excel ve Google Sheets `=`, `+`, `-`, `@` ile başlayan hücreyi FORMÜL
   * sayar. Kullanıcının yazdığı bir ilan başlığı, dosyayı açan yöneticinin
   * makinesinde çalışan bir komuta dönüşebilir (CSV injection).
   */
  it("formül başlangıcını metne sabitler", () => {
    expect(neutralizeFormula('=HYPERLINK("http://kotu.site","tikla")')).toBe(
      '\'=HYPERLINK("http://kotu.site","tikla")',
    );
    expect(neutralizeFormula("+1-555")).toBe("'+1-555");
    expect(neutralizeFormula("-2+3")).toBe("'-2+3");
    expect(neutralizeFormula("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(neutralizeFormula("\tgizli")).toBe("'\tgizli");
  });

  it("normal metne dokunmaz", () => {
    expect(neutralizeFormula("Ford Mustang 1967")).toBe("Ford Mustang 1967");
  });

  it("CSV alanında da uygulanır", () => {
    expect(csvField("=1+1")).toBe("'=1+1");
  });
});

describe("toCsv", () => {
  const sheet = renderSheet(
    "topSellers",
    [
      {
        header: "label",
        value: (row: { label: string; gmv: number }) => row.label,
      },
      {
        header: "gmv",
        value: (row: { label: string; gmv: number }) => row.gmv,
      },
    ],
    [
      { label: "Yılmaz, Ltd.", gmv: 1250.5 },
      { label: "=cmd|' /C calc'!A0", gmv: 0 },
    ],
  );

  it("Excel'in UTF-8'i tanıması için BOM ile başlar", () => {
    expect(toCsv([sheet]).startsWith("﻿")).toBe(true);
  });

  it("başlık ve satırları kaçışlı yazar", () => {
    const lines = toCsv([sheet]).split("\r\n");

    expect(lines[0]).toBe("﻿topSellers");
    expect(lines[1]).toBe("label,gmv");
    expect(lines[2]).toBe('"Yılmaz, Ltd.",1250.5');
    expect(lines[3]).toBe("'=cmd|' /C calc'!A0,0");
  });

  it("birden çok sayfayı boş satırla ayırır", () => {
    const other = renderSheet(
      "metrics",
      [{ header: "metric", value: (row: string) => row }],
      ["gmv"],
    );

    expect(toCsv([sheet, other])).toContain("\r\n\r\nmetrics\r\n");
  });
});

describe("renderSheet", () => {
  it("sütun tanımlarını hücrelere indirger", () => {
    expect(
      renderSheet(
        "byTier",
        [
          { header: "key", value: (row: { key: string }) => row.key },
          { header: "missing", value: () => null },
        ],
        [{ key: "premium" }],
      ),
    ).toEqual({
      name: "byTier",
      headers: ["key", "missing"],
      rows: [["premium", null]],
    });
  });
});
