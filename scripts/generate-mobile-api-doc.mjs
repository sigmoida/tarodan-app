#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const apiModulesDir = path.join(rootDir, "apps/api/src/modules");
const webDir = path.join(rootDir, "apps/web/src");
const schemaDirs = [
  path.join(rootDir, "apps/api/src"),
  path.join(rootDir, "packages"),
];
const outputPath = path.join(rootDir, "docs/mobile-api-reference.html");

const HTTP_DECORATORS = new Set(["Get", "Post", "Put", "Patch", "Delete"]);
const REQUEST_DECORATORS = new Set([
  "Body",
  "Query",
  "Param",
  "Headers",
  "UploadedFile",
  "UploadedFiles",
]);
const HTTP_CLIENT_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

const categoryDefinitions = {
  "Kimlik ve Uygulama": {
    order: 10,
    description:
      "Oturum, kayıt, sosyal giriş, token yenileme ve mobil sürüm sözleşmesi.",
    domains: ["auth", "app-config", "i18n"],
  },
  "Hesap ve Güvenlik": {
    order: 20,
    description:
      "Profil, adres, cihaz, doğrulama ve hesap güvenliği işlemleri.",
    domains: ["users", "security"],
  },
  "Keşif ve Katalog": {
    order: 30,
    description:
      "Ürün keşfi, arama, filtreleme, kategori ve vitrin içerikleri.",
    domains: [
      "products",
      "search",
      "categories",
      "brands",
      "manufacturers",
      "car-models",
      "collections",
      "ads",
      "pages",
      "media",
    ],
  },
  "Sepet ve Satın Alma": {
    order: 40,
    description:
      "Sepet, indirim, teklif, sipariş, ödeme, kargo ve iade akışları.",
    domains: [
      "cart",
      "discounts",
      "offers",
      "orders",
      "payments",
      "shipping",
      "refund-requests",
      "tax",
    ],
  },
  "Fatura ve Belgeler": {
    order: 50,
    description:
      "Sipariş makbuzu, resmi eLogo belgesi ve satıcı ürün faturası.",
    domains: ["invoices", "elogo"],
  },
  "Sosyal ve İletişim": {
    order: 60,
    description: "Mesaj, bildirim, favori, değerlendirme, rapor ve destek.",
    domains: [
      "messages",
      "notifications",
      "wishlist",
      "ratings",
      "reports",
      "user-reports",
      "support",
      "newsletter",
    ],
  },
  "Üyelik ve Takas": {
    order: 70,
    description:
      "Üyelik paketleri, boost işlemleri ve uçtan uca takas yaşam döngüsü.",
    domains: ["membership", "trades"],
  },
  "Diğer Tüketici Uçları": {
    order: 90,
    description:
      "Tüketici istemcilerinin kullanabildiği diğer public veya kullanıcı uçları.",
    domains: ["admin", "callback"],
  },
};

const domainLabels = {
  admin: "Public platform ayarları",
  ads: "Reklam",
  "app-config": "Mobil uygulama konfigürasyonu",
  auth: "Kimlik ve oturum",
  brands: "Marka",
  cart: "Sepet",
  "car-models": "Araç modeli",
  categories: "Kategori",
  collections: "Koleksiyon",
  discounts: "İndirim ve kupon",
  elogo: "eLogo resmi belgeler",
  i18n: "Dil ve çeviri",
  invoices: "Sipariş PDF/makbuz",
  manufacturers: "Üretici",
  media: "Medya",
  membership: "Üyelik ve boost",
  messages: "Mesajlaşma",
  newsletter: "Bülten",
  notifications: "Bildirim",
  offers: "Teklif",
  orders: "Sipariş",
  pages: "İçerik sayfaları",
  payments: "Ödeme",
  products: "Ürün ve ilan",
  ratings: "Değerlendirme",
  "refund-requests": "İade talebi",
  reports: "Rapor",
  search: "Arama",
  security: "Hesap güvenliği",
  shipping: "Kargo",
  support: "Destek",
  tax: "Vergi",
  trades: "Takas",
  "user-reports": "Kullanıcı şikayeti",
  users: "Kullanıcı ve profil",
  wishlist: "Favoriler",
};

const workflows = [
  {
    title: "Kayıt ve Oturum",
    owner: "Public + kullanıcı",
    steps: [
      "E-posta uygunluğu ve kayıt",
      "E-posta/Google/Apple ile giriş",
      "Access ve rotated refresh token saklama",
      "Profil ve cihaz/push token senkronizasyonu",
    ],
    routes: [
      "POST /auth/check-email",
      "POST /auth/register",
      "POST /auth/login",
      "POST /auth/google",
      "POST /auth/apple",
      "POST /auth/refresh",
      "GET /auth/profile",
    ],
  },
  {
    title: "Keşif ve Ürün Detayı",
    owner: "Public",
    steps: [
      "Uygulama konfigürasyonu ve katalog sözlükleri",
      "Arama, filtre ve koleksiyonlar",
      "Ürün detayı, satıcı profili ve benzer ürünler",
      "Reklam gösterim/tıklama ölçümü",
    ],
    routes: [
      "GET /app-config",
      "GET /products",
      "GET /products/:id",
      "GET /search/products",
      "GET /categories",
      "GET /collections/browse",
      "GET /ads/active",
    ],
  },
  {
    title: "İlan Oluşturma ve Yönetim",
    owner: "Kullanıcı/satıcı",
    steps: [
      "Medya yükleme",
      "Komisyon önizleme",
      "Taslak/ilan oluşturma ve düzenleme",
      "İlanlarım, boost ve durum yönetimi",
    ],
    routes: [
      "POST /media/upload",
      "GET /orders/commission-preview",
      "POST /products",
      "PATCH /products/:id",
      "GET /products/my",
    ],
  },
  {
    title: "Sepet, Checkout ve PayTR",
    owner: "Public + kullanıcı",
    steps: [
      "Sepet ve kupon doğrulama",
      "Sunucu fiyat teklifini alma",
      "Üye veya guest checkout",
      "PayTR başlatma ve sonuç/status polling",
    ],
    routes: [
      "GET /cart",
      "POST /orders/quote",
      "POST /orders/checkout",
      "POST /orders/checkout/guest",
      "POST /payments/initiate",
      "GET /payments/:id/status",
    ],
  },
  {
    title: "Teklif ve Pazarlık",
    owner: "Kullanıcı",
    steps: [
      "Teklif oluşturma",
      "Gelen/giden teklifleri listeleme",
      "Kabul, red veya karşı teklif",
      "Kabul edilen tekliften ödeme",
    ],
    routes: [
      "POST /offers",
      "GET /offers",
      "POST /offers/:id/accept",
      "POST /offers/:id/reject",
    ],
  },
  {
    title: "Sipariş ve Kargo",
    owner: "Alıcı + satıcı",
    steps: [
      "Sipariş/grup detayını izleme",
      "Satıcının hazırlama ve kargo başlatması",
      "Sürat takip statülerini gösterme",
      "Teslim onayı, iptal veya yeniden aktifleştirme",
    ],
    routes: [
      "GET /orders",
      "GET /orders/groups/:id",
      "POST /orders/:id/prepare",
      "POST /shipping",
      "GET /shipping/order/:orderId",
      "POST /orders/:id/confirm",
    ],
  },
  {
    title: "İade ve Faturalar",
    owner: "Alıcı + satıcı",
    steps: [
      "İade talebi ve kanıt yükleme",
      "Alıcı/satıcı iade ekranları",
      "İade kargo takibi",
      "Resmi eLogo ve satıcı ürün faturasını indirme",
    ],
    routes: [
      "POST /orders/:orderId/refund-requests",
      "GET /refund-requests/me",
      "GET /refund-requests/seller",
      "GET /elogo/invoices/by-order/:orderId",
      "GET /orders/:id/seller-invoice",
    ],
  },
  {
    title: "Mesaj, Bildirim ve Değerlendirme",
    owner: "Kullanıcı + Socket.IO",
    steps: [
      "Konuşma başlatma ve thread listesi",
      "Mesaj gönderme ve realtime teslim",
      "Bildirim listesi/okundu durumu",
      "Sipariş sonrası ürün ve satıcı değerlendirmesi",
    ],
    routes: [
      "GET /messages/threads",
      "POST /messages/threads",
      "POST /messages/threads/:id/messages",
      "GET /notifications",
      "POST /ratings/products",
      "POST /ratings/users",
    ],
  },
  {
    title: "Üyelik ve Takas",
    owner: "Kullanıcı",
    steps: [
      "Paketleri ve mevcut üyeliği gösterme",
      "Üyelik/boost satın alma",
      "Takas oluşturma, eşleşme ve ödeme",
      "Takas kargo ve teslim yaşam döngüsü",
    ],
    routes: [
      "GET /membership/tiers",
      "GET /membership/me",
      "POST /membership/subscribe",
      "POST /trades",
      "GET /trades/:id",
    ],
  },
];

