import { useTranslations } from "next-intl";
import type { AdminRefundRow, AdminRefundTab } from "@tarodan/types";
import {
  MONEY_LINE_I18N_KEYS,
  moneyTooltip,
  refundMoneyView,
} from "../_lib/moneyView";

/**
 * İadenin para dökümü tek hücrede: etiketli küçük satırlar (birim fiyat,
 * komisyon, iade edilebilir komisyon, kesintiler + sekmeye özgü satır). Tam
 * döküm (alıcı / satıcı kesintisi ayrı ayrı) yerel `title` ipucundadır.
 */
export function RefundMoneyCell({
  money,
  tab,
}: {
  money: AdminRefundRow["money"];
  tab: AdminRefundTab;
}) {
  const t = useTranslations();
  const { lines, detail } = refundMoneyView(money, tab);

  return (
    <div
      className="flex flex-col items-start gap-0.5 leading-tight"
      title={moneyTooltip(detail, (key) => t(MONEY_LINE_I18N_KEYS[key]))}
    >
      {lines.map((line) => (
        <span
          key={line.key}
          className="whitespace-nowrap text-xs tabular-nums text-muted"
        >
          {t(MONEY_LINE_I18N_KEYS[line.key])}{" "}
          <span className="font-medium text-body">{line.value}</span>
        </span>
      ))}
    </div>
  );
}
