/** @format */

"use client";

import { Suspense, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Spinner, Alert, Button } from "@tarodan/ui";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * The central loading/error gate. Children fetch with `useSuspenseQuery`, so the
 * whole subtree shows one spinner until data is ready, and any fetch error is
 * caught here with a retry. Subsequent updates (filter/search/page) should run
 * inside a React transition so they DON'T re-trigger this fallback.
 *
 * `errorTitle` names what failed when a page holds several boundaries (e.g.
 * two sections of one detail page); the generic title is the default.
 */
export function SuspenseBoundary({
  children,
  errorTitle,
}: {
  children: ReactNode;
  errorTitle?: ReactNode;
}) {
  const t = useTranslations();
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallback={(clear) => (
            <Alert
              variant="danger"
              title={errorTitle ?? t("admin.shared.suspense.errorTitle")}
            >
              <div className="flex flex-col items-start gap-3">
                <span>{t("admin.shared.suspense.errorDescription")}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    reset();
                    clear();
                  }}
                >
                  {t("admin.shared.suspense.retry")}
                </Button>
              </div>
            </Alert>
          )}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <Spinner size="lg" />
              </div>
            }
          >
            {children}
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