const realtimeEvents = [
  {
    direction: "client → server",
    event: "join:thread",
    payload: "{ threadId }",
    purpose: "Mesaj thread odasına katıl",
  },
  {
    direction: "client → server",
    event: "leave:thread",
    payload: "{ threadId }",
    purpose: "Mesaj thread odasından ayrıl",
  },
  {
    direction: "client → server",
    event: "typing:start",
    payload: "{ threadId }",
    purpose: "Yazıyor sinyali başlat",
  },
  {
    direction: "client → server",
    event: "typing:stop",
    payload: "{ threadId }",
    purpose: "Yazıyor sinyalini durdur",
  },
  {
    direction: "client → server",
    event: "order:subscribe",
    payload: "{ orderId }",
    purpose: "Sipariş güncellemelerine abone ol",
  },
  {
    direction: "client → server",
    event: "product:subscribe",
    payload: "{ productId }",
    purpose: "Ürün güncellemelerine abone ol",
  },
  {
    direction: "server → client",
    event: "connected",
    payload: "{ userId }",
    purpose: "Kimliği doğrulanmış bağlantı hazır",
  },
  {
    direction: "server → client",
    event: "joined:thread",
    payload: "{ threadId }",
    purpose: "Thread aboneliği onayı",
  },
  {
    direction: "server → client",
    event: "left:thread",
    payload: "{ threadId }",
    purpose: "Thread aboneliğinden çıkış onayı",
  },
  {
    direction: "server → client",
    event: "typing:started",
    payload: "{ threadId, userId }",
    purpose: "Karşı taraf yazıyor",
  },
  {
    direction: "server → client",
    event: "typing:stopped",
    payload: "{ threadId, userId }",
    purpose: "Karşı taraf yazmayı bıraktı",
  },
  {
    direction: "server → client",
    event: "message:new",
    payload: "{ threadId, message }",
    purpose: "Thread'e yeni mesaj geldi",
  },
  {
    direction: "server → client",
    event: "message:read",
    payload: "{ threadId, readerId, messageIds }",
    purpose: "Mesajlar okundu",
  },
  {
    direction: "server → client",
    event: "thread:updated",
    payload: "ThreadUpdatedEvent",
    purpose: "Kişisel thread özeti değişti",
  },
  {
    direction: "server → client",
    event: "notification:new",
    payload: "Notification",
    purpose: "Yeni kişisel bildirim",
  },
  {
    direction: "server → client",
    event: "notification:broadcast",
    payload: "Notification",
    purpose: "Genel bildirim",
  },
  {
    direction: "server → client",
    event: "order:subscribed",
    payload: "{ orderId }",
    purpose: "Sipariş aboneliği onayı",
  },
  {
    direction: "server → client",
    event: "order:updated",
    payload: "{ orderId, ...data }",
    purpose: "Sipariş durumu değişti",
  },
  {
    direction: "server → client",
    event: "product:subscribed",
    payload: "{ productId }",
    purpose: "Ürün aboneliği onayı",
  },
  {
    direction: "server → client",
    event: "product:updated",
    payload: "{ productId, ...data }",
    purpose: "Ürün/stok durumu değişti",
  },
  {
    direction: "server → client",
    event: "offer:received",
    payload: "Offer",
    purpose: "Yeni teklif alındı",
  },
  {
    direction: "server → client",
    event: "offer:response",
    payload: "OfferResponse",
    purpose: "Teklif yanıtlandı",
  },
];

const statusContractDefinitions = {
  ProductStatus: "İlanın yayın ve stok görünürlüğü",
  OfferStatus: "Teklif/pazarlık yaşam döngüsü",
  OrderStatus: "Sipariş ve alıcı onay yaşam döngüsü",
  PaymentStatus:
    "PayTR ödeme sonucu; kesin durum sunucu/callback otoritesindedir",
  ShipmentStatus: "Sürat durum kodlarından normalize edilen kargo durumu",
  RefundRequestStatus: "İade talebi, iade kargosu ve para iadesi yaşam döngüsü",
  ElogoInvoiceStatus: "eLogo resmi belge üretim durumu",
  TradeStatus: "Takas, depo, kargo ve teslim yaşam döngüsü",
  SubscriptionStatus: "Üyelik yenileme/iptal durumu",
  MessageStatus: "Mesaj moderasyon ve okundu durumu",
  SellerDocumentStatus: "Kurumsal satıcı belge inceleme durumu",
};

function walkFiles(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      ["node_modules", "dist", ".next", ".expo", ".turbo"].includes(entry.name)
    )
      continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(absolute, predicate));
    else if (predicate(absolute)) results.push(absolute);
  }
  return results;
}

function sourceFile(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}

function decoratorInfo(decorator) {
  let expression = decorator.expression;
  let args = [];
  if (ts.isCallExpression(expression)) {
    args = [...expression.arguments];
    expression = expression.expression;
  }
  return {
    name: ts.isIdentifier(expression) ? expression.text : expression.getText(),
    args,
  };
}

function decoratorsInfo(node) {
  return decoratorsOf(node).map(decoratorInfo);
}

