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
