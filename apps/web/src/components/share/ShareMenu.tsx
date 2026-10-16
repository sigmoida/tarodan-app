/** @format */

"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
} from "react";
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
  isShareAbort,
  openShareWindow,
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
  /** Paylaşılacak kanonik URL (bkz. `lib/share`). */
  url: string;
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

interface TriggerProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    Pick<ShareMenuProps, "label" | "iconClassName"> {
  "aria-label": string;
}

/** Radix `asChild` için ref + prop alan tetikleyici; menüde de doğrudan da aynı. */
const ShareTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  ({ label, iconClassName = "h-6 w-6", ...props }, ref) =>
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
      <IconButton ref={ref} variant="ghost" {...props}>
        <ShareIcon className={iconClassName} />
      </IconButton>
    ),
);
ShareTrigger.displayName = "ShareTrigger";

/**
 * Tek paylaşım yüzeyi (ilan, koleksiyon, favoriler). Dokunmatik cihazda ve
 * Web Share API varsa sistem paylaşım sayfası açılır; aksi halde (ya da sistem
 * sayfası hata verirse) ağ seçenekleri + "Linki kopyala" menüsü gösterilir.
 */
export default function ShareMenu({
  url,
  title,
  text,
  targets = SHARE_TARGETS,
  label,
  iconClassName,
}: ShareMenuProps) {
  const t = useTranslations();
  const [native, setNative] = useState(false);
  const [open, setOpen] = useState(false);

  // SSR/hidrasyonda menü; cihaz yeteneği mount sonrası okunur.
  useEffect(() => setNative(canShareNatively()), []);

  const triggerProps = {
    label,
    iconClassName,
    "aria-label": t("common.share"),
    title: label ? undefined : t("common.share"),
  };

  const shareNatively = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch (error) {
      if (isShareAbort(error)) return;
      // Sistem sayfası açılamadı → aynı tetikleyicide menüye düş.
      setNative(false);
      setOpen(true);
    }
  };

  const copyLink = async () => {
    if (await copyText(url)) toast.success(t("common.copied"));
    else toast.error(t("common.copyFailed"));
  };

  if (native) {
    return <ShareTrigger {...triggerProps} onClick={shareNatively} />;
  }

  const hrefs = buildShareTargets({ url, text });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <ShareTrigger {...triggerProps} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={t("common.shareOptions")}>
        {SHARE_TARGETS.filter((target) => targets.includes(target)).map(
          (target) => {
            const { label: name, Icon } = TARGET_META[target];
            return (
              <DropdownMenuItem
                key={target}
                onSelect={() => openShareWindow(hrefs[target])}
              >
                <Icon />
                {name}
              </DropdownMenuItem>
            );
          },
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyLink()}>
          <LinkIcon className="h-5 w-5" />
          {t("common.copyLink")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