function literalText(node) {
  if (!node) return "";
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  return node.getText().replace(/^['"`]|['"`]$/g, "");
}

function objectPropertyText(node, propertyName) {
  if (!node || !ts.isObjectLiteralExpression(node)) return "";
  const property = node.properties.find((item) => {
    if (!("name" in item) || !item.name) return false;
    return (
      literalText(item.name) === propertyName ||
      item.name.getText() === propertyName
    );
  });
  if (!property || !ts.isPropertyAssignment(property)) return "";
  return literalText(property.initializer);
}

function joinRoute(base, child) {
  return (
    `/${[base, child].filter(Boolean).join("/")}`
      .replace(/\/+/g, "/")
      .replace(/\/$/, "") || "/"
  );
}

function relative(file) {
  return path.relative(rootDir, file).split(path.sep).join("/");
}

function routeDomain(route) {
  return route.split("/").filter(Boolean)[0] || "root";
}

function categoryForDomain(domain) {
  for (const [name, definition] of Object.entries(categoryDefinitions)) {
    if (definition.domains.includes(domain)) return name;
  }
  return "Diğer Tüketici Uçları";
}

function humanizeHandler(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function extractResponses(decorators) {
  return decorators
    .filter((item) => item.name === "ApiResponse")
    .map((item) => {
      const object = item.args[0];
      return {
        status: objectPropertyText(object, "status") || "Tanımlı",
        description: objectPropertyText(object, "description"),
        type: objectPropertyText(object, "type"),
      };
    });
}

function propertyDetails(member, sf) {
  if (
    !ts.isPropertyDeclaration(member) &&
    !ts.isPropertySignature(member) &&
    !ts.isParameter(member)
  ) {
    return null;
  }
  if (!member.name) return null;
  const decorators = decoratorsInfo(member);
  const apiProperty = decorators.find(
    (item) =>
      item.name === "ApiProperty" || item.name === "ApiPropertyOptional",
  );
  const options = apiProperty?.args[0];
  return {
    name: literalText(member.name),
    type: member.type?.getText(sf) || "unknown",
    optional:
      Boolean(member.questionToken || member.initializer) ||
      apiProperty?.name === "ApiPropertyOptional",
    description: objectPropertyText(options, "description"),
    example: objectPropertyText(options, "example"),
  };
}

function extractSchemas() {
  const schemaFiles = schemaDirs.flatMap((directory) =>
    walkFiles(
      directory,
      (file) =>
        file.endsWith(".ts") &&
        !file.endsWith(".d.ts") &&
        !file.includes(".spec.") &&
        !file.includes(".test."),
    ),
  );
  const schemas = new Map();

  const remember = (schema) => {
    if (!schema.name) return;
    const existing = schemas.get(schema.name);
    if (!existing || schema.fields.length > existing.fields.length) {
      schemas.set(schema.name, schema);
    }
  };

  for (const file of schemaFiles) {
    const sf = sourceFile(file);
    const visit = (node) => {
      if (
        (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
        node.name
      ) {
        const fields = node.members
          .map((member) => propertyDetails(member, sf))
          .filter(Boolean);
        const heritage = (node.heritageClauses || []).flatMap((clause) =>
          clause.types.map((item) => item.getText(sf)),
        );
        remember({
          name: node.name.text,
          kind: ts.isClassDeclaration(node) ? "class" : "interface",
          fields,
          heritage,
          definition: "",
          source: relative(file),
        });
      } else if (ts.isEnumDeclaration(node)) {
        remember({
          name: node.name.text,
          kind: "enum",
          fields: node.members.map((member) => ({
            name: literalText(member.name),
            type: member.initializer?.getText(sf) || literalText(member.name),
            optional: false,
            description: "",
            example: "",
          })),
          heritage: [],
          definition: "",
          source: relative(file),
        });
      } else if (ts.isTypeAliasDeclaration(node)) {
        const fields = ts.isTypeLiteralNode(node.type)
          ? node.type.members
              .map((member) => propertyDetails(member, sf))
              .filter(Boolean)
          : [];
        remember({
          name: node.name.text,
          kind: "type",
          fields,
          heritage: [],
          definition: fields.length ? "" : node.type.getText(sf),
          source: relative(file),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return schemas;
}

function schemaNamesIn(typeText) {
  const ignored = new Set([
    "Array",
    "Buffer",
    "Date",
    "Promise",
    "Record",
    "Response",
    "String",
    "unknown",
  ]);
  return [...String(typeText || "").matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)]
    .map((match) => match[0])
    .filter((name) => !ignored.has(name));
}

function schemasForEndpoint(endpoint, schemaIndex) {
  const names = new Set();
  const queue = [
    ...endpoint.parameters.flatMap((parameter) =>
      schemaNamesIn(parameter.type),
    ),
    ...schemaNamesIn(endpoint.returnType),
    ...endpoint.responses.flatMap((response) => schemaNamesIn(response.type)),
  ];

  while (queue.length && names.size < 12) {
    const name = queue.shift();
    if (names.has(name) || !schemaIndex.has(name)) continue;
    names.add(name);
    const schema = schemaIndex.get(name);
    queue.push(
      ...schema.fields.flatMap((field) => schemaNamesIn(field.type)),
      ...schema.heritage.flatMap(schemaNamesIn),
    );
  }

  return [...names].map((name) => schemaIndex.get(name));
}

function extractStatusContracts() {
  const prismaPath = path.join(rootDir, "apps/api/prisma/schema.prisma");
  const source = fs.readFileSync(prismaPath, "utf8");
  return Object.entries(statusContractDefinitions).map(
    ([name, description]) => {
      const match = source.match(
        new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\}`),
      );
      const values = match
        ? match[1]
            .split("\n")
            .map(
              (line) =>
                line
                  .replace(/\/\/.*$/, "")
                  .trim()
                  .split(/\s+/)[0],
            )
            .filter(Boolean)
        : [];
      const offset = match ? match.index : 0;
      const line = source.slice(0, offset).split("\n").length;
      return {
        name,
        description,
        values,
        source: `apps/api/prisma/schema.prisma:${line}`,
      };
    },
  );
}

function extractEndpoints() {
  const controllerFiles = walkFiles(apiModulesDir, (file) =>
    file.endsWith(".controller.ts"),
  );
  const endpoints = [];

  for (const file of controllerFiles) {
    const sf = sourceFile(file);
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;
      const classDecorators = decoratorsInfo(node);
      const controller = classDecorators.find(
        (item) => item.name === "Controller",
      );
      if (!controller) return;

      const baseRoute = literalText(controller.args[0]);
      const classPublic = classDecorators.some(
        (item) => item.name === "Public",
      );
      const adminController =
        classDecorators.some((item) => item.name === "AdminRoute") ||
        baseRoute === "admin" ||
        baseRoute.startsWith("admin/");
      const apiTag =
        literalText(
          classDecorators.find((item) => item.name === "ApiTags")?.args[0],
        ) || routeDomain(`/${baseRoute}`);

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) continue;
        const methodDecorators = decoratorsInfo(member);
        const http = methodDecorators.find((item) =>
          HTTP_DECORATORS.has(item.name),
        );
        if (!http) continue;

        const operation = methodDecorators.find(
          (item) => item.name === "ApiOperation",
        );
        const summary =
          objectPropertyText(operation?.args[0], "summary") ||
          humanizeHandler(member.name.getText(sf));
        const description = objectPropertyText(
          operation?.args[0],
          "description",
        );
        const methodPublic = methodDecorators.some(
          (item) => item.name === "Public",
        );
        const route = joinRoute(baseRoute, literalText(http.args[0]));
        const parameters = [];

        for (const parameter of member.parameters) {
          const parameterDecorators = decoratorsInfo(parameter);
          for (const decorator of parameterDecorators) {
            if (!REQUEST_DECORATORS.has(decorator.name)) continue;
            parameters.push({
              kind: decorator.name,
              name: literalText(decorator.args[0]),
              type: parameter.type?.getText(sf) || "unknown",
              optional: Boolean(
                parameter.questionToken || parameter.initializer,
              ),
            });
          }
        }

        const httpCode = methodDecorators.find(
          (item) => item.name === "HttpCode",
        );
        const consumes = methodDecorators.find(
          (item) => item.name === "ApiConsumes",
        );
        const line =
          sf.getLineAndCharacterOfPosition(member.getStart(sf)).line + 1;
        const auth =
          classPublic || methodPublic
            ? "public"
            : adminController
              ? "admin"
              : "bearer";

        endpoints.push({
          id: `${http.name.toUpperCase()} ${route}`,
          method: http.name.toUpperCase(),
          route,
          summary,
          description,
          handler: member.name.getText(sf),
          auth,
          domain: routeDomain(route),
          domainLabel:
            domainLabels[routeDomain(route)] ||
            humanizeHandler(routeDomain(route)),
          category: categoryForDomain(routeDomain(route)),
          tag: apiTag,
          parameters,
          responses: extractResponses(methodDecorators),
          returnType: member.type?.getText(sf) || "",
          httpCode: literalText(httpCode?.args[0]),
          consumes: literalText(consumes?.args[0]),
          source: relative(file),
          line,
        });
      }
    });
  }

  return endpoints
    .filter((endpoint) => {
      if (endpoint.auth === "admin") return false;
      if (endpoint.route.startsWith("/dev")) return false;
      if (endpoint.route.startsWith("/health")) return false;
      if (endpoint.route.startsWith("/auth/admin")) return false;
      if (endpoint.route.includes("/callback")) return false;
      if (
        endpoint.route !== "/admin/settings/public" &&
        endpoint.route.split("/").includes("admin")
      ) {
        return false;
      }
      if (endpoint.route.split("/").includes("dev")) return false;
      if (endpoint.route.includes("/webhook")) return false;
      if (endpoint.source.includes("paytr-callback-alias")) return false;
      return true;
    })
    .sort(
      (a, b) =>
        categoryDefinitions[a.category].order -
          categoryDefinitions[b.category].order ||
        a.domain.localeCompare(b.domain) ||
        a.route.localeCompare(b.route) ||
        a.method.localeCompare(b.method),
    );
}

function placeholderName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) return "id";
  return "param";
}

function routeTextFromExpression(expression) {
  if (!expression) return null;
  if (
    ts.isStringLiteralLike(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isTemplateExpression(expression)) {
    let result = expression.head.text;
    for (const span of expression.templateSpans) {
      result += `:${placeholderName(span.expression)}${span.literal.text}`;
    }
    return result;
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = routeTextFromExpression(expression.left);
    const right = routeTextFromExpression(expression.right);
    if (left != null && right != null) return left + right;
  }
  return null;
}

function normalizeClientRoute(raw) {
  if (!raw) return null;
  let value = raw.trim();
  value = value.replace(/^https?:\/\/[^/]+/i, "");
  value = value.replace(/^:[A-Za-z0-9_]+/, "");
  const apiIndex = value.indexOf("/api/");
  if (apiIndex >= 0) value = value.slice(apiIndex + 4);
  const gatewayIndex = value.indexOf("/gateway/");
  if (gatewayIndex >= 0) value = value.slice(gatewayIndex + 8);
  value = value.split("?")[0].split("#")[0];
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  return value;
}

function objectLiteralValue(node, propertyName) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (
      literalText(property.name) !== propertyName &&
      property.name.getText() !== propertyName
    )
      continue;
    return property.initializer;
  }
  return null;
}

function extractClientCalls(directories, clientName) {
  const files = directories.flatMap((directory) =>
    walkFiles(directory, (file) => {
      const runtimeSource = file.endsWith(".ts") || file.endsWith(".tsx");
      const testSource =
        file.includes(`${path.sep}__tests__${path.sep}`) ||
        file.includes(`${path.sep}test-utils${path.sep}`) ||
        file.includes(".test.") ||
        file.includes(".spec.");
      return runtimeSource && !testSource;
    }),
  );
  const calls = [];

  for (const file of files) {
    const sf = sourceFile(file);
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        let method = null;
        let routeExpression = null;

        if (ts.isPropertyAccessExpression(node.expression)) {
          const candidate = node.expression.name.text.toLowerCase();
          if (HTTP_CLIENT_METHODS.has(candidate)) {
            method = candidate.toUpperCase();
            routeExpression = node.arguments[0];
          } else if (candidate === "request") {
            const config = node.arguments[0];
            method = literalText(
              objectLiteralValue(config, "method"),
            ).toUpperCase();
            routeExpression = objectLiteralValue(config, "url");
          }
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "fetch"
        ) {
          routeExpression = node.arguments[0];
          const config = node.arguments[1];
          method =
            literalText(objectLiteralValue(config, "method")).toUpperCase() ||
            "GET";
        } else if (
          node.arguments[0] &&
          ts.isObjectLiteralExpression(node.arguments[0]) &&
          ts.isIdentifier(node.expression)
        ) {
          const config = node.arguments[0];
          method = literalText(
            objectLiteralValue(config, "method"),
          ).toUpperCase();
          routeExpression = objectLiteralValue(config, "url");
        }

        if (method && routeExpression) {
          const route = normalizeClientRoute(
            routeTextFromExpression(routeExpression),
          );
          if (route && route !== "/" && !route.startsWith("/_next")) {
            calls.push({
              client: clientName,
              method,
              route,
              source: relative(file),
              line:
                sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return calls;
}

function routeShape(route) {
  return route
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/");
}

function attachContractCoverage(endpoints, webCalls) {
  const callMap = new Map();
  for (const call of webCalls) {
    const key = `${call.method} ${routeShape(call.route)}`;
    const current = callMap.get(key) || [];
    current.push(call);
    callMap.set(key, current);
  }

  return endpoints.map((endpoint) => {
    const key = `${endpoint.method} ${routeShape(endpoint.route)}`;
    const webUsage = callMap.get(key) || [];

    return {
      ...endpoint,
      coverage: webUsage.length > 0 ? "web-required" : "api-available",
      webUsage: webUsage.slice(0, 8),
    };
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeHtml(data) {
  const serialized = JSON.stringify(data).replaceAll("<", "\\u003c");
  const generatedAt = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  }).format(new Date());

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Tarodan Mobile API Contract</title>
  <style>
    :root {
      --bg: #f5f7f8;
      --surface: #ffffff;
      --surface-alt: #eef2f3;
      --text: #172126;
      --muted: #5d6970;
      --line: #d6dde0;
      --brand: #c5352f;
      --brand-soft: #fcecea;
      --blue: #176b87;
      --blue-soft: #e7f3f7;
      --green: #25714c;
      --green-soft: #e8f4ed;
      --amber: #8a5a00;
      --amber-soft: #fff3d6;
      --code: #10181c;
      --code-text: #e8f1f4;
      --get: #176b87;
      --post: #25714c;
      --patch: #8a5a00;
      --put: #6d4c8f;
      --delete: #b52d28;
      --radius: 6px;
      --shadow: 0 1px 2px rgb(18 33 40 / 8%);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      letter-spacing: 0;
    }
    button, input, select { font: inherit; letter-spacing: 0; }
    button { cursor: pointer; }
    a { color: var(--blue); }
    code, pre, .route, .method {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      letter-spacing: 0;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 10px 24px;
      color: #fff;
      background: #172126;
      border-bottom: 3px solid var(--brand);
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-mark {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      background: var(--brand);
      border-radius: 4px;
      font-weight: 800;
    }
    .brand strong { display: block; font-size: 15px; }
    .brand span { display: block; color: #b9c4c9; font-size: 12px; }
    .top-actions { display: flex; gap: 8px; }
    .top-button {
      min-height: 34px;
      padding: 6px 10px;
      color: #fff;
      background: transparent;
      border: 1px solid #536067;
      border-radius: 4px;
    }
    .top-button:hover { border-color: #fff; }
    .page { width: min(1500px, 100%); margin: 0 auto; padding: 28px 24px 60px; }
    .intro {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.5fr);
      gap: 28px;
      align-items: start;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--line);
    }
    h1, h2, h3 { margin: 0; line-height: 1.2; letter-spacing: 0; }
    h1 { max-width: 900px; font-size: 46px; }
    h2 { font-size: 22px; }
    h3 { font-size: 15px; }
    .lede { max-width: 860px; margin: 14px 0 0; color: var(--muted); font-size: 16px; }
    .scope-note {
      padding: 16px;
      background: var(--blue-soft);
      border-left: 4px solid var(--blue);
      border-radius: var(--radius);
    }
    .scope-note strong { display: block; margin-bottom: 6px; }
    .scope-note p { margin: 0; color: #294a57; }
    .stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(130px, 1fr));
      gap: 10px;
      margin: 20px 0 28px;
    }
    .metric {
      min-height: 84px;
      padding: 14px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .metric span { color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 3px; font-size: 26px; line-height: 1; }
    .metric.required { border-top: 3px solid var(--brand); }
    .metric.available { border-top: 3px solid var(--green); }
    .section { padding-top: 30px; }
    .section-heading {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 20px;
      margin-bottom: 14px;
    }
    .section-heading p { max-width: 760px; margin: 5px 0 0; color: var(--muted); }
    .workflows {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .workflow {
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
    }
    .workflow-head { display: flex; justify-content: space-between; gap: 12px; }
    .owner { color: var(--muted); font-size: 11px; white-space: nowrap; }
    .workflow ol { margin: 12px 0; padding-left: 20px; color: var(--muted); }
    .workflow-routes { display: flex; flex-wrap: wrap; gap: 5px; }
    .workflow-routes code {
      padding: 3px 5px;
      color: #294a57;
      background: var(--blue-soft);
      border-radius: 3px;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .status-contract {
      padding: 14px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
    }
    .status-contract p { margin: 6px 0 10px; color: var(--muted); }
    .status-values { display: flex; flex-wrap: wrap; gap: 5px; }
    .status-values code {
      padding: 3px 5px;
      background: var(--surface-alt);
      border-radius: 3px;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .status-source { display: block; margin-top: 10px; color: var(--muted); font-size: 11px; }
    .contract {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      overflow: hidden;
      background: var(--line);
      border: 1px solid var(--line);
      border-radius: var(--radius);
    }
    .contract > div { min-height: 150px; padding: 16px; background: var(--surface); }
    .contract h3 { margin-bottom: 9px; }
    .contract ul { margin: 0; padding-left: 18px; color: var(--muted); }
    .contract code { font-size: 12px; }
    .filters {
      position: sticky;
      top: 56px;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(240px, 2fr) repeat(4, minmax(130px, 1fr)) auto;
      gap: 8px;
      padding: 12px;
      background: rgb(245 247 248 / 96%);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      backdrop-filter: blur(8px);
    }
    .control {
      width: 100%;
      height: 38px;
      padding: 0 10px;
      color: var(--text);
      background: var(--surface);
      border: 1px solid #b8c3c8;
      border-radius: 4px;
    }
    .control:focus { outline: 2px solid #92c7d8; outline-offset: 1px; }
    .action-button {
      height: 38px;
      padding: 0 12px;
      color: #fff;
      background: var(--blue);
      border: 0;
      border-radius: 4px;
      white-space: nowrap;
    }
    .action-button.secondary {
      color: var(--text);
      background: var(--surface);
      border: 1px solid #b8c3c8;
    }
    .results-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      margin: 14px 0 8px;
      color: var(--muted);
    }
    .category-block { margin-top: 18px; }
    .category-title {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 0 2px 8px;
      border-bottom: 2px solid #bec8cc;
    }
    .category-title span { color: var(--muted); }
    .endpoint-list {
      overflow: hidden;
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 0;
      border-radius: 0 0 var(--radius) var(--radius);
    }
    .endpoint { border-top: 1px solid var(--line); }
    .endpoint:first-child { border-top: 0; }
    .endpoint > summary {
      min-height: 58px;
      display: grid;
      grid-template-columns: 68px minmax(240px, 1.4fr) minmax(180px, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      list-style: none;
      cursor: pointer;
    }
    .endpoint > summary::-webkit-details-marker { display: none; }
    .endpoint > summary:hover { background: #f8fafb; }
    .endpoint[open] > summary { background: var(--surface-alt); }
    .method {
      width: 62px;
      height: 28px;
      display: grid;
      place-items: center;
      color: #fff;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 800;
    }
    .method.GET { background: var(--get); }
    .method.POST { background: var(--post); }
    .method.PATCH { background: var(--patch); }
    .method.PUT { background: var(--put); }
    .method.DELETE { background: var(--delete); }
    .route { min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
    .summary-text { min-width: 0; color: var(--muted); }
    .badges { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 5px; }
    .badge {
      min-height: 23px;
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .badge.public { color: var(--green); background: var(--green-soft); }
    .badge.bearer { color: var(--blue); background: var(--blue-soft); }
    .badge.web-required { color: #9d2824; background: var(--brand-soft); }
    .badge.api-available { color: var(--green); background: var(--green-soft); }
    .endpoint-detail {
      padding: 16px;
      background: #fbfcfc;
      border-top: 1px solid var(--line);
    }
    .detail-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
      gap: 18px;
    }
    .detail-section + .detail-section { margin-top: 16px; }
    .detail-section h3 { margin-bottom: 7px; }
    .detail-section p { margin: 0; color: var(--muted); }
    .schema + .schema { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
    .schema h4 { margin: 0 0 7px; font-size: 13px; }
    .schema h4 span { color: var(--muted); font-weight: 500; }
    .param-table, .gap-table, .socket-table { width: 100%; border-collapse: collapse; }
    .param-table th, .param-table td, .gap-table th, .gap-table td, .socket-table th, .socket-table td {
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
      border: 1px solid var(--line);
    }
    .param-table th, .gap-table th, .socket-table th { background: var(--surface-alt); font-size: 12px; }
    .gap-table td:first-child { width: 72px; }
    .gap-table a { text-decoration: none; }
    .gap-table a:hover { text-decoration: underline; }
    pre {
      margin: 0;
      padding: 13px;
      overflow: auto;
      color: var(--code-text);
      background: var(--code);
      border-radius: 4px;
      font-size: 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .source { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .usage-list { margin: 7px 0 0; padding-left: 18px; color: var(--muted); }
    .detail-actions { display: flex; gap: 7px; margin-top: 10px; }
    .small-button {
      min-height: 31px;
      padding: 4px 9px;
      color: var(--text);
      background: var(--surface);
      border: 1px solid #aebbc0;
      border-radius: 4px;
    }
    .small-button:hover { border-color: var(--blue); color: var(--blue); }
    .empty {
      padding: 36px;
      text-align: center;
      color: var(--muted);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
    }
    .socket-note { margin: 0 0 12px; color: var(--muted); }
    .footer {
      margin-top: 36px;
      padding-top: 18px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      font-size: 12px;
    }
    @media (max-width: 1050px) {
      .intro { grid-template-columns: 1fr; }
      .stats { grid-template-columns: repeat(3, 1fr); }
      .workflows, .status-grid { grid-template-columns: repeat(2, 1fr); }
      .filters { grid-template-columns: repeat(3, 1fr); }
      .filters .search { grid-column: 1 / -1; }
      .endpoint > summary { grid-template-columns: 68px minmax(0, 1fr) auto; }
      .summary-text { grid-column: 2 / -1; grid-row: 2; }
      .detail-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 680px) {
      .topbar { position: static; align-items: flex-start; padding: 10px 14px; }
      .top-actions { display: none; }
      .page { padding: 20px 12px 40px; }
      h1 { font-size: 30px; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .workflows, .status-grid, .contract { grid-template-columns: 1fr; }
      .filters { position: static; grid-template-columns: 1fr 1fr; }
      .filters .search { grid-column: 1 / -1; }
      .endpoint > summary { grid-template-columns: 62px minmax(0, 1fr); gap: 8px; }
      .badges { grid-column: 1 / -1; justify-content: flex-start; }
      .summary-text { grid-column: 1 / -1; }
      .results-meta { align-items: flex-start; flex-direction: column; gap: 5px; }
    }
    @media print {
      body { background: #fff; }
      .topbar, .filters, .top-actions, .detail-actions { display: none !important; }
      .page { width: 100%; padding: 0; }
      .endpoint { break-inside: avoid; }
      .endpoint-detail { display: block; }
      details.endpoint > * { display: block; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">T</div>
      <div>
        <strong>Tarodan Mobile API Contract</strong>
        <span>Harici mobil istemci için tüketici API sözleşmesi</span>
      </div>
    </div>
    <div class="top-actions">
      <button class="top-button" type="button" id="copy-required">Zorunlu uçları kopyala</button>
      <button class="top-button" type="button" onclick="window.print()">Yazdır / PDF</button>
    </div>
  </header>

  <main class="page">
    <section class="intro">
      <div>
        <h1>Mobil uygulama için eksiksiz API sözleşmesi</h1>
        <p class="lede">
          Bu belge API controller’larını ve web istemcisinin işlev yüzeyini tarar. Mobil uygulama ayrı bir
          repoda yönetilir; bu katalog mobil implementasyon durumunu ölçmez, uygulanması gereken sunucu
          sözleşmesini tanımlar.
        </p>
      </div>
      <aside class="scope-note">
        <strong>Kapsam ve güvenlik sınırı</strong>
        <p>
          Admin, dev/test, health ve provider callback/webhook uçları mobil sözleşmeye dahil edilmez. Public uçlar tokensız;
          diğer tüm uçlar <code>Authorization: Bearer &lt;ACCESS_TOKEN&gt;</code> ister. PayTR callback’leri yalnız sağlayıcı içindir.
        </p>
      </aside>
    </section>

    <section class="stats" id="stats"></section>

    <section class="section" id="workflows">
      <div class="section-heading">
        <div>
          <h2>Mobil işlev akışları</h2>
          <p>Mobil ekranların endpointleri tek tek değil, bu uçtan uca iş akışlarını tamamlayacak şekilde kullanması gerekir.</p>
        </div>
      </div>
      <div class="workflows" id="workflow-list"></div>
    </section>

    <section class="section" id="statuses">
      <div class="section-heading">
        <div>
          <h2>Mobil durum sözlükleri</h2>
          <p>Mobil filtre, rozet, aksiyon görünürlüğü ve polling kararları bu backend enum değerleri üzerinden çalışmalıdır.</p>
        </div>
      </div>
      <div class="status-grid" id="status-contracts"></div>
    </section>

    <section class="section" id="mobile-requirements">
      <div class="section-heading">
        <div>
          <h2>Web işlev paritesi için zorunlu uçlar</h2>
          <p>
            Web üretim kodunda kullanılan tüketici uçları mobil uygulamanın işlevsel kapsamına dahildir.
            Harici mobil repo bu listeyi kendi implementasyon ve kabul testleriyle doğrulamalıdır.
          </p>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="gap-table">
          <thead><tr><th>Metot</th><th>Endpoint</th><th>Alan</th><th>Auth</th><th>İşlev</th></tr></thead>
          <tbody id="required-endpoints"></tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>Ortak istemci sözleşmesi</h2>
          <p>Web BFF cookie kullanır; native istemci access/refresh token çiftini işletim sisteminin güvenli depolamasında tutmalıdır.</p>
        </div>
      </div>
      <div class="contract">
        <div>
          <h3>Base URL ve auth</h3>
          <ul>
            <li>Production: <code>MOBILE_API_BASE_URL=${escapeHtml(data.metadata.productionApiUrl)}</code></li>
            <li>Preview: <code>MOBILE_API_BASE_URL=${escapeHtml(data.metadata.previewApiUrl)}</code></li>
            <li>Local iOS: <code>${escapeHtml(data.metadata.localIosApiUrl)}</code>; Android emulator: <code>${escapeHtml(data.metadata.localAndroidApiUrl)}</code>.</li>
            <li>Bearer token her korumalı isteğe eklenmelidir.</li>
            <li>401’de tek-uçuş <code>POST /auth/refresh</code> uygulanmalı ve rotated refresh token atomik olarak saklanmalıdır.</li>
            <li><code>USER_BANNED</code> 403 tam ekran ban akışına yönlendirir.</li>
          </ul>
        </div>
        <div>
          <h3>İstek ve hata modeli</h3>
          <ul>
            <li>JSON isteklerinde <code>Content-Type: application/json</code>.</li>
            <li>Dosya uçlarında <code>multipart/form-data</code>; Content-Type boundary istemci tarafından üretilir.</li>
            <li>400 validation, 401 session, 403 yetki/ban, 404 kaynak, 409 yarış/idempotency olarak ele alınır.</li>
            <li>Mutation sonrası ilgili TanStack Query anahtarları invalidate edilir.</li>
          </ul>
        </div>
        <div>
          <h3>Ödeme ve guest kuralları</h3>
          <ul>
            <li>Guest uçlarında auth interceptor içermeyen <code>guestApi</code> kullanılır.</li>
            <li><code>POST /orders/quote</code> isteği ürün adedi ve varsa kupon kodunu içerir.</li>
            <li>Quote’taki <code>pricingHash</code> ve <code>shippingTariffVersion</code>, checkout isteğine değiştirilmeden geri gönderilir.</li>
            <li>Ekrandaki ara toplam, kargo, vergi ve nihai tutar quote <code>pricing</code> alanından gösterilir; istemci hesabı otorite değildir.</li>
            <li><code>409 PRICING_CHANGED</code> sonrasında quote yenilenir ve kullanıcı güncel tutarı yeniden onaylar.</li>
            <li>PayTR sonucu yalnız callback ile kesinleşir; mobil status endpointini poll eder.</li>
            <li>Ödeme başlatma yanıtındaki <code>paymentAccessToken</code> güvenli depoda tutulur ve public ödeme uçlarına <code>X-Payment-Capability</code> olarak eklenir.</li>
            <li>Mutation tekrarlarında checkout/idempotency anahtarı korunur.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section" id="reference">
      <div class="section-heading">
        <div>
          <h2>Endpoint kataloğu</h2>
          <p>“Web paritesi için zorunlu” filtresi web istemcisinde kullanılan uçları; “API’de ek olarak mevcut” filtresi diğer tüketici uçlarını gösterir.</p>
        </div>
      </div>
      <div class="filters" aria-label="Endpoint filtreleri">
        <input class="control search" id="search" type="search" placeholder="Endpoint, açıklama, DTO, handler veya kaynak ara">
        <select class="control" id="category-filter"><option value="">Tüm alanlar</option></select>
        <select class="control" id="domain-filter"><option value="">Tüm modüller</option></select>
        <select class="control" id="method-filter">
          <option value="">Tüm metotlar</option>
          <option>GET</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option>
        </select>
        <select class="control" id="auth-filter">
          <option value="">Tüm auth tipleri</option>
          <option value="public">Public</option>
          <option value="bearer">Bearer</option>
        </select>
        <select class="control" id="coverage-filter">
          <option value="">Tüm sözleşme kapsamı</option>
          <option value="web-required">Web paritesi için zorunlu</option>
          <option value="api-available">API’de ek olarak mevcut</option>
        </select>
      </div>
      <div class="results-meta">
        <span id="result-count"></span>
        <button type="button" class="action-button secondary" id="reset-filters">Filtreleri temizle</button>
      </div>
      <div id="endpoint-root"></div>
    </section>

    <section class="section" id="realtime">
      <div class="section-heading">
        <div>
          <h2>Realtime Socket.IO sözleşmesi</h2>
          <p>Socket base URL API originidir; handshake auth içinde access token taşınır. Oda katılımı sunucuda üyelik/sahiplik kontrolünden geçer.</p>
        </div>
      </div>
      <p class="socket-note">
        Mobil mesajlaşma, bildirim, teklif, ürün ve sipariş ekranları aşağıdaki olayları desteklemelidir.
        <strong>Backend güvenlik notu:</strong> <code>join:thread</code> katılımcıyı doğruluyor;
        <code>order:subscribe</code> ise mevcut gateway’de sipariş tarafı kontrolü yapmıyor. Bu kontrol backend’de
        eklenmeden <code>order:updated</code> payload’ına hassas veri konulmamalıdır.
      </p>
      <div style="overflow-x:auto">
        <table class="socket-table">
          <thead><tr><th>Yön</th><th>Event</th><th>Payload</th><th>Kullanım</th></tr></thead>
          <tbody id="socket-events"></tbody>
        </table>
      </div>
    </section>

    <footer class="footer">
      <strong>Üretim:</strong> ${escapeHtml(generatedAt)} ·
      <strong>Kaynak:</strong> <code>apps/api/src/modules/**/*controller.ts</code>,
      <code>apps/web/src</code> · Mobil kaynak kodu bu üretimde taranmaz ·
      Yenilemek için: <code>node scripts/generate-mobile-api-doc.mjs</code>
    </footer>
  </main>

  <script id="doc-data" type="application/json">${serialized}</script>
  <script>
    const data = JSON.parse(document.getElementById("doc-data").textContent);
    const endpoints = data.endpoints;
    const coverageLabels = {
      "web-required": "Web paritesi için zorunlu",
      "api-available": "API’de ek olarak mevcut"
    };
    const authLabels = { public: "Public", bearer: "Bearer" };
    const escapeHtml = (value) => String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    const stableId = (endpoint) => "ep-" + (endpoint.method + "-" + endpoint.route)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    function curlFor(endpoint) {
      const headers = [];
      if (endpoint.auth === "bearer") headers.push('-H "Authorization: Bearer <ACCESS_TOKEN>"');
      const body = endpoint.parameters.find((parameter) => parameter.kind === "Body");
      const upload = endpoint.parameters.some((parameter) =>
        parameter.kind === "UploadedFile" || parameter.kind === "UploadedFiles"
      );
      if (upload) headers.push('-F "file=@/path/to/file.pdf"');
      else if (body && !["GET", "DELETE"].includes(endpoint.method)) {
        headers.push('-H "Content-Type: application/json"');
        headers.push("-d '" + "{ \\"_type\\": \\"" + (body.type || "RequestBody") + "\\" }" + "'");
      }
      return ["curl -X " + endpoint.method, '"<API_BASE>' + endpoint.route + '"', ...headers].join(" \\\\\\n  ");
    }

    function usageHtml(title, usage) {
      if (!usage.length) return '<p class="source">' + title + ': istemci API katmanında eşleşme bulunmadı.</p>';
      return '<div class="detail-section"><h3>' + title + '</h3><ul class="usage-list">' +
        usage.map((item) => '<li><code>' + escapeHtml(item.source + ":" + item.line) + '</code></li>').join("") +
        '</ul></div>';
    }

    function schemasHtml(schemas) {
      if (!schemas.length) {
        return '<p>Controller imzasında ayrıştırılabilir bir DTO şeması bulunmuyor.</p>';
      }
      return schemas.map((schema) => {
        const body = schema.fields.length
          ? '<table class="param-table"><thead><tr><th>Alan</th><th>Tip</th><th>Zorunluluk</th><th>Açıklama / örnek</th></tr></thead><tbody>' +
            schema.fields.map((field) =>
              '<tr><td><code>' + escapeHtml(field.name) + '</code></td><td><code>' +
              escapeHtml(field.type) + '</code></td><td>' +
              (field.optional ? "Opsiyonel" : "Zorunlu") + '</td><td>' +
              escapeHtml(field.description || field.example || "") + '</td></tr>'
            ).join("") + '</tbody></table>'
          : '<p><code>' + escapeHtml(schema.definition || "Alan tanımı yok") + '</code></p>';
        const heritage = schema.heritage.length
          ? ' · extends <code>' + escapeHtml(schema.heritage.join(", ")) + '</code>'
          : "";
        return '<div class="schema"><h4><code>' + escapeHtml(schema.name) + '</code> ' +
          '<span>' + escapeHtml(schema.kind) + heritage + '</span></h4>' + body + '</div>';
      }).join("");
    }

    function endpointHtml(endpoint) {
      const parameters = endpoint.parameters.length
        ? '<table class="param-table"><thead><tr><th>Konum</th><th>Ad</th><th>Tip</th><th>Zorunluluk</th></tr></thead><tbody>' +
          endpoint.parameters.map((parameter) =>
            '<tr><td>' + escapeHtml(parameter.kind) + '</td><td><code>' +
            escapeHtml(parameter.name || "DTO") + '</code></td><td><code>' +
            escapeHtml(parameter.type) + '</code></td><td>' +
            (parameter.optional ? "Opsiyonel" : "Zorunlu") + '</td></tr>'
          ).join("") + '</tbody></table>'
        : '<p>Path/query/body parametresi tanımlanmamış.</p>';
      const description = endpoint.description || endpoint.summary;
      const responseText = endpoint.responses.length
        ? endpoint.responses.map((response) =>
            '<li><code>' + escapeHtml(response.status) + '</code> ' +
            escapeHtml(response.description || "") +
            (response.type ? ' · <code>' + escapeHtml(response.type) + '</code>' : "") + '</li>'
          ).join("")
        : '<li>Başarı yanıtı controller tarafından ayrıca belgelenmemiş; ilgili service response tipi kullanılır.</li>';

      return '<details class="endpoint" id="' + stableId(endpoint) + '">' +
        '<summary>' +
          '<span class="method ' + endpoint.method + '">' + endpoint.method + '</span>' +
          '<span class="route">' + escapeHtml(endpoint.route) + '</span>' +
          '<span class="summary-text">' + escapeHtml(endpoint.summary) + '</span>' +
          '<span class="badges">' +
            '<span class="badge ' + endpoint.auth + '">' + authLabels[endpoint.auth] + '</span>' +
            '<span class="badge ' + endpoint.coverage + '">' + coverageLabels[endpoint.coverage] + '</span>' +
          '</span>' +
        '</summary>' +
        '<div class="endpoint-detail"><div class="detail-grid">' +
          '<div>' +
            '<div class="detail-section"><h3>Amaç</h3><p>' + escapeHtml(description) + '</p></div>' +
            '<div class="detail-section"><h3>İstek sözleşmesi</h3>' + parameters + '</div>' +
            '<div class="detail-section"><h3>Yanıtlar</h3><ul class="usage-list">' + responseText +
              (endpoint.returnType ? '<li>Dönüş imzası: <code>' + escapeHtml(endpoint.returnType) + '</code></li>' : "") +
            '</ul></div>' +
            '<div class="detail-section"><h3>İlgili veri şemaları</h3>' + schemasHtml(endpoint.schemas) + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="detail-section"><h3>cURL</h3><pre>' + escapeHtml(curlFor(endpoint)) + '</pre></div>' +
            '<div class="detail-actions">' +
              '<button type="button" class="small-button copy-route" data-value="' +
                escapeHtml(endpoint.method + " " + endpoint.route) + '">Endpointi kopyala</button>' +
              '<button type="button" class="small-button copy-curl" data-value="' +
                escapeHtml(curlFor(endpoint)) + '">cURL kopyala</button>' +
            '</div>' +
            '<div class="detail-section"><h3>Kaynak</h3><p class="source"><code>' +
              escapeHtml(endpoint.source + ":" + endpoint.line) + '</code><br>Handler: <code>' +
              escapeHtml(endpoint.handler) + '</code></p></div>' +
            usageHtml("Web kullanımı", endpoint.webUsage) +
          '</div>' +
        '</div></div>' +
      '</details>';
    }

    function currentFilters() {
      return {
        search: document.getElementById("search").value.trim().toLocaleLowerCase("tr"),
        category: document.getElementById("category-filter").value,
        domain: document.getElementById("domain-filter").value,
        method: document.getElementById("method-filter").value,
        auth: document.getElementById("auth-filter").value,
        coverage: document.getElementById("coverage-filter").value,
      };
    }

    function renderEndpoints() {
      const filters = currentFilters();
      const filtered = endpoints.filter((endpoint) => {
        const haystack = [
          endpoint.method, endpoint.route, endpoint.summary, endpoint.description,
          endpoint.handler, endpoint.domainLabel, endpoint.category, endpoint.source,
          ...endpoint.parameters.flatMap((parameter) => [parameter.name, parameter.type])
        ].join(" ").toLocaleLowerCase("tr");
        return (!filters.search || haystack.includes(filters.search)) &&
          (!filters.category || endpoint.category === filters.category) &&
          (!filters.domain || endpoint.domain === filters.domain) &&
          (!filters.method || endpoint.method === filters.method) &&
          (!filters.auth || endpoint.auth === filters.auth) &&
          (!filters.coverage || endpoint.coverage === filters.coverage);
      });

      document.getElementById("result-count").textContent =
        filtered.length + " / " + endpoints.length + " endpoint gösteriliyor";
      const root = document.getElementById("endpoint-root");
      if (!filtered.length) {
        root.innerHTML = '<div class="empty">Bu filtrelerle eşleşen endpoint bulunamadı.</div>';
        return;
      }
      const groups = filtered.reduce((result, endpoint) => {
        (result[endpoint.category] ||= []).push(endpoint);
        return result;
      }, {});
      root.innerHTML = Object.entries(groups).map(([category, items]) =>
        '<section class="category-block"><div class="category-title"><h3>' +
          escapeHtml(category) + '</h3><span>' + items.length + ' endpoint</span></div>' +
          '<div class="endpoint-list">' + items.map(endpointHtml).join("") + '</div></section>'
      ).join("");
    }

    function renderStats() {
      const count = (coverage) => endpoints.filter((endpoint) => endpoint.coverage === coverage).length;
      const stats = [
        ["Tüketici endpointi", endpoints.length, ""],
        ["Public", endpoints.filter((endpoint) => endpoint.auth === "public").length, ""],
        ["Bearer", endpoints.filter((endpoint) => endpoint.auth === "bearer").length, ""],
        ["Web paritesi için zorunlu", count("web-required"), "required"],
        ["API’de ek olarak mevcut", count("api-available"), "available"],
      ];
      document.getElementById("stats").innerHTML = stats.map(([label, value, style]) =>
        '<div class="metric ' + style + '"><span>' + escapeHtml(label) +
        '</span><strong>' + value + '</strong></div>'
      ).join("");
    }

    function renderWorkflows() {
      document.getElementById("workflow-list").innerHTML = data.workflows.map((workflow) =>
        '<article class="workflow"><div class="workflow-head"><h3>' + escapeHtml(workflow.title) +
        '</h3><span class="owner">' + escapeHtml(workflow.owner) + '</span></div><ol>' +
        workflow.steps.map((step) => '<li>' + escapeHtml(step) + '</li>').join("") +
        '</ol><div class="workflow-routes">' +
        workflow.routes.map((route) => '<code>' + escapeHtml(route) + '</code>').join("") +
        '</div></article>'
      ).join("");
    }

    function renderStatusContracts() {
      document.getElementById("status-contracts").innerHTML = data.statusContracts.map((contract) =>
        '<article class="status-contract"><h3><code>' + escapeHtml(contract.name) +
        '</code></h3><p>' + escapeHtml(contract.description) + '</p><div class="status-values">' +
        contract.values.map((value) => '<code>' + escapeHtml(value) + '</code>').join("") +
        '</div><code class="status-source">' + escapeHtml(contract.source) + '</code></article>'
      ).join("");
    }

    function renderRequiredEndpoints() {
      document.getElementById("required-endpoints").innerHTML = endpoints
        .filter((endpoint) => endpoint.coverage === "web-required")
        .map((endpoint) =>
          '<tr><td><span class="method ' + endpoint.method + '">' + endpoint.method +
          '</span></td><td><a href="#' + stableId(endpoint) + '"><code>' +
          escapeHtml(endpoint.route) + '</code></a></td><td>' +
          escapeHtml(endpoint.domainLabel) + '</td><td>' +
          escapeHtml(authLabels[endpoint.auth]) + '</td><td>' +
          escapeHtml(endpoint.summary) + '</td></tr>'
        ).join("");
    }

    function initializeFilters() {
      const categories = [...new Set(endpoints.map((endpoint) => endpoint.category))];
      const domains = [...new Set(endpoints.map((endpoint) => endpoint.domain))]
        .sort((a, b) => (data.domainLabels[a] || a).localeCompare(data.domainLabels[b] || b, "tr"));
      document.getElementById("category-filter").insertAdjacentHTML("beforeend",
        categories.map((category) => '<option value="' + escapeHtml(category) + '">' +
          escapeHtml(category) + '</option>').join("")
      );
      document.getElementById("domain-filter").insertAdjacentHTML("beforeend",
        domains.map((domain) => '<option value="' + escapeHtml(domain) + '">' +
          escapeHtml(data.domainLabels[domain] || domain) + '</option>').join("")
      );
      document.querySelectorAll(".filters .control").forEach((control) =>
        control.addEventListener(control.type === "search" ? "input" : "change", renderEndpoints)
      );
      document.getElementById("reset-filters").addEventListener("click", () => {
        document.querySelectorAll(".filters .control").forEach((control) => control.value = "");
        renderEndpoints();
      });
    }

    async function copyText(value, button) {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      const previous = button.textContent;
      button.textContent = "Kopyalandı";
      setTimeout(() => button.textContent = previous, 1200);
    }

    document.addEventListener("click", (event) => {
      const button = event.target.closest(".copy-route, .copy-curl");
      if (button) copyText(button.dataset.value, button);
    });
    document.getElementById("required-endpoints").addEventListener("click", (event) => {
      const link = event.target.closest("a[href^='#ep-']");
      if (!link) return;
      const endpoint = document.querySelector(link.getAttribute("href"));
      if (endpoint) endpoint.open = true;
    });
    document.getElementById("copy-required").addEventListener("click", (event) => {
      const text = endpoints.filter((endpoint) => endpoint.coverage === "web-required")
        .map((endpoint) => endpoint.method + " " + endpoint.route + " — " + endpoint.summary).join("\\n");
      copyText(text || "Web paritesi için zorunlu endpoint bulunmadı.", event.currentTarget);
    });
    document.getElementById("socket-events").innerHTML = data.realtimeEvents.map((item) =>
      '<tr><td>' + escapeHtml(item.direction) + '</td><td><code>' + escapeHtml(item.event) +
      '</code></td><td><code>' + escapeHtml(item.payload) + '</code></td><td>' +
      escapeHtml(item.purpose) + '</td></tr>'
    ).join("");

    renderStats();
    renderWorkflows();
    renderStatusContracts();
    renderRequiredEndpoints();
    initializeFilters();
    renderEndpoints();
  </script>
</body>
</html>`;
}

const schemaIndex = extractSchemas();
const endpoints = extractEndpoints().map((endpoint) => ({
  ...endpoint,
  schemas: schemasForEndpoint(endpoint, schemaIndex),
}));
const webCalls = extractClientCalls([webDir], "web");
const endpointsWithUsage = attachContractCoverage(endpoints, webCalls);

const data = {
  endpoints: endpointsWithUsage,
  workflows,
  realtimeEvents,
  statusContracts: extractStatusContracts(),
  categoryDefinitions,
  domainLabels,
  metadata: {
    endpointCount: endpointsWithUsage.length,
    webCallCount: webCalls.length,
    productionApiUrl: "<PRODUCTION_API_ORIGIN>/api",
    previewApiUrl: "<PREVIEW_API_ORIGIN>/api",
    localIosApiUrl: "http://localhost:3001/api",
    localAndroidApiUrl: "http://10.0.2.2:3001/api",
    generatedAt: new Date().toISOString(),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, makeHtml(data), "utf8");

const counts = Object.fromEntries(
  ["web-required", "api-available"].map((coverage) => [
    coverage,
    endpointsWithUsage.filter((endpoint) => endpoint.coverage === coverage)
      .length,
  ]),
);

console.log(`Generated ${relative(outputPath)}`);
console.log(`Endpoints: ${endpointsWithUsage.length}`);
console.log(`Client calls: web=${webCalls.length}`);
console.log(`Contract coverage: ${JSON.stringify(counts)}`);
