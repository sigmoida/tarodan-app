"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The expandable-row animation, split out of `DataTable` so `framer-motion`
 * (~40KB) is code-split into its own chunk (#102). `DataTable` is on every list
 * page, but only a couple pass `renderExpanded`; loading this component
 * dynamically keeps framer-motion out of every other list bundle and off the
 * initial paint. Behaviour is identical to the previous inline block — the
 * AnimatePresence stays mounted so both enter and exit animate.
 */
export default function DataTableExpandRow({
  isExpanded,
  children,
}: {
  isExpanded: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {isExpanded && (
        <motion.div
          key="expanded"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
