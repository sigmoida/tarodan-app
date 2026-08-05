import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const publicOutput = path.join(
  root,
  "apps/admin/public/templates/tarodan-toplu-urun-sablonu.xlsx",
);

const headers = [
  "urun_ref",
  "baslik",
  "aciklama",
  "kategori",
  "marka",
  "arac_modeli",
  "uretici",
  "model_kodu",
  "durum",
  "renk",
  "olcek",
  "malzeme",
  "kutulu",
  "fiyat",
  "indirimli_fiyat",
  "indirim_baslangic",
  "indirim_bitis",
  "stok",
  "kargo_paketi",
  "on_siparis",
  "set_urun",
  "set_parca_sayisi",
  "yil",
  "ek_ozellikler",
  ...Array.from({ length: 10 }, (_, index) => `gorsel_${index + 1}`),
];

const example = [
  "URUN-001",
  "Hot Wheels 1970 Dodge Challenger R/T 1:64",
  "Kutulu, koleksiyonluk durumda Hot Wheels 1970 Dodge Challenger R/T modeli.",
  "Araba",
  "Dodge",
  "Challenger R/T",
  "Hot Wheels",
  "HW-DODGE-001",
  "new",
  "Mor",
  "1:64",
  "diecast",
  "Evet",
  899,
  749,
  new Date("2026-08-10T00:00:00+03:00"),
  new Date("2026-08-31T23:59:59+03:00"),
  3,
  "small",
  "Hayır",
  "Hayır",
  null,
  1970,
  null,
  "challenger-on.jpg",
  "challenger-arka.jpg",
  "challenger-kutu.jpg",
  ...Array(7).fill(null),
];

const workbook = new ExcelJS.Workbook();
workbook.creator = "Tarodan";
workbook.company = "Tarodan";
workbook.subject = "Kurumsal satıcı toplu ürün yükleme şablonu";
workbook.title = "Tarodan Toplu Ürün Şablonu";
workbook.created = new Date("2026-08-05T00:00:00+03:00");

const products = workbook.addWorksheet("Urunler", {
  views: [{ state: "frozen", ySplit: 1, xSplit: 1, showGridLines: false }],
});
products.addRow(headers);
for (let index = 0; index < 25; index += 1) products.addRow([]);
products.autoFilter = { from: "A1", to: "AH26" };

const orange = "FFF15A24";
const orangeSoft = "FFFFF2EA";
const border = "FFE5E7EB";
const heading = "FF202124";
const muted = "FF6B7280";

products.getRow(1).height = 32;
products.getRow(1).eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = { bottom: { style: "medium", color: { argb: "FFCC4B1D" } } };
});
for (let row = 2; row <= 26; row += 1) {
  products.getRow(row).height = 24;
  products.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { bottom: { style: "thin", color: { argb: border } } };
  });
}

const widths = {
  A: 16,
  B: 38,
  C: 54,
  D: 18,
  E: 18,
  F: 22,
  G: 20,
  H: 20,
  I: 16,
  J: 16,
  K: 12,
  L: 16,
  M: 12,
  N: 14,
  O: 18,
  P: 20,
  Q: 20,
  R: 10,
  S: 18,
  T: 14,
  U: 12,
  V: 18,
  W: 10,
  X: 26,
};
for (const [column, width] of Object.entries(widths)) {
  products.getColumn(column).width = width;
}
for (let column = 25; column <= 34; column += 1) {
  products.getColumn(column).width = 23;
}
products.getColumn("N").numFmt = '#,##0.00 "TL"';
products.getColumn("O").numFmt = '#,##0.00 "TL"';
products.getColumn("P").numFmt = "dd.mm.yyyy hh:mm";
products.getColumn("Q").numFmt = "dd.mm.yyyy hh:mm";

