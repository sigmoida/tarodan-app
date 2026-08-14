"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@tarodan/ui";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useSession } from "@/context/SessionContext";

/** Single source: account menu links are defined here. */
const PROFILE_MENU_ITEMS: Array<{ label: string; href: string }> = [];

/**
 * Account menu in the top bar — mağaza tarafındaki hesap menüsüyle aynı biçim:
 * tetikleyicide ikon + ad + chevron (ad `sm` altında gizli), panelde önce
 * avatar / ad / e-posta künyesi, ayraç, sonra kırmızı çıkış satırı.
 *
 * Eskiden yalnız bir ikon düğmesiydi ve panel ad/e-postayı düz metin olarak
 * veriyordu; aynı ürünün iki farklı hesap menüsü vardı.
 *
 * Radix `DropdownMenu` korunuyor: klavye gezinmesi ve odak yönetimi mağaza
 * tarafındaki elle yazılmış açılır menüden daha sağlam.
 */
export function AdminProfileMenu() {
  const t = useTranslations();
  const { user, logout } = useSession();
  const displayName =
    user.displayName || t("admin.shared.profileMenu.defaultName");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="nav"
          size="sm"
          aria-label={t("admin.shared.profileMenu.ariaLabel")}
          className="min-w-0 gap-1"
        >
          <UserCircleIcon className="h-5 w-5" />
          <span className="hidden max-w-[10rem] truncate sm:inline">
            {displayName}
          </span>
          <ChevronDownIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <Avatar size="sm" alt={displayName} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-heading">
              {displayName}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>

        <DropdownMenuSeparator />

        {PROFILE_MENU_ITEMS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} scroll={false}>
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        {PROFILE_MENU_ITEMS.length > 0 && <DropdownMenuSeparator />}

        <DropdownMenuItem danger onSelect={() => logout()}>
          <ArrowRightStartOnRectangleIcon className="h-4 w-4 shrink-0" />
          {t("common.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
