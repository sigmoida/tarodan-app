/** @format */

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "@tarodan/ui";
import { FolderIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { toast } from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { fmtDateTime } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";

interface MediaFileRow {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  publicUrl: string | null;
  usage: { type: string; label: string } | null;
}

interface BrowseResult {
  prefix: string;
  folders: Array<{ name: string; prefix: string }>;
  files: MediaFileRow[];
}

const USAGE_BADGE: Record<string, "success" | "info" | "warning" | "primary"> =
  {
    product: "success",
    collection: "info",
    brand: "primary",
    avatar: "info",
    upload: "warning",
  };

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MediaBrowser() {
  const t = useTranslations();
  // API env prefix'ini kendisi ekler — burada env'siz göreli yol tutulur.
  const [prefix, setPrefix] = useState("");

  const query = useQuery({
    queryKey: adminKeys.list("media-browse", prefix || "root"),
    queryFn: async () =>
      (await adminApi.getMediaBrowse(prefix)).data as BrowseResult,
  });

  const goUp = () => {
    const parts = prefix.replace(/\/$/, "").split("/");
    parts.pop();
    setPrefix(parts.length > 0 ? `${parts.join("/")}/` : "");
  };

  // API tam (env'li) prefix döner; alt klasöre inerken env kökü soyulur —
  // state hep env'siz kalır, API tekrar ekler.
  const enterFolder = (fullPrefix: string) => {
    const parts = fullPrefix.split("/");
    setPrefix(parts.slice(1).join("/"));
  };

  const crumbs = prefix.replace(/\/$/, "").split("/").filter(Boolean);
  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
          disabled={!prefix}
          onClick={goUp}
        >
          {t("admin.system.media.up")}
        </Button>
        <button
          type="button"
          className="text-primary-600 hover:underline"
          onClick={() => setPrefix("")}
        >
          {t("admin.system.media.root")}
        </button>
        {crumbs.map((part, i) => (
          <span key={`${part}-${i}`} className="flex items-center gap-2">
            <span className="text-subtle">/</span>
            <button
              type="button"
              className="text-primary-600 hover:underline"
              onClick={() => setPrefix(`${crumbs.slice(0, i + 1).join("/")}/`)}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {query.isLoading ? (
        <SectionCard>
          <p className="py-8 text-center text-muted">{t("common.loading")}</p>
        </SectionCard>
      ) : (
        <>
          {(data?.folders.length ?? 0) > 0 && (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {data?.folders.map((folder) => (
                <button
                  key={folder.prefix}
                  type="button"
                  onClick={() => enterFolder(folder.prefix)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-primary-300"
                >
                  <FolderIcon className="h-5 w-5 shrink-0 text-warning-500" />
                  <span className="truncate font-medium">{folder.name}</span>
                </button>
              ))}
            </div>
          )}

          <SectionCard bodyClassName="overflow-x-auto">
            {(data?.files.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-muted">
                {t("admin.system.media.empty")}
              </p>
            ) : (
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-3 py-3 font-medium">
                      {t("admin.system.media.preview")}
                    </th>
                    <th className="px-3 py-3 font-medium">
                      {t("admin.system.media.file")}
                    </th>
                    <th className="px-3 py-3 font-medium">
                      {t("admin.system.media.sizeCol")}
                    </th>
                    <th className="px-3 py-3 font-medium">
                      {t("admin.system.media.date")}
                    </th>
                    <th className="px-3 py-3 font-medium">
                      {t("admin.system.media.usage")}
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.files.map((file) => (
                    <tr
                      key={file.key}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2">
                        {file.publicUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={file.publicUrl}
                            alt={file.name}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <Badge variant="default">
                            {t("admin.system.media.private")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {file.name}
                      </td>
                      <td className="px-3 py-2">{fmtSize(file.size)}</td>
                      <td className="px-3 py-2">
                        {fmtDateTime(file.lastModified)}
                      </td>
                      <td className="px-3 py-2">
                        {file.usage ? (
                          <Badge
                            variant={USAGE_BADGE[file.usage.type] ?? "default"}
                          >
                            {t(
                              `admin.system.media.usageType.${file.usage.type}` as never,
                            )}
                            {": "}
                            {file.usage.label}
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            {t("admin.system.media.orphan")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {file.publicUrl && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(file.publicUrl!);
                              toast.success(t("admin.system.media.urlCopied"));
                            }}
                          >
                            {t("admin.system.media.copyUrl")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
