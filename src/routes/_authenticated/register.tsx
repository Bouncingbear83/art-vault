import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/art/app-shell";
import { EmptyState, PriorityTag } from "@/components/art/primitives";
import {
  ageInDays,
  fetchOpenFlags,
  isExpired,
  setActionStatus,
  type NoteWithRelations,
} from "@/lib/art360";

export const Route = createFileRoute("/_authenticated/register")({
  head: () => ({
    meta: [
      { title: "Debt register — Art360" },
      {
        name: "description",
        content: "Every open flag across artists, venues and system, ordered P1 to P3.",
      },
      { property: "og:title", content: "Debt register — Art360" },
      { property: "og:description", content: "Open flags across artists, venues and system." },
    ],
  }),
  component: DebtRegister,
});

function DebtRegister() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["open-flags"],
    queryFn: fetchOpenFlags,
  });

  const action = useMutation({
    mutationFn: (id: string) => setActionStatus(id, "Actioned"),
    onSuccess: () => {
      toast.success("Flag marked actioned");
      queryClient.invalidateQueries({ queryKey: ["open-flags"] });
      queryClient.invalidateQueries({ queryKey: ["artist-360"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flags = data ?? [];

  return (
    <AppShell
      eyebrow="Conservation log"
      title="Debt register"
      lede="Open flags across every scope, ordered by priority. Clearing one removes it from the log."
    >
      {isLoading && <p className="label-caps">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {!isLoading && flags.length === 0 && (
        <EmptyState title="No open flags" hint="The register is clear. Nothing is owed." />
      )}

      {flags.length > 0 && (
        <div className="wall-card overflow-hidden">
          <div className="hidden grid-cols-[3.5rem_6rem_1fr_10rem_5rem_7rem] gap-4 border-b border-border px-5 py-3 md:grid">
            {["Pri", "Scope", "Entry", "Source", "Age", ""].map((h, i) => (
              <span key={i} className="label-caps">
                {h}
              </span>
            ))}
          </div>
          <ul>
            {flags.map((flag) => (
              <FlagRow
                key={flag.id}
                flag={flag}
                pending={action.isPending && action.variables === flag.id}
                onAction={() => action.mutate(flag.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}

function FlagRow({
  flag,
  pending,
  onAction,
}: {
  flag: NoteWithRelations;
  pending: boolean;
  onAction: () => void;
}) {
  const entity = flag.artists?.name ?? flag.entity_key ?? "—";
  const expired = isExpired(flag.valid_to);

  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0 hover:bg-secondary/40 md:grid-cols-[3.5rem_6rem_1fr_10rem_5rem_7rem] md:items-baseline">
      <div className="flex items-center gap-3 md:block">
        <PriorityTag priority={flag.priority} />
        <span className="label-caps md:hidden">{flag.scope}</span>
      </div>
      <span className="label-caps hidden md:inline">{flag.scope}</span>
      <div className="min-w-0">
        <p className="font-display text-base leading-snug text-foreground">{entity}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{flag.body}</p>
        {expired && <span className="label-caps mt-1 inline-block text-primary">Expired</span>}
      </div>
      <span className="num truncate text-xs text-muted-foreground">{flag.source_ref ?? "—"}</span>
      <span className="num text-xs text-muted-foreground">{ageInDays(flag.valid_from)}d</span>
      <button
        onClick={onAction}
        disabled={pending}
        className="label-caps justify-self-start rounded-sm border border-border px-3 py-1.5 transition-colors hover:border-harbour hover:text-harbour disabled:opacity-50 md:justify-self-end"
      >
        {pending ? "…" : "Actioned"}
      </button>
    </li>
  );
}
