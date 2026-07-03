"use client";

import { type ComponentType } from "react";
import { Tabs, TabsList, TabsTrigger } from "@tarodan/ui";

export interface AdminTab {
  /** Benzersiz anahtar (value ile eşleşir). */
  key: string;
  label: string;
  /** Opsiyonel ikon (heroicon vb.). */
  icon?: ComponentType<{ className?: string }>;
  /** Opsiyonel sayaç/rozet. */
  badge?: number | string;
}

interface AdminTabsProps {
  tabs: AdminTab[];
  /** Aktif sekme anahtarı (controlled). */
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * Admin panelindeki sekme çubuğunun TEK ortak karşılığı — design-system'in Radix
 * tabanlı `Tabs`/`TabsList`/`TabsTrigger`'ı üzerine kurulu (klavye navigasyonu ve
 * erişilebilirlik hazır). İçerik sayfada ayrı render edildiği için `TabsContent`
 * kullanılmaz; bu yalnızca kontrollü sekme çubuğudur.
 */
export function AdminTabs({ tabs, value, onChange, className }: AdminTabsProps) {
  return (
    <Tabs value={value} onValueChange={onChange} className={className}>
      {/* inline-flex (base) → kapsayıcı içeriği kadar gider, tam genişliğe yayılmaz */}
      <TabsList className="w-fit max-w-full flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              // rounded-lg = proje token radius'u (buton/input ile aynı); aktif = primary
              className="group gap-2 rounded-lg data-[state=active]:bg-primary-600 data-[state=active]:text-inverted data-[state=active]:shadow-none"
            >
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
              {tab.badge != null && tab.badge !== "" && (
                <span className="ml-1 rounded-full bg-surface-alt px-1.5 py-0.5 text-xs text-body group-data-[state=active]:bg-primary-800 group-data-[state=active]:text-inverted">
                  {tab.badge}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
