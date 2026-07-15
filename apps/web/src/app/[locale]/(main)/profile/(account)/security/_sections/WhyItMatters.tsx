"use client";

import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { WHY_2FA_MATTERS } from "../_lib/types";

export default function WhyItMatters() {
  return (
    <div className="mt-8 rounded-xl bg-surface-alt p-6">
      <h3 className="mb-3 font-medium text-heading">2FA Neden Önemli?</h3>
      <ul className="space-y-2 text-sm text-muted">
        {WHY_2FA_MATTERS.map((item) => (
          <li key={item} className="flex items-start">
            <CheckCircleIcon className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-success-500" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
