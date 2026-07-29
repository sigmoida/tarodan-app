#!/usr/bin/env node

/**
 * Read-only eLogo diagnostics.
 *
 * Usage from apps/api:
 *   pnpm smoke:elogo
 *   pnpm smoke:elogo -- connection
 *   pnpm smoke:elogo -- diagnose
 *   ELOGO_PDF_UUID=<uuid> pnpm smoke:elogo -- pdf
 *
 * This script never calls SendDocument and never mutates the database.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const mode =
  process.argv.slice(2).find((argument) => argument !== "--") ?? "connection";
const supportedModes = new Set(["connection", "diagnose", "pdf"]);

if (!supportedModes.has(mode)) {
  console.error("Usage: elogo-smoke.mjs [connection|diagnose|pdf]");
  process.exit(2);
}

const endpoint =
  process.env.ELOGO_SOAP_URL ?? "https://pb.elogo.com.tr/PostBoxService.svc";
const username = process.env.ELOGO_WS_USERNAME ?? "";
const password = process.env.ELOGO_WS_PASSWORD ?? "";
const timeoutMs = Number(process.env.ELOGO_SOAP_TIMEOUT_MS ?? 30000);

const namespaces = {
  service: "http://tempuri.org/",
  invoice: "http://schemas.datacontract.org/2004/07/eFaturaWebService",
  arrays: "http://schemas.microsoft.com/2003/10/Serialization/Arrays",
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function maskValue(value) {
  if (!value) return "not-configured";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function readTag(xml, name) {
  const match = xml.match(
    new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"),
  );
  return match?.[1]?.trim() ?? null;
}

async function soap(operation, bodyContent) {
  const body =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:tem="${namespaces.service}" xmlns:arr="${namespaces.arrays}" ` +
    `xmlns:efat="${namespaces.invoice}"><soapenv:Header/><soapenv:Body>` +
    `${bodyContent}</soapenv:Body></soapenv:Envelope>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `${namespaces.service}IPostBoxService/${operation}`,
      },
      body,
      signal: controller.signal,
    });
    return { status: response.status, xml: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

function requireProviderConfig() {
  if (!endpoint.startsWith("https://")) {
    throw new Error("ELOGO_SOAP_URL must use HTTPS");
  }
  if (!username || !password) {
    throw new Error("ELOGO_WS_USERNAME and ELOGO_WS_PASSWORD are required");
  }
}

async function login() {
  requireProviderConfig();
  const inner =
    "<tem:Login><tem:login>" +
    "<efat:appStr>Tarodan</efat:appStr>" +
    `<efat:passWord>${escapeXml(password)}</efat:passWord>` +
    "<efat:source></efat:source>" +
    `<efat:userName>${escapeXml(username)}</efat:userName>` +
    "<efat:version>1.0</efat:version>" +
    "</tem:login></tem:Login>";
  const result = await soap("Login", inner);
  const sessionId = readTag(result.xml, "sessionID");

  if (!sessionId) {
    const fault = readTag(result.xml, "faultstring");
    throw new Error(
      `Login failed [${result.status}]: ${fault ?? result.xml.slice(0, 300)}`,
    );
  }
  return sessionId;
}

async function logout(sessionId) {
  await soap(
    "Logout",
    `<tem:Logout><tem:sessionID>${escapeXml(sessionId)}</tem:sessionID></tem:Logout>`,
  );
}

async function checkConnection() {
  console.log(`Endpoint: ${endpoint}`);
  console.log(`User: ${username.slice(0, 4)}***`);
  const sessionId = await login();

  try {
    console.log("Login successful.");
    const taxpayerId = process.env.ELOGO_TEST_VKN;
    if (!taxpayerId) return;

    const inner =
      "<tem:GetValidateGIBUser>" +
      `<tem:sessionID>${escapeXml(sessionId)}</tem:sessionID>` +
      "<tem:paramList>" +
      `<arr:string>VKN=${escapeXml(taxpayerId)}</arr:string>` +
      "<arr:string>DOCUMENTTYPE=0</arr:string>" +
      "</tem:paramList></tem:GetValidateGIBUser>";
    const result = await soap("GetValidateGIBUser", inner);
    const isGibUser =
      readTag(result.xml, "ISGIBUSER") ??
      result.xml.match(/ISGIBUSER\s*=\s*([^<"]+)/i)?.[1]?.trim();
    console.log(
      `Taxpayer ${taxpayerId}: ${isGibUser === "1" ? "e-invoice" : "e-archive"}`,
    );
  } finally {
    await logout(sessionId);
    console.log("Logout successful. No document was created.");
  }
}

async function fetchPdf() {
  const documentUuid = process.env.ELOGO_PDF_UUID;
  const outputPath = process.env.ELOGO_PDF_OUT ?? "/tmp/elogo-invoice.pdf";
  if (!documentUuid) {
    throw new Error("ELOGO_PDF_UUID is required in pdf mode");
  }

  const sessionId = await login();
  try {
    const inner =
      "<tem:getEArchiveInvoicePdfData>" +
      `<tem:sessionID>${escapeXml(sessionId)}</tem:sessionID>` +
      `<tem:uuid>${escapeXml(documentUuid)}</tem:uuid>` +
      "<tem:allInvoicesOrJustSigned>true</tem:allInvoicesOrJustSigned>" +
      "<tem:isCanceled>false</tem:isCanceled>" +
      "</tem:getEArchiveInvoicePdfData>";
    const result = await soap("getEArchiveInvoicePdfData", inner);
    const candidates = [...result.xml.matchAll(/>([A-Za-z0-9+/=]{500,})</g)]
      .map((match) => Buffer.from(match[1], "base64"))
      .filter((buffer) => buffer.subarray(0, 5).toString("latin1") === "%PDF-");

    const pdf = candidates.sort((a, b) => b.length - a.length)[0];
    if (!pdf) {
      throw new Error(
        `No PDF payload found in response: ${result.xml.slice(0, 600)}`,
      );
    }

    writeFileSync(outputPath, pdf, { mode: 0o600 });
    console.log(`PDF written to ${outputPath} (${pdf.length} bytes).`);
  } finally {
    await logout(sessionId);
  }
}

async function diagnoseDatabase() {
  const prisma = new PrismaClient();
  try {
    console.log("=== CONFIG ===");
    console.log("ELOGO_ENABLED:", process.env.ELOGO_ENABLED);
    console.log("ELOGO_SOAP_MODE:", process.env.ELOGO_SOAP_MODE);
    console.log("ELOGO_COMPANY_VKN:", maskValue(process.env.ELOGO_COMPANY_VKN));
    console.log("SMTP configured:", Boolean(process.env.SMTP_HOST));
    console.log(
      "S3 configured:",
      Boolean(process.env.AWS_S3_BUCKET ?? process.env.S3_BUCKET),
    );

    const invoices = await prisma.elogoInvoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        type: true,
        status: true,
        invoiceNumber: true,
        emailSentAt: true,
        pdfUrl: true,
        elogoResultMsg: true,
        attemptCount: true,
        createdAt: true,
      },
    });

    console.log("\n=== LATEST ELOGO INVOICES ===");
    if (invoices.length === 0) console.log("No invoice records found.");
    for (const invoice of invoices) {
      console.log(
        [
          invoice.createdAt.toISOString(),
          invoice.type,
          invoice.status,
          `number=${invoice.invoiceNumber ?? "-"}`,
          `mail=${invoice.emailSentAt ? "yes" : "no"}`,
          `pdf=${invoice.pdfUrl ? "yes" : "no"}`,
          `attempts=${invoice.attemptCount}`,
        ].join(" "),
      );
      if (invoice.elogoResultMsg) {
        console.log(`  result: ${invoice.elogoResultMsg}`);
      }
    }

    const orders = await prisma.order.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        totalAmount: true,
        seller: { select: { sellerType: true } },
      },
    });
    const orderInvoices = await prisma.elogoInvoice.findMany({
      where: { sourceId: { in: orders.map((order) => order.id) } },
      select: {
        sourceId: true,
        type: true,
        status: true,
        emailSentAt: true,
      },
    });

    console.log("\n=== LATEST ORDERS ===");
    for (const order of orders) {
      const relatedInvoices = orderInvoices.filter(
        (invoice) => invoice.sourceId === order.id,
      );
      const invoiceSummary =
        relatedInvoices.length > 0
          ? relatedInvoices
              .map(
                (invoice) =>
                  `${invoice.type}:${invoice.status}:mail-${invoice.emailSentAt ? "yes" : "no"}`,
              )
              .join(",")
          : "no-invoice";
      console.log(
        `${order.id.slice(0, 8)} ${order.status} ${order.totalAmount} seller=${order.seller.sellerType} ${invoiceSummary}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

try {
  if (mode === "connection") await checkConnection();
  if (mode === "pdf") await fetchPdf();
  if (mode === "diagnose") await diagnoseDatabase();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
