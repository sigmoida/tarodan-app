import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { type Seller, membershipConfig } from "./types";

export const sellerColumns = [
  col.user<Seller>(
    "Satıcı",
    (s) => ({ name: s.displayName, secondary: s.email }),
    { sortKey: "displayName" },
  ),
  col.badge<Seller>(
    "Üyelik",
    (s) => (
      <Badge
        status={s.membership?.tier?.type ?? "free"}
        config={membershipConfig}
      />
    ),
    { sortKey: "membership.tier.type", sortType: "text" },
  ),
  col.number<Seller>("Ürün", (s) => s._count.products, {
    sortKey: "productsCount",
  }),
  col.number<Seller>("Sipariş", (s) => s._count.sellerOrders, {
    sortKey: "ordersCount",
  }),
  col.badge<Seller>(
    "Durum",
    (s) =>
      s.isBanned ? (
        <Badge variant="danger">Yasaklı</Badge>
      ) : s.isVerified ? (
        <Badge variant="success">Aktif</Badge>
      ) : (
        <Badge variant="warning">Doğrulanmamış</Badge>
      ),
    { sortKey: "isVerified", sortType: "number" },
  ),
];
