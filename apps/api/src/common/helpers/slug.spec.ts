import { carModelSlug, generateSlug } from "./slug";

describe("generateSlug", () => {
  it("Türkçe harfleri siler değil, çevirir", () => {
    // Önceki gövde `[^\w\s-]` kullandığı için bunlar "ahin" / "z-elik" oluyordu.
    expect(generateSlug("Şahin")).toBe("sahin");
    expect(generateSlug("Öz Çelik")).toBe("oz-celik");
    expect(generateSlug("Ağır Vasıta")).toBe("agir-vasita");
    expect(generateSlug("İzmir Döküm")).toBe("izmir-dokum");
    expect(generateSlug("ÇĞIİÖŞÜ")).toBe("cgiiosu");
  });

  it("diğer Latin aksanlarını taban harfe indirir", () => {
    expect(generateSlug("Citroën")).toBe("citroen");
    expect(generateSlug("Škoda")).toBe("skoda");
  });

  it("ayırıcıları tek tireye indirger", () => {
    expect(generateSlug("Mercedes-Benz")).toBe("mercedes-benz");
    expect(generateSlug("BMW   M3")).toBe("bmw-m3");
    expect(generateSlug("Alfa_Romeo")).toBe("alfa-romeo");
    expect(generateSlug("Rolls  --  Royce")).toBe("rolls-royce");
  });

  it("baştaki ve sondaki tireleri kırpar", () => {
    expect(generateSlug("  Ford  ")).toBe("ford");
    expect(generateSlug("-Opel-")).toBe("opel");
    expect(generateSlug("1:64 Ölçek!")).toBe("1-64-olcek");
  });

  it("slug üretilemeyen girdide boş string döner", () => {
    // Çağıranlar bunu "ad'dan slug türetilemedi" olarak ele almalı.
    expect(generateSlug("!!!")).toBe("");
    expect(generateSlug("   ")).toBe("");
  });

  it("aynı ad için her zaman aynı slug'ı üretir", () => {
    // İçe aktarma ile elle ekleme aynı gövdeyi kullanır; deterministik olmalı.
    expect(generateSlug("Hot Wheels")).toBe(generateSlug("Hot Wheels"));
    expect(generateSlug("hot wheels")).toBe(generateSlug("Hot Wheels"));
  });
});

describe("carModelSlug", () => {
  it("marka slug'ını model adının önüne ekler", () => {
    expect(carModelSlug("dodge", "Charger")).toBe("dodge-charger");
    expect(carModelSlug("tofas", "Şahin")).toBe("tofas-sahin");
    expect(carModelSlug("bmw", "M3 Competition")).toBe("bmw-m3-competition");
  });

  it("deterministiktir: aynı marka + aynı ad tek slug üretir", () => {
    // CarModel.slug @unique, şemada @@unique([brandId, name]) YOK — tekillik
    // bu türetimin deterministik kalmasına bağlı.
    expect(carModelSlug("dodge", "Charger")).toBe(
      carModelSlug("dodge", "charger"),
    );
  });
});
