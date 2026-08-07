"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Button, Input } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { extractErrorMessage } from "@/lib/error";
import { SectionCard } from "@/components/detail/SectionCard";
import { useConfirm } from "@/provider/ConfirmProvider";

/**
 * Dev tool: fires real Sürat REST endpoints and shows the raw responses. These
 * are diagnostic POSTs. A successful create opens a durable manual-cleanup task
 * because the approved provider contract has no remote-cancel endpoint.
 */
export function SuratTestConsole() {
  const t = useTranslations();
  const confirm = useConfirm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [cref, setCref] = useState("");
  const [opLoading, setOpLoading] = useState(false);
  const [opResult, setOpResult] = useState<any>(null);

  async function runEndpointTest() {
    const approved = await confirm({
      title: t("admin.operations.shipping.surat.testConfirmTitle"),
      description: t("admin.operations.shipping.surat.testConfirmDescription"),
      confirmLabel: t("admin.operations.shipping.surat.createAndTrack"),
    });
    if (!approved) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.suratEndpointTest();
      setTestResult(res.data);
      if (res.data?.ref) setCref(res.data.ref);
    } catch (error) {
      setTestResult({
        error: extractErrorMessage(
          error,
          t("admin.operations.shipping.surat.requestFailed"),
        ),
      });
    } finally {
      setTesting(false);
    }
  }

  async function runTrackingQuery() {
    const r = cref.trim();
    if (!r) {
      toast.error(t("admin.operations.shipping.surat.enterRefFirst"));
      return;
    }
    setOpLoading(true);
    setOpResult(null);
    try {
      const res = await adminApi.suratTestTrack(r);
      setOpResult(res.data);
    } catch (error) {
      setOpResult({
        error: extractErrorMessage(
          error,
          t("admin.operations.shipping.surat.requestFailed"),
        ),
      });
    } finally {
      setOpLoading(false);
    }
  }

  return (
    <SectionCard
      title={t("admin.operations.shipping.surat.testConsoleTitle")}
      bodyClassName="space-y-4"
    >
      <p className="text-xs text-muted">
        {t("admin.operations.shipping.surat.testConsoleIntro")}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted">
          {t("admin.operations.shipping.surat.createHint")}
        </span>
        <Button
          variant="primary"
          size="sm"
          isLoading={testing}
          onClick={runEndpointTest}
        >
          {testing
            ? t("admin.operations.shipping.surat.testing")
            : t("admin.operations.shipping.surat.createAndTrack")}
        </Button>
      </div>

      {testResult && (
        <div className="space-y-2 rounded-lg bg-surface-alt p-3 font-mono text-xs">
          {testResult.error ? (
            <div className="text-danger-600">
              {t("common.error")}: {String(testResult.error)}
            </div>
          ) : (
            <>
              <div>
                {t("admin.operations.shipping.surat.reference")}:{" "}
                <span className="text-body">{testResult.ref}</span>
              </div>
              {testResult.create?.ok && (
                <div
                  className={
                    testResult.cleanupTask?.ok
                      ? "text-success-600"
                      : "text-danger-600"
                  }
                >
                  {testResult.cleanupTask?.ok
                    ? t("admin.operations.shipping.surat.cleanupTaskCreated", {
                        id: testResult.cleanupTask.id,
                      })
                    : t("admin.operations.shipping.surat.cleanupTaskFailed", {
                        error: testResult.cleanupTask?.error ?? "—",
                      })}
                </div>
              )}
              <div>
                {t("admin.operations.shipping.surat.step1")}{" "}
                <span
                  className={
                    testResult.create?.ok
                      ? "text-success-600"
                      : "text-danger-600"
                  }
                >
                  {testResult.create?.ok
                    ? t("admin.operations.shipping.surat.ok")
                    : t("admin.operations.shipping.surat.fail")}
                </span>{" "}
                — {testResult.create?.message}
              </div>
              <div>
                {t("admin.operations.shipping.surat.step2")}{" "}
                {testResult.track?.error ? (
                  <span className="text-danger-600">
                    ✗ {testResult.track.error}
                  </span>
                ) : (
                  <span className="text-body">
                    HTTP {testResult.track?.httpStatus} · IsError=
                    {String(testResult.track?.isError)} ·{" "}
                    {testResult.track?.durum ||
                      testResult.track?.message ||
                      "—"}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted">
          {t("admin.operations.shipping.surat.singleEndpointHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={cref}
            onChange={(e) => setCref(e.target.value)}
            placeholder={t("admin.operations.shipping.surat.refPlaceholder")}
            className="w-full font-mono text-xs sm:w-72"
          />
          <Button
            variant="outline"
            size="sm"
            isLoading={opLoading}
            onClick={runTrackingQuery}
          >
            {t("admin.operations.shipping.surat.trackQuery")}
          </Button>
        </div>
        {opResult && (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 font-mono text-xs text-body">
            {JSON.stringify(opResult, null, 2)}
          </pre>
        )}
      </div>

      <p className="text-xs text-subtle">
        {t("admin.operations.shipping.surat.footerNote")}
      </p>
    </SectionCard>
  );
}
