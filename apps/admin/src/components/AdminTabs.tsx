"use client";

import { type ComponentType } from "react";

export interface AdminTab {
  /** Benzersiz anahtar (activeTab değeri ile eşleşir). */
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
 * Admin panelindeki buton-tab görünümünün TEK ortak karşılığı.
 * Önceden her sayfa kendi activeTab + buton dizisini elle yazıyordu; bu component
 * o görünümü (pill butonlar + alt çizgi) tekilleştirir.
 */
export function AdminTabs({ tabs, value, onChange, className }: AdminTabsProps) {
  return (
    <div
      role="tablist"
      className={`flex flex-wrap gap-2 border-b border-border pb-4 ${className ?? ""}`}
    >
      {tabs.map((tab) => {
        const active = value === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary-600 text-inverted"
                : "bg-surface-alt text-muted hover:text-heading hover:bg-border-subtle"
            }`}
          >
            {Icon && <Icon className="h-5 w-5" />}
            {tab.label}
            {tab.badge != null && tab.badge !== "" && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${
                  active ? "bg-inverted/20" : "bg-surface"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
