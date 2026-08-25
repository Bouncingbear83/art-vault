import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Column header ⓘ. Opens a dark calc popover on hover / focus / tap.
 * Clicking it must never reach the header's sort handler, so every pointer
 * event is stopped here.
 */
export function ColInfo({ label, tip }: { label: string; tip: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    const p = popRef.current;
    if (!b || !p) return;
    const pw = p.offsetWidth || 300;
    const ph = p.offsetHeight || 80;
    let left = b.left - 6;
    let top = b.bottom + 8;
    if (left + pw > window.innerWidth - 12) left = window.innerWidth - 12 - pw;
    if (left < 12) left = 12;
    if (top + ph > window.innerHeight - 12) top = b.top - 8 - ph;
    setPos({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const hide = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border font-display text-[10px] italic leading-none text-muted-foreground normal-case hover:border-teal hover:text-teal focus:border-teal focus:text-teal"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        i
      </button>
      <div
        ref={popRef}
        role="tooltip"
        style={{ left: pos.left, top: pos.top }}
        className={`fixed z-50 max-w-[300px] rounded-md bg-foreground px-3 py-2.5 font-sans text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-background shadow-lg transition-opacity duration-100 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {tip}
      </div>
    </>
  );
}
