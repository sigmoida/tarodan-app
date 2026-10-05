import { buildBroadcastEmail } from "./broadcast-email";

describe("buildBroadcastEmail", () => {
  const base = { title: "Duyuru", body: "Satır 1\nSatır 2", to: "a@b.com" };

  it("HTML yoksa eski düz metin yolu: kaçışlı başlık + paragraf, konu = başlık", () => {
    const email = buildBroadcastEmail({
      ...base,
      title: "<b>Duyuru</b>",
      body: "<script>x</script>\nİkinci",
    });

    expect(email.subject).toBe("<b>Duyuru</b>");
    expect(email.html).toContain("&lt;b&gt;Duyuru&lt;/b&gt;");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("<br>");
    expect(email.html).not.toContain("<script>");
  });

  it("HTML verilince süzülür ve ortak iskelet içinde render edilir", () => {
    const email = buildBroadcastEmail({
      ...base,
      emailSubject: "Kampanya konusu",
      emailHtml:
        '<h1>Selam</h1><script>alert(1)</script><a href="https://tarodan.com.tr" onclick="x()">Git</a>',
    });

    expect(email.subject).toBe("Kampanya konusu");
    expect(email.html).toContain("<h1>Selam</h1>");
    expect(email.html).not.toMatch(/<script|onclick|alert/i);
    // Ortak iskelet: logo + destek altbilgisi.
    expect(email.html).toContain("Tarodan");
    expect(email.html).toContain("destek@tarodan.com.tr");
    // Push başlığı gövdeye basılmaz.
    expect(email.html).not.toContain("<h2");
  });

  it("e-posta konusu boşsa push başlığı konu olur", () => {
    const email = buildBroadcastEmail({
      ...base,
      emailSubject: "   ",
      emailHtml: "<p>x</p>",
    });
    expect(email.subject).toBe("Duyuru");
  });

  it("çıkış linki yalnız verildiğinde footer'a basılır", () => {
    const without = buildBroadcastEmail({ ...base, emailHtml: "<p>x</p>" });
    const withLink = buildBroadcastEmail({
      ...base,
      emailHtml: "<p>x</p>",
      unsubscribeUrl: "https://tarodan.com.tr/newsletter/unsubscribe?token=abc",
    });

    expect(without.html).not.toContain("abonelikten çıkabilirsiniz");
    expect(withLink.html).toContain("abonelikten çıkabilirsiniz");
    expect(withLink.html).toContain("newsletter/unsubscribe?token=abc");
  });
});
