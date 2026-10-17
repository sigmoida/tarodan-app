import { Prisma } from "@prisma/client";
import {
  EMAIL_CONTENT_END,
  EMAIL_CONTENT_START,
  extractEmailTemplateContent,
  formatEmailPrice,
  renderEmailTemplate,
  renderStoredEmailTemplate,
} from "./email-template-renderer";

describe("email template renderer", () => {
  it("renders the shared light layout with the login logo and no decorative icons", () => {
    const html = renderEmailTemplate(
      "welcome",
      {
        name: "<script>alert(1)</script>",
        verifyUrl: "https://tarodan.com.tr/verify?token=sample",
        to: "user@example.com",
      },
      { frontendUrl: "https://tarodan.com.tr" },
    );

    expect(html).toContain("background-color: #f7f7f8");
    expect(html).toContain("https://tarodan.com.tr/tarodan-logo.jpg");
    expect(html).toContain(EMAIL_CONTENT_START);
    expect(html).toContain(EMAIL_CONTENT_END);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toMatch(
      /🎉|📦|🚚|🔐|✅|💰|💎|⭐|⚠️|❌|📧|🔄|📋|🎯|💳|📍|🛍️|📄|🧾|🔔|📉|📈|⏳|⏰|🏪|📝|👥/u,
    );
    expect(html).not.toContain("linear-gradient");
  });

  it("safely substitutes nested variables in stored templates", () => {
    const rendered = renderStoredEmailTemplate(
      "<p>Merhaba {{user.name}}</p><p>{{missing.value}}</p>",
      "Sipariş {{order.number}}",
      {
        user: { name: '<img src=x onerror="alert(1)">' },
        order: { number: "TRD-123" },
      },
      { frontendUrl: "https://tarodan.com.tr" },
    );

    expect(rendered.subject).toBe("Sipariş TRD-123");
    expect(rendered.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(rendered.html).toContain("{{missing.value}}");
    expect(rendered.html).not.toContain('<img src=x onerror="alert(1)">');
  });

  it("formats Prisma Decimal product prices instead of printing NaN", () => {
    const html = renderEmailTemplate(
      "marketing-newsletter",
      {
        userName: "Ali",
        trendingProducts: [
          {
            title: "Ürün",
            price: new Prisma.Decimal("1234.5"),
            productUrl: "https://tarodan.com.tr/listings/1",
          },
        ],
      },
      { frontendUrl: "https://tarodan.com.tr" },
    );

    expect(html).toContain("1.234,50 TL");
    expect(html).not.toContain("NaN");
  });

  it("formats amounts coming from numbers, numeric strings and Decimals alike", () => {
    expect(formatEmailPrice(199)).toBe("199,00");
    expect(formatEmailPrice("199.5")).toBe("199,50");
    expect(formatEmailPrice(new Prisma.Decimal("1234.5"))).toBe("1.234,50");
    // Zaten biçimlenmiş metin olduğu gibi geçer, çözülemeyen değer 0,00 olur.
    expect(formatEmailPrice("1.234,50")).toBe("1.234,50");
    // Binlik grubu ("1.234") 1,23'e düşürülmemeli.
    expect(formatEmailPrice("1.234")).toBe("1.234");
    expect(formatEmailPrice(undefined)).toBe("0,00");
    expect(formatEmailPrice("")).toBe("0,00");
  });

  it("tells the reporter what was decided, and shows the admin's note", () => {
    const html = renderEmailTemplate(
      "report-resolved",
      {
        reporterName: "Ayşe",
        type: "product",
        reason: "counterfeit",
        status: "resolved",
        adminNote: "İlan yayından kaldırıldı.",
        createdAt: "2026-07-03T12:00:00Z",
      },
      { frontendUrl: "https://tarodan.com.tr" },
    );

    expect(html).toContain("Şikayetiniz Sonuçlandı");
    expect(html).toContain("İlan"); // tür etiketi
    expect(html).toContain("Taklit ürün"); // gerekçe etiketi
    expect(html).toContain("03.07.2026");
    expect(html).toContain("İlan yayından kaldırıldı.");
    expect(html).toContain("gereken işlem yapıldı");
  });

  it("says no action was taken when the report is dismissed", () => {
    const html = renderEmailTemplate("report-resolved", {
      reporterName: "Ayşe",
      type: "user",
      reason: "spam",
      status: "dismissed",
    });

    expect(html).toContain("İşleme alınmadı");
    expect(html).toContain("kurallarımıza aykırı bir durum tespit edilmedi");
    // Not yoksa açıklama kutusu hiç basılmaz.
    expect(html).not.toContain("Ekibimizin açıklaması");
  });

  describe("preparing deadline buyer emails", () => {
    const base = {
      name: "Misafir Alıcı",
      orderNumber: "ORD-7",
      orderId: "o7",
      productTitle: "Model araba",
      deadline: "10 Ekim 2026 12:00",
    };

    it("tells the buyer the new latest ship date and that cancelling is still possible", () => {
      const html = renderEmailTemplate("order-preparing-extended-buyer", base, {
        frontendUrl: "https://tarodan.com.tr",
      });

      expect(html).toContain("Siparişinizin Kargoya Verilmesi Gecikiyor");
      expect(html).toContain("10 Ekim 2026 12:00");
      expect(html).toContain("#ORD-7");
      expect(html).toContain("iptal edebilirsiniz");
      expect(html).toContain("https://tarodan.com.tr/profile/orders/o7");
    });

    it.each(["order-preparing-extended-buyer", "seller-did-not-ship-refunded"])(
      "%s links a guest to order tracking, not to an account screen",
      (template) => {
        const html = renderEmailTemplate(
          template,
          { ...base, isGuestOrder: true, buyerEmail: "misafir@example.com" },
          { frontendUrl: "https://tarodan.com.tr" },
        );

        expect(html).toContain(
          "https://tarodan.com.tr/track-order?orderNumber=ORD-7&amp;email=misafir%40example.com",
        );
        expect(html).not.toContain("/profile/orders/o7");
      },
    );
  });

  describe("platform (admin) cancellation", () => {
    const base = {
      orderNumber: "ORD-9",
      orderId: "o9",
      productTitle: "Model araba",
      reason: "Stok hatası",
    };
    const brand = { frontendUrl: "https://tarodan.com.tr" };

    it("paid: tells the buyer Tarodan cancelled, the reason label, the refund and the bank timing (no day literal)", () => {
      const html = renderEmailTemplate(
        "order-cancelled-by-platform-buyer",
        { ...base, buyerName: "Ali", paid: true, refundAmount: 1180 },
        brand,
      );

      expect(html).toContain("Tarodan Tarafından İptal Edildi");
      expect(html).toContain("#ORD-9");
      expect(html).toContain("Stok hatası");
      expect(html).toContain("İade Tutarı");
      expect(html).toContain("1.180,00 TL");
      expect(html).toContain("bankanızın olağan iade süresi");
      expect(html).not.toMatch(/\d\s*[–-]\s*\d\s*iş günü/);
      expect(html).toContain("https://tarodan.com.tr/profile/orders/o9");
    });

    it("unpaid: says no payment was taken and shows no refund amount", () => {
      const html = renderEmailTemplate(
        "order-cancelled-by-platform-buyer",
        { ...base, paid: false },
        brand,
      );

      expect(html).toContain("ödeme alınmamıştı");
      expect(html).not.toContain("İade Tutarı");
    });

    it("links a guest buyer to order tracking", () => {
      const html = renderEmailTemplate(
        "order-cancelled-by-platform-buyer",
        {
          ...base,
          paid: true,
          refundAmount: 100,
          isGuestOrder: true,
          buyerEmail: "misafir@example.com",
        },
        brand,
      );

      expect(html).toContain(
        "https://tarodan.com.tr/track-order?orderNumber=ORD-9&amp;email=misafir%40example.com",
      );
    });

    it("seller: do not ship (paid) vs. reservation released (unpaid), with the reason label", () => {
      const paid = renderEmailTemplate(
        "order-cancelled-by-platform-seller",
        { ...base, sellerName: "Satıcı", paid: true },
        brand,
      );
      const unpaid = renderEmailTemplate(
        "order-cancelled-by-platform-seller",
        { ...base, sellerName: "Satıcı", paid: false },
        brand,
      );

      expect(paid).toContain("kargoya vermeyin");
      expect(paid).toContain("Stok hatası");
      expect(unpaid).toContain("ödeme alınmamıştı");
      expect(unpaid).not.toContain("kargoya vermeyin");
      expect(paid).toContain("https://tarodan.com.tr/seller/orders/o9");
    });

    it("escapes the reason text", () => {
      const html = renderEmailTemplate(
        "order-cancelled-by-platform-seller",
        { ...base, reason: "<b>x</b>", paid: false },
        brand,
      );

      expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    });
  });

  it("extracts only the editable content from a wrapped email", () => {
    const wrapped = renderEmailTemplate(
      "password-reset",
      { name: "Kullanıcı", resetUrl: "https://tarodan.com.tr/reset" },
      "https://tarodan.com.tr",
    );

    const content = extractEmailTemplateContent(wrapped);

    expect(content).toContain("Şifre Sıfırlama Talebi");
    expect(content).not.toContain("<!DOCTYPE html>");
    expect(content).not.toContain("tarodan-logo.jpg");
  });
});
