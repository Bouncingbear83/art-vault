import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// Primary workflow nav, in daily-driver order. The Book is home.
// Artist 360 folded into The Book; New note demoted to a contextual "+ note" action.
const nav = [
  { to: "/book", label: "The Book" },
  { to: "/desk", label: "Lot Desk" },
  { to: "/desk/log", label: "Deal log" },
  { to: "/positions", label: "Positions" },
] as const;

// Governance surfaces: kept live and visible, demoted out of the primary run.
const adminNav = [{ to: "/register", label: "Debt register" }] as const;

export function AppShell({
  children,
  eyebrow,
  title,
  lede,
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  lede?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", search: { next: "" }, replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <Link to="/book" className="font-display text-xl tracking-tight text-foreground">
            Art<span className="text-primary">360</span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="label-caps py-1 transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-x-5">
            {adminNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="label-caps py-1 text-muted-foreground/70 transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
            <button onClick={signOut} className="label-caps transition-colors hover:text-foreground">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">
        {(eyebrow || title) && (
          <div className="mb-8 border-b border-border pb-6">
            {eyebrow && <p className="label-caps">{eyebrow}</p>}
            {title && (
              <h1 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">
                {title}
              </h1>
            )}
            {lede && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{lede}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
