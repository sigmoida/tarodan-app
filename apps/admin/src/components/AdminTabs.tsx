"use client";

import { type ComponentType } from "react";
import { Tabs, TabsList, TabsTrigger } from "@tarodan/ui";

export interface AdminTab {
  /** Unique key (matches value). */
  key: string;
  label: string;
  /** Optional icon (heroicon, etc.). */
  icon?: ComponentType<{ className?: string }>;
  /** Optional counter/badge. */
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
export function AdminTabs({ tabs, value, onChange, className }: AdminTabsProps) {
  return (
    <Tabs value={value} onValueChange={onChange} className={className}>
      {/* inline-flex (base) → sizes to its content, doesn't stretch to full width */}
      <TabsList className="w-fit max-w-full flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              // rounded-lg = project token radius (same as button/input); active = primary
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
