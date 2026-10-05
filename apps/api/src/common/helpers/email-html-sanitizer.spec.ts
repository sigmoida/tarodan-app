import { sanitizeEmailHtml } from "./email-html-sanitizer";

describe("sanitizeEmailHtml", () => {
  describe("aktif içerik atılır", () => {
    it("script etiketini içeriğiyle birlikte kaldırır", () => {
      const out = sanitizeEmailHtml('<p>Merhaba</p><script>alert(1)</script>');
      expect(out).toBe("<p>Merhaba</p>");
      expect(out).not.toContain("alert");
    });

    it("olay işleyicilerini kaldırır, etiketi korur", () => {
      const out = sanitizeEmailHtml(
        '<img src="https://cdn.example.com/a.png" onerror="alert(1)" alt="x"><a href="https://tarodan.com.tr" onclick="evil()">Git</a>',
      );
      expect(out).not.toMatch(/onerror|onclick/i);
      expect(out).toContain('src="https://cdn.example.com/a.png"');
      expect(out).toContain("Git");
    });

    it.each([
      '<a href="javascript:alert(1)">x</a>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
      '<a href="vbscript:msgbox(1)">x</a>',
    ])("tehlikeli link şemasını kaldırır: %s", (html) => {
      const out = sanitizeEmailHtml(html);
      expect(out).not.toMatch(/javascript|data:|vbscript/i);
    });

    it("data: görsel kaynağını kaldırır", () => {
      const out = sanitizeEmailHtml('<img src="data:image/png;base64,AAAA">');
      expect(out).not.toContain("data:");
    });

    it.each([
      '<iframe src="https://evil.example.com"></iframe>',
      '<form action="https://evil.example.com"><input name="a"></form>',
      '<object data="x.swf"></object>',
      '<embed src="x.swf">',
      "<style>body{display:none}</style>",
      '<meta http-equiv="refresh" content="0;url=https://evil.example.com">',
      '<link rel="stylesheet" href="https://evil.example.com/a.css">',
    ])("etkin etiketi kaldırır: %s", (html) => {
      const out = sanitizeEmailHtml(`<p>ok</p>${html}`);
      expect(out).toBe("<p>ok</p>");
    });

    it("tehlikeli stil değerlerini kaldırır, güvenli olanı korur", () => {
      const out = sanitizeEmailHtml(
        '<div style="color: #ff0000; background-color: red; width: expression(alert(1)); background: url(javascript:alert(1)); position: fixed">x</div>',
      );
      expect(out).toContain("color:#ff0000");
      expect(out).not.toMatch(/expression|url\(|position/i);
    });

    it("id/class gibi izin verilmeyen öznitelikleri atar", () => {
      const out = sanitizeEmailHtml('<p id="a" class="b" data-x="1">x</p>');
      expect(out).toBe("<p>x</p>");
    });
  });

  describe("normal e-posta işaretlemesi korunur", () => {
    it("link, görsel, tablo ve satır içi stilleri korur", () => {
      const html =
        '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse"><tr><td style="padding: 12px; text-align: center"><h1 style="color: #27272a">Başlık</h1><img src="https://cdn.example.com/banner.png" alt="Banner" width="560"><a href="https://tarodan.com.tr/kampanya" style="background-color: #ff6b00; color: #ffffff; padding: 10px 20px">Hemen Al</a></td></tr></table>';
      const out = sanitizeEmailHtml(html);

      expect(out).toContain("<table");
      expect(out).toContain('cellpadding="0"');
      expect(out).toContain("border-collapse:collapse");
      expect(out).toContain("<h1");
      expect(out).toContain('src="https://cdn.example.com/banner.png"');
      expect(out).toContain('alt="Banner"');
      expect(out).toContain('href="https://tarodan.com.tr/kampanya"');
      expect(out).toContain("background-color:#ff6b00");
      expect(out).toContain("Hemen Al");
    });

    it("mailto ve tel linklerini korur", () => {
      const out = sanitizeEmailHtml(
        '<a href="mailto:destek@tarodan.com.tr">m</a><a href="tel:+905321234567">t</a>',
      );
      expect(out).toContain('href="mailto:destek@tarodan.com.tr"');
      expect(out).toContain('href="tel:+905321234567"');
    });

    it("linklere rel=noopener noreferrer ekler", () => {
      const out = sanitizeEmailHtml('<a href="https://tarodan.com.tr">x</a>');
      expect(out).toContain('rel="noopener noreferrer"');
    });

    it("tam belge yapıştırılırsa yalnız gövde içeriğini alır", () => {
      const out = sanitizeEmailHtml(
        "<!DOCTYPE html><html><head><title>Gizli</title></head><body><p>İçerik</p></body></html>",
      );
      expect(out).toBe("<p>İçerik</p>");
    });
  });

  it("yalnız aktif içerikten oluşan girdi boş döner", () => {
    expect(sanitizeEmailHtml("<script>alert(1)</script>")).toBe("");
  });
});
