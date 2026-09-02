import { useState } from "react";
import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function Section({ title, badge, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <div className="accordion-section">
      <button
        type="button"
        className="accordion-header"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="accordion-chevron">{open ? "▾" : "▸"}</span>
        <span className="accordion-title">{title}</span>
        {badge !== undefined && <span className="accordion-badge">{badge}</span>}
      </button>
      <div className="accordion-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
