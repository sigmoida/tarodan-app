import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import type { BulkUserResult } from "@/lib/api/users";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { usePrompt } from "@/provider/PromptProvider";
import {
  eligibleIds,
  type UserAccountAction,
  type UserAccountTarget,
} from "./bulkEligibility";
import {
  bulkConfirmDescriptionKey,
  bulkResultMessage,
} from "./bulkResultMessage";

type T = ReturnType<typeof useTranslations<never>>;

/** Hangi satırda hangi tekil aksiyonun sürdüğü — buton/menü spinner'ı için. */
export interface UserActionBusy {
  id: string;
  action: UserAccountAction;
}

/** Bu satırda bu aksiyon mu çalışıyor? */
export function isActionBusy(
  busy: UserActionBusy | undefined,
  id: string,
  action: UserAccountAction,
): boolean {
  return busy?.id === id && busy.action === action;
}

/** Toplu aksiyon → onay başlığı anahtarı. */
const BULK_TITLE_KEY = {
  resend: "admin.users.bulkResendTitle",
  verify: "admin.users.bulkVerifyTitle",
  ban: "admin.users.bulkBanTitle",
  unban: "admin.users.bulkUnbanTitle",
} as const satisfies Record<UserAccountAction, MessageKey>;

/** Aksiyon → buton/menü etiketi anahtarı (tekil ve toplu aynı kelime). */
export const ACTION_LABEL_KEY = {
  resend: "admin.users.resendVerification",
  verify: "admin.users.verifyEmail",
  ban: "admin.users.banAction",
  unban: "admin.users.unbanAction",
} as const satisfies Record<UserAccountAction, MessageKey>;

/**
 * İstek başına id üst sınırı — API DTO'larıyla (admin-action.dto.ts) BİREBİR:
 * kuyruğa yazan yol 500, SMTP/transaction bekleyen senkron yollar 50.
 *
 * Tablo sayfa boyutu 500'e kadar çıkabildiği için seçim bu sınırı aşabilir;
 * aşarsa istek parçalara bölünür. Bölünmeseydi sunucu isteği `ArrayMaxSize` ile
 * reddeder ve admin yerelleştirilmemiş bir class-validator metni görürdü.
 */
const BULK_REQUEST_MAX: Record<UserAccountAction, number> = {
  resend: 500,
  verify: 50,
  ban: 50,
  unban: 50,
};

function callBulkChunk(
  action: UserAccountAction,
  ids: string[],
  reason: string | undefined,
) {
  switch (action) {
    case "ban":
      return adminApi.bulkBanUsers(ids, reason ?? "");
    case "unban":
      return adminApi.bulkUnbanUsers(ids);
    case "resend":
      return adminApi.bulkResendUserVerification(ids);
    case "verify":
      return adminApi.bulkVerifyUserEmail(ids);
  }
}

/** Parçaları SIRAYLA gönderir (sunucu da sıralı işliyor) ve sonuçları birleştirir. */
async function callBulk(
  action: UserAccountAction,
  ids: string[],
  reason: string | undefined,
): Promise<BulkUserResult> {
  const size = BULK_REQUEST_MAX[action];
  const merged: BulkUserResult = { succeeded: [], failed: [] };
  for (let i = 0; i < ids.length; i += size) {
    const { data } = await callBulkChunk(
      action,
      ids.slice(i, i + size),
      reason,
    );
    merged.succeeded.push(...data.succeeded);
    merged.failed.push(...data.failed);
  }
  return merged;
}

/**
 * Kullanıcı hesabı aksiyonlarının TEK sahibi: engelle / engeli kaldır /
 * aktivasyon maili gönder / manuel aktive et — tekil (satır menüsü, detay
 * sayfası) ve toplu (seçim barı) aynı mutasyon ve aynı onay metinlerinden geçer.
 */
