"use client";

import { Tabs, TabsList, TabsTrigger } from "@tarodan/ui";

export interface AdminTab {
  /** Unique key (matches value). */
  key: string;
  label: string;
  /** Optional count, shown after the label in parentheses: "Aktif (8)". */
  badge?: number | string;
}

interface AdminTabsProps {
  tabs: AdminTab[];
  /** Active tab key (controlled). */
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * The SINGLE shared tab bar for the admin panel — built on the design-system's
 * Radix-based `Tabs`/`TabsList`/`TabsTrigger` (keyboard navigation and
 * accessibility built in). `TabsContent` is not used since content is rendered
 * separately on the page; this is only the controlled tab bar.
 */
export function AdminTabs({
  tabs,
  value,
  onChange,
  className,
}: AdminTabsProps) {
  return (
    <Tabs value={value} onValueChange={onChange} className={className}>
      {/* inline-flex (base) → sizes to its content, doesn't stretch to full width */}
      <TabsList className="w-fit max-w-full flex-wrap">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            // rounded-lg = project token radius (same as button/input); active = primary
            className="rounded-lg data-[state=active]:bg-primary-600 data-[state=active]:text-inverted data-[state=active]:shadow-none"
          >
            {/* Sekmede ikon ve ayrı sayaç hapı yok: sayı etiketin parçasıdır. */}
            {tab.badge != null && tab.badge !== ""
              ? `${tab.label} (${tab.badge})`
              : tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
