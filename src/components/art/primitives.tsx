import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Condition-report style tag used for flag priorities. */
export function PriorityTag({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const tone =
    priority === "P1"
      ? "border-p1 text-p1"
      : priority === "P2"
        ? "border-p2 text-p2"
        : "border-p3 text-p3";
  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center border-l-2 bg-secondary/60 px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tone,
      )}
    >
      {priority}
    </span>
  );
}

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "ochre" | "harbour" | "muted";
  className?: string;
}) {
  const tones = {
    default: "border-border text-foreground",
    ochre: "border-primary text-primary",
    harbour: "border-harbour text-harbour",
    muted: "border-border text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center rounded-sm border px-2 py-0.5 leading-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "ochre" | "harbour";
}) {
  const tones = {
    default: "text-foreground",
    ochre: "text-primary",
    harbour: "text-harbour",
  } as const;
  return (
    <div className="min-w-0">
      <p className="label-caps truncate">{label}</p>
      <p className={cn("num mt-1 text-base", tones[tone])}>{value}</p>
    </div>
  );
}

export function PaletteSwatch({ palette }: { palette: string | null }) {
  if (!palette) return null;
  const map: Record<string, string> = {
    Sunlit: "oklch(0.82 0.12 80)",
    Silvered: "oklch(0.82 0.015 230)",
    Tonal: "oklch(0.62 0.04 70)",
    "High Key": "oklch(0.92 0.05 95)",
    Dark: "oklch(0.35 0.03 60)",
  };
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full border border-border"
        style={{ backgroundColor: map[palette] ?? "oklch(0.8 0 0)" }}
      />
      <span className="label-caps">{palette}</span>
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="wall-card px-6 py-12 text-center">
      <p className="font-display text-lg text-foreground">{title}</p>
      {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
