import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/register", label: "Debt register" },
  { to: "/artists", label: "Artist 360" },
  { to: "/book", label: "The Book" },
  { to: "/notes/new", label: "New note" },
] as const;

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
          <Link to="/register" className="font-display text-xl tracking-tight text-foreground">
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
          <button onClick={signOut} className="label-caps transition-colors hover:text-foreground">
            Sign out
          </button>
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
