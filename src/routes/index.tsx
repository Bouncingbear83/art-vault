import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function safeNext(value: unknown): string {
  // Only same-origin relative paths may be used as a post-sign-in destination.
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s['next']) }),
  head: () => ({
    meta: [
      { title: "Art360 — sign in to the vault" },
      {
        name: "description",
        content:
          "Private sign-in for Art360, the research vault behind a UK art dealer's buy-resell book.",
      },
      { property: "og:title", content: "Art360 — sign in to the vault" },
      {
        property: "og:description",
        content: "Private sign-in for Art360, the research vault behind a UK art dealer's buy-resell book.",
      },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const destination = next || "/register";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ href: destination, replace: true });
    });
  }, [navigate, destination]);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + destination },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("Check your inbox — the link signs you straight into the vault.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-md">
        <p className="label-caps">Private research vault</p>
        <h1 className="mt-3 font-display text-5xl leading-none text-foreground">
          Art<span className="text-primary">360</span>
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Verdicts, triggers and flags beside per-artist auction analytics. Sunlit British
          Impressionist, marine and continental oils.
        </p>

        <form onSubmit={sendLink} className="wall-card mt-8 p-6">
          <label className="block">
            <span className="label-caps">Account email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring"
            />
          </label>
          <button
            type="submit"
            disabled={status === "sending"}
            className="mt-4 w-full rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {message && (
            <p
              className={
                status === "error"
                  ? "mt-4 text-sm text-destructive"
                  : "mt-4 text-sm text-harbour"
              }
            >
              {message}
            </p>
          )}
          <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
            Single-account access. No public sign-up.
          </p>
        </form>
      </div>
    </div>
  );
}
