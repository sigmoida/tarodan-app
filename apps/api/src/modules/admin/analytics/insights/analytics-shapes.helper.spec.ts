import {
  bucketExpr,
  metric,
  percent,
  rateMetric,
  toBreakdown,
  toFunnel,
  toSeries,
} from "./analytics-shapes.helper";

describe("metric", () => {
  it("ölçülmemiş karşılaştırmayı NULL bırakır", () => {
    // Sıfır "yarıya düştük" demektir; "sormadık" demek değildir.
    expect(metric(120, null)).toEqual({
      current: 120,
      previous: null,
      changePercent: null,
    });
  });

  it("yüzde değişimi önceki pencereye göre hesaplar", () => {
    expect(metric(150, 100).changePercent).toBe(50);
    expect(metric(50, 100).changePercent).toBe(-50);
  });

  it("sıfırdan büyümeyi %100 sayar, sonsuz değil", () => {
    expect(metric(10, 0).changePercent).toBe(100);
    expect(metric(0, 0).changePercent).toBe(0);
  });

  it("kuruşa yuvarlar", () => {
    expect(metric(12.3456, null).current).toBe(12.35);
  });
});

describe("rateMetric", () => {
  it("oranı yüzde olarak verir", () => {
    expect(rateMetric(3, 12, null, null).current).toBe(25);
  });

  it("payda sıfırken sonsuz değil sıfır döner", () => {
    expect(rateMetric(3, 0, null, null).current).toBe(0);
  });

  it("önceki pencerenin ORANINI karşılaştırır, ham sayısını değil", () => {
    // 5/10 = %50 → 3/12 = %25: oran yarıya düştü, sayı değil.
    expect(rateMetric(3, 12, 5, 10).changePercent).toBe(-50);
  });
});

describe("percent", () => {
  it("bir ondalığa yuvarlar", () => {
    expect(percent(1, 3)).toBe(33.3);
  });
});

describe("toSeries", () => {
  const buckets = ["2026-06-01", "2026-06-02", "2026-06-03"];

  /**
   * Eski grafikler satırı olmayan kovayı atlıyordu; iki uzak nokta arasına düz
   * bir çizgi çekiliyor ve boşluk "veri yok" değil "düz gitti" diye okunuyordu.
   */
  it("satırı olmayan kovayı SIFIRLA doldurur, atlamaz", () => {
    expect(
      toSeries("gmv", [{ bucket: "2026-06-02", value: 500 }], buckets),
    ).toEqual({
      key: "gmv",
      points: [
        { bucket: "2026-06-01", value: 0 },
        { bucket: "2026-06-02", value: 500 },
        { bucket: "2026-06-03", value: 0 },
      ],
    });
  });

  it("aralıkta olmayan kovayı sessizce düşürür", () => {
    const series = toSeries(
      "gmv",
      [{ bucket: "2026-05-30", value: 9 }],
      buckets,
    );
    expect(series.points.map((point) => point.value)).toEqual([0, 0, 0]);
  });

  it("Prisma'nın Decimal/bigint dönüşlerini sayıya çevirir", () => {
    const series = toSeries(
      "orderCount",
      [{ bucket: "2026-06-01", value: "42" }],
      buckets,
    );
    expect(series.points[0].value).toBe(42);
  });
});

describe("toBreakdown", () => {
  const rows = [
    { key: "a", label: "A", count: 1, amount: 100 },
    { key: "b", label: "B", count: 9, amount: 300 },
  ];

  it("payı tutara göre hesaplar ve tutara göre sıralar", () => {
    expect(toBreakdown(rows).map((row) => [row.key, row.share])).toEqual([
      ["b", 75],
      ["a", 25],
    ]);
  });

  /**
   * Yalnız sayılan kırılımlarda (iptal gerekçesi, ilan durumu) tutar hep sıfır
   * olur; tutara göre pay alınsaydı her satır %0 görünürdü.
   */
  it("sayıya göre istendiğinde payı sayıdan hesaplar", () => {
    expect(
      toBreakdown(rows, "count").map((row) => [row.key, row.share]),
    ).toEqual([
      ["b", 90],
      ["a", 10],
    ]);
  });

  it("tamamen boş kırılımda sıfıra böler gibi davranmaz", () => {
    expect(
      toBreakdown([{ key: "a", label: "A", count: 0, amount: 0 }])[0].share,
    ).toBe(0);
  });
});

describe("toFunnel", () => {
  it("ilk adıma göre dönüşümü ve bir önceki adımdan kaybı verir", () => {
    expect(
      toFunnel([
        { key: "created", count: 100 },
        { key: "accepted", count: 40 },
        { key: "completed", count: 30 },
      ]),
    ).toEqual([
      {
        key: "created",
        count: 100,
        conversionFromFirst: 100,
        dropOffFromPrevious: 0,
      },
      {
        key: "accepted",
        count: 40,
        conversionFromFirst: 40,
        dropOffFromPrevious: 60,
      },
      {
        key: "completed",
        count: 30,
        conversionFromFirst: 30,
        dropOffFromPrevious: 25,
      },
    ]);
  });

  /**
   * Adımlar KENDİ damgalarından sayılır: mart'ta açılıp nisanda tamamlanan
   * takas nisanın tamamlanmasıdır ama nisanın açılışı değildir. Bu durumda
   * adım kendinden öncekini geçebilir; kayıp negatif gösterilmez.
   */
  it("bir adım öncekini geçerse kaybı sıfıra kırpar", () => {
    const funnel = toFunnel([
      { key: "created", count: 10 },
      { key: "sold", count: 25 },
    ]);
    expect(funnel[1].dropOffFromPrevious).toBe(0);
    expect(funnel[1].conversionFromFirst).toBe(250);
  });

  it("ilk adım sıfırken bölmez", () => {
    expect(
      toFunnel([
        { key: "created", count: 0 },
        { key: "sold", count: 0 },
      ]).every((step) => step.conversionFromFirst === 0),
    ).toBe(true);
  });
});

describe("bucketExpr", () => {
  /**
   * Kolonlar UTC anları tutan `timestamp without time zone`; kova Türkiye
   * takviminde kesilmezse gece yarısı ile 03:00 arasındaki satır bir önceki
   * güne düşer. Aralık sınırları da aynı takvimde kesiliyor — ikisinin aynı
   * saat diliminde olması ekranın tamamının doğru olmasının koşulu.
   */
  it("kovayı UTC'den Türkiye'ye çevirerek keser", () => {
    const sql = bucketExpr('"paid_at"', "day");
    expect(sql.sql).toContain("date_trunc");
    expect(sql.sql).toContain(`"paid_at" AT TIME ZONE 'UTC' AT TIME ZONE`);
    expect(sql.values).toContain("Europe/Istanbul");
  });

  it("kova boyunu parametre olarak geçirir", () => {
    expect(bucketExpr('"created_at"', "week").values).toContain("week");
    expect(bucketExpr('"created_at"', "month").values).toContain("month");
  });
});
