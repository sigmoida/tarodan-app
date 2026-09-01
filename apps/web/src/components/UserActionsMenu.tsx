"use client";

import type { ReactNode } from "react";
import {
  EllipsisHorizontalIcon,
  FlagIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useBlockStatus, useBlockUser } from "@/hooks/useBlockUser";

interface UserActionsMenuProps {
  /** Hedef kullanıcı (satıcı / karşı taraf). */
  userId: string;
  userName: string;
  /** Şikayet Et — giriş kapısı ve modal çağıranda. */
  onReport: () => void;
  /** Şikayet satırı etiketi (ör. ilan detayında "İlanı Şikayet Et"). */
  reportLabel?: string;
  /** Engelle etiketi (ör. ilan detayında "Satıcıyı Engelle"). */
  blockLabel?: string;
  /** Giriş kapısı: false dönerse engelleme başlamaz (modalı çağıran gösterir). */
  requireAuth?: () => boolean;
  /** Engel başarıyla konunca (ör. DM ekranından çıkmak için). */
  onBlocked?: () => void;
  /** Menüye eklenecek ek satırlar (şikayetin üstüne gelir). */
  children?: ReactNode;
  size?: "sm" | "md";
}

/**
 * Kullanıcıya dönük ortak eylem menüsü: Şikayet Et / Engelle / Engeli Kaldır.
 * Satıcı profili, ilan detayı ve DM başlığı aynı bileşeni kullanır — mobil
 * `UserActionsSheet` ile birebir aynı yüzeyler (Apple App Review şartı).
 */
export default function UserActionsMenu({
  userId,
  userName,
  onReport,
  reportLabel,
  blockLabel,
  requireAuth,
  onBlocked,
  children,
  size = "sm",
}: UserActionsMenuProps) {
  const t = useTranslations();
  const { isBlocked } = useBlockStatus(userId);
  const { requestBlock, requestUnblock, pending } = useBlockUser({
    requireAuth,
    onBlocked,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          size={size}
          aria-label={t("common.actions")}
          title={t("common.actions")}
          isLoading={pending}
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {children}
        <DropdownMenuItem onSelect={onReport}>
          <FlagIcon className="mr-2 h-4 w-4" />
          {reportLabel ?? t("profile.report")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isBlocked ? (
          <DropdownMenuItem
            onSelect={() => void requestUnblock(userId, userName)}
          >
            <NoSymbolIcon className="mr-2 h-4 w-4" />
            {t("profile.unblock")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            danger
            onSelect={() => void requestBlock(userId, userName)}
          >
            <NoSymbolIcon className="mr-2 h-4 w-4" />
            {blockLabel ?? t("profile.block")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
