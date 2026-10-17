/**
 * Staging "production'dan maskeli yenile" düğmesinin GitHub tetikleyicisi
 * (docs/UAT_REFRESH.md).
 *
 * Düğme API'den `staging-refresh-from-prod.yml` workflow'unu
 * `workflow_dispatch` ile başlatır. Production veritabanı kimliği GitHub
 * secret'larında kalır; staging API yalnız bu tetikleme token'ını taşır.
 *
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT / GitHub App token — yalnız bu
 *                          deponun "Actions: read and write" izni yeter.
 *   GITHUB_DISPATCH_REPO   "owner/repo"
 *   GITHUB_DISPATCH_REF    workflow'un koşacağı dal (varsayılan `development`)
 *
 * Token ya da depo eksikse düğme "yapılandırılmamış" görünür (hata değil).
 * `env.validation.ts` yarım yapılandırmayı ve canlı dağıtımda token'ı reddeder.
 */

export const UAT_REFRESH_WORKFLOW_FILE = "staging-refresh-from-prod.yml";
export const DEFAULT_GITHUB_DISPATCH_REF = "development";
export const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface UatRefreshDispatchConfig {
  token: string;
  repo: string;
  ref: string;
}

/** Tam yapılandırma ya da `null` (düğme "yapılandırılmamış"). */
export function uatRefreshDispatchConfig(
  env: Record<string, string | undefined> = process.env,
): UatRefreshDispatchConfig | null {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo = env.GITHUB_DISPATCH_REPO?.trim();
  if (!token || !repo || !GITHUB_REPO_PATTERN.test(repo)) return null;
  return {
    token,
    repo,
    ref: env.GITHUB_DISPATCH_REF?.trim() || DEFAULT_GITHUB_DISPATCH_REF,
  };
}
