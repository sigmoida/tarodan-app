import toast from "react-hot-toast";
import type { useTranslations } from "next-intl";
import { colors as dsColors } from "@tarodan/ui";
import { adminApi } from "@/lib/api";

type T = ReturnType<typeof useTranslations<never>>;

/** Fetch the order invoice and open a print-ready window. */
export async function printOrderInvoice(orderId: string, t: T): Promise<void> {
  try {
    const response = await adminApi.getOrderInvoice(orderId);
    const invoiceData = response.data;
    const theme = {
      heading: dsColors.text.heading,
      body: dsColors.text.body,
      muted: dsColors.text.muted,
      surface: dsColors.surface.alt,
      border: dsColors.border.DEFAULT,
    };

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${t("admin.operations.orders.invoice.windowTitle", { number: invoiceData.invoiceNumber })}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${theme.heading}; padding-bottom: 20px; }
          .header h1 { margin: 0; font-size: 24px; }
          .header p { margin: 5px 0; color: ${theme.muted}; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-box { background: ${theme.surface}; padding: 15px; border-radius: 8px; }
          .info-box h3 { margin: 0 0 10px 0; font-size: 14px; color: ${theme.muted}; }
          .info-box p { margin: 3px 0; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid ${theme.border}; padding: 10px; text-align: left; }
          th { background: ${theme.surface}; }
          .totals { text-align: right; }
          .totals p { margin: 5px 0; }
          .total-row { font-weight: bold; font-size: 18px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${t("admin.operations.orders.invoice.heading")}</h1>
          <p>${t("admin.operations.orders.invoice.number", { number: invoiceData.invoiceNumber })}</p>
          <p>${t("admin.operations.orders.invoice.date", { date: new Date(invoiceData.orderDate).toLocaleDateString("tr-TR") })}</p>
        </div>
        <div class="info-grid">
          <div class="info-box">
            <h3>${t("admin.operations.orders.invoice.buyer")}</h3>
            <p><strong>${invoiceData.buyer.name}</strong></p>
            <p>${invoiceData.buyer.email}</p>
            ${invoiceData.buyer.phone ? `<p>${invoiceData.buyer.phone}</p>` : ""}
            ${invoiceData.buyer.address ? `<p>${invoiceData.buyer.address}</p>` : ""}
          </div>
          <div class="info-box">
            <h3>${t("admin.operations.orders.invoice.seller")}</h3>
            <p><strong>${invoiceData.seller.name}</strong></p>
            <p>${invoiceData.seller.email}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>${t("admin.operations.orders.invoice.colProduct")}</th><th>${t("admin.operations.orders.invoice.colQuantity")}</th><th>${t("admin.operations.orders.invoice.colUnitPrice")}</th><th>${t("admin.operations.orders.invoice.colTotal")}</th></tr>
          </thead>
          <tbody>
            ${invoiceData.items
              .map(
                (item: any) => `
              <tr>
                <td>${item.title}</td>
                <td>${item.quantity}</td>
                <td>₺${item.unitPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                <td>₺${item.total.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
        <div class="totals">
          <p>${t("admin.operations.orders.invoice.subtotal", { amount: invoiceData.subtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) })}</p>
          ${
            invoiceData.discountAmount > 0
              ? `<p style="color: #16a34a;">${t("admin.operations.orders.invoice.discount", { code: invoiceData.discountCode ? ` (${invoiceData.discountCode})` : "", amount: Number(invoiceData.discountAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) })}</p>`
              : ""
          }
          <p>${t("admin.operations.orders.invoice.shipping", { amount: invoiceData.shippingCost.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) })}</p>
          <p class="total-row">${t("admin.operations.orders.invoice.total", { amount: invoiceData.total.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) })}</p>
        </div>
        ${
          invoiceData.shipment?.trackingNumber
            ? `
          <div style="margin-top: 20px; padding: 10px; background: ${theme.surface}; border-radius: 4px;">
            <strong>${t("admin.operations.orders.invoice.tracking")}:</strong> ${invoiceData.shipment.carrier || ""} - ${invoiceData.shipment.trackingNumber}
          </div>
        `
            : ""
        }
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch {
    toast.error(t("admin.operations.orders.invoice.error"));
  }
}
