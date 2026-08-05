/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import { PLATFORM_ENTITY } from "@/lib/legal/platform-entity";

/**
 * KVKK Aydınlatma Metni (6698 sayılı Kanun m.10) — metnin tek kaynağı.
 *
 * Veri sorumlusu künyesi `platform-entity.ts`ten gelir: aynı tüzel kişi mesafeli
 * satış sözleşmesinde de geçiyor ve başvuru adresi iki belgede ayrışmamalı.
 *
 * Çerezlere ilişkin ayrıntılı metin ayrı bir sayfada (Çerez Politikası) yayımlanır;
 * burada yalnızca çerez verilerinin hangi kategoride işlendiği belirtilir.
 */
export const PRIVACY_PARTS: LegalPart[] = [
  {
    title: "Kişisel Verilerin Korunmasına İlişkin Aydınlatma Metni",
    intro:
      "İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi uyarınca, Platform üzerinden işlenen kişisel veriler hakkında ilgili kişileri bilgilendirmek amacıyla hazırlanmıştır.",
    sections: [
      {
        number: "1",
        heading: "Veri Sorumlusu",
        blocks: [
          {
            type: "p",
            text: `${PLATFORM_ENTITY.legalName} (“Şirket”), ${PLATFORM_ENTITY.address} adresinde mukim olup ${PLATFORM_ENTITY.website} web sitesi ve/veya mobil uygulaması Tarodan (“Platform”) vasıtasıyla işlenen kişisel veriler bakımından 6698 sayılı KVKK uyarınca veri sorumlusudur.`,
          },
          {
            type: "fields",
            items: [
              { label: "Unvan", value: PLATFORM_ENTITY.legalName },
              { label: "Adres", value: PLATFORM_ENTITY.address },
              { label: "E-posta", value: PLATFORM_ENTITY.email },
              { label: "KEP", value: PLATFORM_ENTITY.kep },
            ],
          },
        ],
      },
      {
        number: "2",
        heading: "Kişisel Veri Nedir?",
        blocks: [
          {
            type: "p",
            text: "Kişisel veri; kimliği belirli veya belirlenebilir gerçek kişiye ilişkin her türlü bilgidir.",
          },
        ],
      },
      {
        number: "3",
        heading: "İlgili Kişi Grupları ve İşlenen Veri Kategorileri",
        blocks: [
          {
            type: "groups",
            groups: [
              {
                title: "A) Ziyaretçi",
                items: [
                  "İşlem güvenliği: IP, log, çerez kayıtları, cihaz bilgileri",
                  "Pazarlama (rıza varsa): reklam / segmentasyon çerez verileri",
                ],
              },
              {
                title: "B) Üye / Alıcı",
                items: [
                  "Kimlik: ad-soyad, kullanıcı adı, TCKN",
                  "İletişim: e-posta, telefon, adres",
                  "Müşteri işlem: sipariş, ödeme, fatura, teslimat, iade, destek kayıtları",
                  "İşlem güvenliği: IP, log, giriş kayıtları, çerez",
                  "Hukuki işlem: uyuşmazlık / başvuru kayıtları",
                  "İşitsel kayıt: çağrı merkezi varsa ses kaydı",
                ],
              },
              {
                title: "C) Üye / Satıcı (bireysel veya ticari)",
                items: [
                  "Kimlik / Yetkili: ad-soyad, kimlik doğrulama verileri; tüzel kişilerde temsilci bilgileri",
                  "Finans: IBAN, hakediş / komisyon / mahsup raporları",
                  "Müşteri işlem: ürün listeleme, sipariş, iade / şikâyet, performans metrikleri",
                  "Hukuki işlem: sözleşme ihlali / uyuşmazlık kayıtları",
                  "İşlem güvenliği: IP, log, panel erişim kayıtları",
                ],
              },
            ],
          },
        ],
      },
      {
        number: "4",
        heading: "Kişisel Verilerin İşlenme Amaçları",
        blocks: [
          {
            type: "p",
            text: "Kişisel veriler başta aşağıdaki amaçlarla işlenir:",
          },
          {
            type: "list",
            items: [
              { text: "Üyelik kaydı ve hesap yönetimi" },
              {
                text: "Mesafeli satış süreçlerinin yürütülmesi (sipariş, ödeme, teslimat, iade)",
              },
              { text: "Müşteri destek / şikâyet yönetimi" },
              { text: "Bilgi güvenliği ve suistimal / fraud önleme" },
              {
                text: "Hukuki yükümlülüklerin yerine getirilmesi ve uyuşmazlıkların yönetimi",
              },
              { text: "Finans / muhasebe, faturalandırma ve raporlama" },
              {
                text: "Açık rıza varsa pazarlama, kampanya ve kişiselleştirme faaliyetleri",
              },
            ],
          },
        ],
      },
      {
        number: "5",
        heading: "Toplama Yöntemi ve Hukuki Sebep",
        blocks: [
          {
            type: "p",
            text: "Veriler; Platform üzerinden elektronik ortamda otomatik yollarla, çağrı merkezi üzerinden, kargo/ödeme hizmet sağlayıcıları üzerinden ve gerektiğinde yetkili kamu kurumlarından elde edilebilir.",
          },
          {
            type: "p",
            text: "Hukuki sebepler, somut işleme faaliyetine göre değişmek üzere; sözleşmenin kurulması/ifası için gerekli olması, hukuki yükümlülük, hakkın tesisi-kullanılması-korunması, meşru menfaat ve açık rızadır.",
          },
        ],
      },
      {
        number: "6",
        heading: "Kişisel Verilerin Aktarımı (Yurt İçi / Yurt Dışı)",
        blocks: [
          {
            type: "p",
            text: "Kişisel veriler; işleme amaçlarıyla sınırlı olarak ve gerekli güvenlik tedbirleri alınarak aşağıdaki taraflara aktarılabilir:",
          },
          {
            type: "list",
            items: [
              { text: "Ödeme hizmet sağlayıcılarına ve bankalara" },
              { text: "Kargo / lojistik firmalarına" },
              {
                text: "Bilgi teknolojileri altyapı sağlayıcılarına (hosting, e-posta, SMS, çağrı merkezi)",
              },
              { text: "Hukuk, denetim ve mali müşavirlik danışmanlarına" },
              { text: "Yetkili kamu kurum ve kuruluşlarına" },
            ],
          },
          {
            type: "p",
            text: "Yurt dışına aktarım söz konusu ise; KVKK'nın ilgili hükümleri uyarınca uygun güvence mekanizmaları uygulanır.",
          },
        ],
      },
      {
        number: "7",
        heading: "İlgili Kişinin Hakları (KVKK m.11)",
        blocks: [
          {
            type: "p",
            text: "İlgili kişiler; kişisel verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltme, silme/yok etme, itiraz ve zararın giderilmesini talep etme gibi haklara sahiptir.",
          },
        ],
      },
      {
        number: "8",
        heading: "Başvuru Yöntemi",
        blocks: [
          {
            type: "p",
            text: `KVKK kapsamındaki talepler; ${PLATFORM_ENTITY.kep}, ${PLATFORM_ENTITY.email} veya ${PLATFORM_ENTITY.address} üzerinden “KVKK İlgili Kişi Başvurusu” konu başlığıyla iletilebilir.`,
          },
          {
            type: "note",
            text: "Başvurular en geç 30 gün içinde sonuçlandırılır.",
          },
        ],
      },
    ],
  },
];