export function useUserActions() {
  const t = useTranslations();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const invalidates = ["users"];

  const ban = useAdminMutation(
    (v: { id: string; reason: string }) => adminApi.banUser(v.id, v.reason),
    { invalidates, successMessage: t("admin.users.banned") },
  );
  const unban = useAdminMutation((id: string) => adminApi.unbanUser(id), {
    invalidates,
    successMessage: t("admin.users.unbanned"),
  });
  const resend = useAdminMutation(
    (id: string) => adminApi.resendUserVerification(id),
    { invalidates, successMessage: t("admin.users.verificationSent") },
  );
  const verify = useAdminMutation(
    (id: string) => adminApi.verifyUserEmail(id),
    { invalidates, successMessage: t("admin.users.emailVerifiedByAdmin") },
  );
  const bulk = useAdminMutation(
    (v: { action: UserAccountAction; ids: string[]; reason?: string }) =>
      callBulk(v.action, v.ids, v.reason),
    {
      invalidates,
      onSuccess: (res, vars) => reportBulkResult(t, vars.action, res),
    },
  );

  /** Engelleme sebebi; iptalde null, boş bırakılırsa varsayılan metin. */
  const askBanReason = async (): Promise<string | null> => {
    const defaultReason = t("admin.users.banDefaultReason");
    const reason = await prompt({
      title: t("admin.users.banTitle"),
      label: t("admin.users.banReasonLabel"),
      defaultValue: defaultReason,
      confirmLabel: t("admin.users.banAction"),
      destructive: true,
      required: false,
    });
    if (reason === null) return null;
    return reason || defaultReason;
  };

  const runOne = async (action: UserAccountAction, id: string) => {
    switch (action) {
      case "ban": {
        const reason = await askBanReason();
        if (reason !== null) ban.mutate({ id, reason });
        return;
      }
      case "unban":
        await confirm({
          title: t("admin.users.unbanAction"),
          description: t("admin.users.unbanConfirmDesc"),
          confirmLabel: t("admin.users.unbanAction"),
          onConfirm: () => unban.mutateAsync(id),
        });
        return;
      case "resend":
        resend.mutate(id);
        return;
      case "verify":
        await confirm({
          title: t("admin.users.verifyEmailConfirmTitle"),
          description: t("admin.users.verifyEmailConfirmDesc"),
          confirmLabel: t("admin.users.verifyEmail"),
          onConfirm: () => verify.mutateAsync(id),
        });
        return;
    }
  };

  /**
   * Toplu aksiyon: uygun olmayan satırlar atlanır, engellemede tek sebep
   * hepsine uygulanır. Onaylanıp gönderildiyse true döner (seçimi temizlemek
   * için).
   */
  const runBulk = async (
    action: UserAccountAction,
    rows: readonly UserAccountTarget[],
  ): Promise<boolean> => {
    const ids = eligibleIds(action, rows);
    if (ids.length === 0) {
      toast.error(t("admin.users.bulkNoneEligible"));
      return false;
    }
    let reason: string | undefined;
    if (action === "ban") {
      const answer = await askBanReason();
      if (answer === null) return false;
      reason = answer;
    }
    return confirm({
      title: t(BULK_TITLE_KEY[action], { count: ids.length }),
      description: t(bulkConfirmDescriptionKey(action)),
      confirmLabel: t(ACTION_LABEL_KEY[action]),
      destructive: action === "ban",
      onConfirm: () => bulk.mutateAsync({ action, ids, reason }),
    });
  };

  // Hangi kullanıcıda HANGİ aksiyon çalışıyor. Yalnız id tutulsaydı bekleyen
  // bir hesapta tek tıklama üç butonu birden döndürürdü.
  const busy: UserActionBusy | undefined =
    ban.isPending && ban.variables
      ? { id: ban.variables.id, action: "ban" }
      : unban.isPending && unban.variables
        ? { id: unban.variables, action: "unban" }
        : resend.isPending && resend.variables
          ? { id: resend.variables, action: "resend" }
          : verify.isPending && verify.variables
            ? { id: verify.variables, action: "verify" }
            : undefined;

  return { runOne, runBulk, busy, isBulkPending: bulk.isPending };
}

function reportBulkResult(
  t: T,
  action: UserAccountAction,
  result: BulkUserResult,
) {
  const { key, values, tone } = bulkResultMessage(
    action,
    result.succeeded.length,
    result.failed.length,
  );
  const text = t(key, values);
  if (tone === "success") toast.success(text);
  else if (tone === "error") toast.error(text);
  else toast(text, { icon: "⚠️" });
}
