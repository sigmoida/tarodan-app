import { Injectable, Logger } from "@nestjs/common";
import { UAT_REFRESH_CONFIRM_PHRASE } from "@tarodan/types";
import {
  UAT_REFRESH_WORKFLOW_FILE,
  UatRefreshDispatchConfig,
  uatRefreshDispatchConfig,
} from "../../../config/uat-refresh";

/** Workflow'a giden girdiler (staging-refresh-from-prod.yml `inputs`). */
export interface UatRefreshDispatchInputs {
  runId: string;
  reportToken: string;
  dryRun: boolean;
}

/**
 * `definite`: GitHub isteği KESİN reddetti (4xx — kimlik, izin, ref, girdi);
 * workflow başlamadı. `definite=false`: zaman aşımı, ağ hatası ya da 5xx —
 * GitHub isteği almış olabilir, workflow koşabilir.
 */
export type UatRefreshDispatchResult =
  { ok: true } | { ok: false; definite: boolean; error: string };

const GITHUB_API = "https://api.github.com";
const DISPATCH_TIMEOUT_MS = 10_000;

/**
 * GitHub `workflow_dispatch` istemcisi — staging yenileme workflow'unu başlatır.
 *
 * Koşunun GitHub bağlantısını burada aramıyoruz: dispatch yanıtı koşu kimliği
 * döndürmez ve `runs?event=workflow_dispatch` taraması eşzamanlı koşularda yanlış
 * koşuyu yakalayabilir. Workflow kendi `html_url`'ini ilk raporunda gönderir.
 *
 * Token hiçbir log satırına, hata mesajına ya da yanıta girmez.
 */
@Injectable()
export class UatRefreshDispatchService {
  private readonly logger = new Logger(UatRefreshDispatchService.name);

  /** Tetikleyici yapılandırması; yoksa `null` (düğme "yapılandırılmamış"). */
  config(): UatRefreshDispatchConfig | null {
    return uatRefreshDispatchConfig();
  }

  async dispatch(
    config: UatRefreshDispatchConfig,
    inputs: UatRefreshDispatchInputs,
  ): Promise<UatRefreshDispatchResult> {
    const url = `${GITHUB_API}/repos/${config.repo}/actions/workflows/${UAT_REFRESH_WORKFLOW_FILE}/dispatches`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          "User-Agent": "tarodan-api",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: config.ref,
          inputs: {
            run_id: inputs.runId,
            report_token: inputs.reportToken,
            // Workflow `format('{0}', inputs.dry_run) == 'true'` ile okur:
            // metin olarak gönderilir ki boolean/metin farkı kaymasın.
            dry_run: inputs.dryRun ? "true" : "false",
            confirm: UAT_REFRESH_CONFIRM_PHRASE,
          },
        }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
      if (response.ok) return { ok: true };
      const error = `GitHub workflow dispatch failed: HTTP ${response.status}`;
      this.logger.warn(`${error} (${config.repo}@${config.ref})`);
      return {
        ok: false,
        definite: response.status >= 400 && response.status < 500,
        error,
      };
    } catch (cause) {
      const error = `GitHub workflow dispatch failed: ${
        cause instanceof Error ? cause.name : "unknown error"
      }`;
      this.logger.warn(error);
      return { ok: false, definite: false, error };
    }
  }
}
