/** @format */

"use client";

import { forwardRef, useRef, useState, type ButtonHTMLAttributes } from "react";
import { LinkIcon, ShareIcon } from "@heroicons/react/24/outline";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@tarodan/ui";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import {
  SHARE_TARGETS,
  buildShareTargets,
  canShareNatively,
  copyText,
  openShareWindow,
  resolveShareUrl,
  shouldFallbackToMenu,
  type ShareTarget,
} from "@/lib/share";
import { FacebookIcon, TelegramIcon, WhatsAppIcon, XIcon } from "./BrandIcons";

// Marka adları çevrilmez.
const TARGET_META: Record<ShareTarget, { label: string; Icon: typeof XIcon }> =
  {
    whatsapp: { label: "WhatsApp", Icon: WhatsAppIcon },
    x: { label: "X", Icon: XIcon },
    facebook: { label: "Facebook", Icon: FacebookIcon },
    telegram: { label: "Telegram", Icon: TelegramIcon },
  };

interface ShareMenuProps {
  /** Paylaşılacak kanonik YOL (bkz. `lib/share`); origin paylaşım anında eklenir. */
  path: string;
  title: string;
  /** Mesaj gövdesi (ör. "Başlık - fiyat"); yoksa yalnız URL gider. */
  text?: string;
  /** Gösterilecek ağlar; verilmezse hepsi. */
  targets?: readonly ShareTarget[];
  /** Verilirse ikon yerine metinli buton çizer (ör. "Listeyi paylaş"). */
  label?: string;
  /** Yalnız ikon tetikleyicinin ikon boyutu. */
  iconClassName?: string;
}

interface TriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  /** Metinli varyant: görünen metin erişilebilir ad olur. */
  label?: string;
  /** İkon varyantının aria-label/title'ı. */
  iconLabel: string;
  iconClassName?: string;
}

/** Radix `asChild` için ref + prop alan tetikleyici. */
const ShareTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  ({ label, iconLabel, iconClassName = "h-6 w-6", ...props }, ref) =>
    label ? (
      <Button
        ref={ref}
        type="button"
        variant="secondary"
        leftIcon={<ShareIcon className="h-5 w-5" />}
        {...props}
      >
        {label}
      </Button>
    ) : (
      <IconButton
        ref={ref}
        variant="ghost"
        aria-label={iconLabel}
        title={iconLabel}
        {...props}
      >
        <ShareIcon className={iconClassName} />
      </IconButton>
    ),
);
ShareTrigger.displayName = "ShareTrigger";

/**
 * Tek paylaşım yüzeyi (ilan, koleksiyon, favoriler). Her zaman aynı menü
 * ağacı çizilir; dokunmatik cihazda ve Web Share API varsa TIKLAMA ANINDA
 * sistem paylaşım sayfası açılır (menü açılışı engellenir). Sistem sayfası
 * izin/veri hatası verirse menü açılır; iptal ya da zaten açık paylaşım
 * sessizce yok sayılır.
 */
export default function ShareMenu({
  path,
  title,
  text,
  targets = SHARE_TARGETS,
  label,
  iconClassName,
}: ShareMenuProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const sharing = useRef(false);
  // Menü kapandıktan sonra çalışacak iş (kopyalama): açıkken Radix FocusScope
  // odağı tuttuğu için `execCommand` yedeği boş kopyalayabiliyor.
  const afterClose = useRef<(() => void) | null>(null);

  const shareNatively = async () => {
    if (sharing.current) return;
    sharing.current = true;
    try {
      await navigator.share({ title, text, url: resolveShareUrl(path) });
    } catch (error) {
      if (shouldFallbackToMenu(error)) setOpen(true);
    } finally {
      sharing.current = false;
    }
  };

  const copyLink = async () => {
    if (await copyText(resolveShareUrl(path))) {
      toast.success(t("common.copied"));
    } else {
      toast.error(t("common.copyFailed"));
    }
  };

  const openNetwork = (target: ShareTarget) =>
    openShareWindow(
      buildShareTargets({ url: resolveShareUrl(path), text })[target],
    );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        // Dokunmatik + Web Share: menüyü açma, tıklama sistem sayfasını açar.
        if (next && canShareNatively()) return;
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <ShareTrigger
          label={label}
          iconLabel={t("common.share")}
          iconClassName={iconClassName}
          onClick={() => {
            if (canShareNatively()) void shareNatively();
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        aria-label={t("common.shareOptions")}
        onCloseAutoFocus={() => {
          const run = afterClose.current;
          afterClose.current = null;
          run?.();
        }}
      >
        {SHARE_TARGETS.filter((target) => targets.includes(target)).map(
          (target) => {
            const { label: name, Icon } = TARGET_META[target];
            return (
              <DropdownMenuItem
                key={target}
                onSelect={() => openNetwork(target)}
              >
                <Icon />
                {name}
              </DropdownMenuItem>
            );
          },
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            afterClose.current = () => void copyLink();
          }}
        >
          <LinkIcon className="h-5 w-5" />
          {t("common.copyLink")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