const validations = {
  I: "Referanslar!$A$2:$A$6",
  M: "Referanslar!$B$2:$B$3",
  S: "Referanslar!$C$2:$C$4",
  T: "Referanslar!$B$2:$B$3",
  U: "Referanslar!$B$2:$B$3",
  K: "Referanslar!$D$2:$D$7",
  L: "Referanslar!$E$2:$E$5",
};
for (const [column, formula] of Object.entries(validations)) {
  for (let row = 2; row <= 26; row += 1) {
    products.getCell(`${column}${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: "Geçersiz değer",
      error: "Listeden geçerli bir değer seçin.",
    };
  }
}
for (let row = 2; row <= 26; row += 1) {
  products.getCell(`R${row}`).dataValidation = {
    type: "whole",
    operator: "greaterThanOrEqual",
    formulae: [1],
    showErrorMessage: true,
    error: "Stok en az 1 olmalıdır.",
  };
}

const exampleSheet = workbook.addWorksheet("Ornek", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
});
exampleSheet.addRow(headers);
exampleSheet.addRow(example);
exampleSheet.getRow(1).height = 32;
exampleSheet.getRow(1).eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
});
exampleSheet.getRow(2).height = 54;
exampleSheet.getRow(2).eachCell((cell) => {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: orangeSoft },
  };
  cell.alignment = { vertical: "middle", wrapText: true };
});
products.columns.forEach((column, index) => {
  exampleSheet.getColumn(index + 1).width = column.width;
});
exampleSheet.autoFilter = { from: "A1", to: "AH2" };

const instructions = workbook.addWorksheet("Talimatlar", {
  views: [{ showGridLines: false }],
});
instructions.mergeCells("A1:F2");
instructions.getCell("A1").value = "Tarodan Toplu Ürün Yükleme Şablonu";
instructions.getCell("A1").fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: orange },
};
instructions.getCell("A1").font = {
  bold: true,
  size: 18,
  color: { argb: "FFFFFFFF" },
};
instructions.getCell("A1").alignment = {
  vertical: "middle",
  horizontal: "left",
};
instructions.getRow(1).height = 30;
instructions.getRow(2).height = 18;
instructions.getColumn("A").width = 8;
instructions.getColumn("B").width = 30;
instructions.getColumn("C").width = 70;
instructions.getColumn("D").width = 20;
instructions.getColumn("E").width = 20;
instructions.getColumn("F").width = 20;

const steps = [
  [
    "1",
    "Satıcıyı admin ekranından seçin",
    "Satıcı Excel içinde yazılmaz. Yalnızca satış yetkisi açık BUSINESS kurumsal satıcılar listelenir.",
  ],
  [
    "2",
    "Urunler sayfasını doldurun",
    "Sütun adlarını değiştirmeyin. Bir ürün bir satırdır. Urunler sayfası bilerek boştur; örnek kayıt Ornek sayfasındadır. Tek yüklemede en fazla 25 ürün kabul edilir.",
  ],
  [
    "3",
    "Katalog adlarını doğru yazın",
    "Kategori, marka, araç modeli ve üretici alanına admin kataloglarında görünen adı, slug'ı veya UUID'yi yazabilirsiniz.",
  ],
  [
    "4",
    "En az üç görsel ekleyin",
    "gorsel_1, gorsel_2 ve gorsel_3 zorunludur. Dosya adları yüklediğiniz görsellerle birebir aynı olmalıdır.",
  ],
  [
    "5",
    "İndirim alanlarını birlikte kullanın",
    "indirimli_fiyat girilirse fiyat indirim öncesi fiyat sayılır. Başlangıç ve bitiş tarihlerini Excel tarihi olarak girin.",
  ],
  [
    "6",
    "Dosyaları birlikte yükleyin",
    "Excel ve adı geçen tüm JPEG, PNG veya WebP görselleri aynı işlemde seçin. Tüm satırlar geçmeden hiçbir ürün oluşturulmaz.",
  ],
  [
    "7",
    "Doğrudan yayın",
    "Başarılı ürünler Aktif durumda oluşturulur ve web kataloğunda görünür. Kurumsal ürünlerde takas daima kapalıdır.",
  ],
];
instructions.addRow([]);
instructions.addRow([]);
instructions.addRow(["Adım", "Konu", "Açıklama"]);
steps.forEach((step) => instructions.addRow(step));
const instructionHeader = instructions.getRow(5);
instructionHeader.eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: heading } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.alignment = { vertical: "middle" };
});
for (let row = 6; row <= 12; row += 1) {
  instructions.getRow(row).height = 42;
  instructions.getRow(row).eachCell((cell) => {
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: border } } };
  });
}

instructions.getCell("B15").value = "Önemli alanlar";
instructions.getCell("B15").font = {
  bold: true,
  size: 14,
  color: { argb: heading },
};
const notes = [
  ["urun_ref", "Dosya içinde benzersiz, sizin takip numaranızdır."],
  ["durum", "new, like_new, very_good, good veya fair."],
  ["malzeme", "Admin özelliklerinde tanımlı slug; örneğin diecast."],
  ["ek_ozellikler", "Opsiyonel. Admin özellik slug'larını virgülle ayırın."],
  ["set_parca_sayisi", "Yalnız set_urun=Evet ise zorunlu ve en az 2."],
  ["gorsel_1..10", "En az 3, en fazla 10 görsel dosya adı."],
];
instructions.getCell("B16").value = "Alan";
instructions.getCell("C16").value = "Kural";
for (const address of ["B16", "C16"]) {
  const cell = instructions.getCell(address);
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: orangeSoft },
  };
  cell.font = { bold: true, color: { argb: heading } };
}
notes.forEach((note, index) => {
  instructions.getCell(`B${17 + index}`).value = note[0];
  instructions.getCell(`C${17 + index}`).value = note[1];
});
for (let row = 17; row <= 22; row += 1) {
  instructions.getRow(row).height = 28;
  instructions.getCell(`B${row}`).font = {
    bold: true,
    color: { argb: heading },
  };
  instructions.getCell(`C${row}`).font = { color: { argb: muted } };
  instructions.getCell(`C${row}`).alignment = {
    wrapText: true,
    vertical: "middle",
  };
}

const references = workbook.addWorksheet("Referanslar", {
  views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
});
references.addRow([
  "durum",
  "evet_hayir",
  "kargo_paketi",
  "olcek_ornekleri",
  "malzeme_ornekleri",
  "kategori_ornegi",
  "aciklama",
]);
const referenceRows = [
  ["new", "Evet", "small", "1:64", "diecast", "Araba", "Yeni"],
  ["like_new", "Hayır", "medium", "1:43", "resin", null, "Yeni gibi"],
  ["very_good", null, "large", "1:24", "composite", null, "Çok iyi"],
  ["good", null, null, "1:18", "plastic", null, "İyi"],
  ["fair", null, null, "1:12", null, null, "Orta / kullanılmış"],
  [null, null, null, "1:8", null, null, null],
];
referenceRows.forEach((row) => references.addRow(row));
references.getRow(1).height = 30;
references.getRow(1).eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: orange } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.alignment = { vertical: "middle", wrapText: true };
});
references.columns.forEach((column, index) => {
  column.width = index === 6 ? 28 : 22;
});
references.getCell("A9").value =
  "Not: Kategori, marka, araç modeli, üretici, ölçek, malzeme ve ek özellikler admin panelindeki aktif katalog kayıtlarıyla eşleşmelidir.";
references.mergeCells("A9:G10");
references.getCell("A9").fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF7D6" },
};
references.getCell("A9").font = { color: { argb: heading }, italic: true };
references.getCell("A9").alignment = { wrapText: true, vertical: "middle" };

workbook.eachSheet((sheet) => {
  sheet.pageSetup.orientation = "landscape";
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  sheet.properties.defaultRowHeight = 22;
});
// Excel first opens the concise instructions; the import sheet remains named
// `Urunler` and is resolved by name by the API.
workbook.views = [{ activeTab: 2, firstSheet: 0, visibility: "visible" }];

await fs.mkdir(path.dirname(publicOutput), { recursive: true });
await workbook.xlsx.writeFile(publicOutput);

const check = new ExcelJS.Workbook();
await check.xlsx.readFile(publicOutput);
const requiredSheets = ["Urunler", "Ornek", "Talimatlar", "Referanslar"];
for (const name of requiredSheets) {
  if (!check.getWorksheet(name)) throw new Error(`Missing sheet: ${name}`);
}
const actualHeaders = check
  .getWorksheet("Urunler")
  .getRow(1)
  .values.slice(1)
  .map(String);
if (JSON.stringify(actualHeaders) !== JSON.stringify(headers)) {
  throw new Error("Template header verification failed");
}
if (check.getWorksheet("Urunler").actualRowCount !== 1) {
  throw new Error("Urunler must not contain a live example row");
}
console.log(publicOutput);
