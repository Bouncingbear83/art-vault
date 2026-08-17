import { useMemo } from "react";
import { cn } from "@/lib/utils";

// Renders a note body as constituent sections instead of one block.
// Verdict bodies follow the "HEADER: prose" grammar (GRAIN -> FINDING -> READ
// -> GUARDS -> FLAGS); this parses that and lifts the rollup KPIs out of the
// opening BASIS SYNC line into a stat strip. Notes that don't follow the
// grammar (most Triggers/Flags/Learnings) fall back to the plain block, so it
// is safe to use for every note_type.

type Cls = "GRAIN" | "FINDING" | "READ" | "GUARDS" | "FLAGS";

interface Section {
  cls: Cls;
  header: string | null;
  text: string;
  kpis?: [string, string][];
}

const TONE: Record<Exclude<Cls, "GRAIN">, { label: string; bar: string; head: string }> = {
  FINDING: { label: "Finding", bar: "border-border", head: "text-muted-foreground" },
  READ: { label: "Read", bar: "border-harbour", head: "text-harbour" },
  GUARDS: { label: "Guards", bar: "border-muted-foreground/40", head: "text-muted-foreground" },
  FLAGS: { label: "Flags", bar: "border-destructive", head: "text-destructive" },
};

function classify(header: string): Cls {
  const h = header.toLowerCase();
  if (/^basis sync/.test(h)) return "GRAIN";
  if (/(hygiene flag|open system flag|dates|contradiction)/.test(h)) return "FLAGS";
  if (/(standing|disambiguation|collision|^arr\b|kill|revisit|walk-away|rulings|structural caveat)/.test(h))
    return "GUARDS";
  if (/(read|verdict|what holds|^edge\b)/.test(h)) return "READ";
  return "FINDING";
}

function extractKpis(g: string): [string, string][] {
  const grab = (re: RegExp) => {
    const m = g.match(re);
    return m ? m[1].trim() : null;
  };
  const rows: [string, string | null][] = [
    ["n UK auto oil", grab(/n(?:_uk_auto_oil|=)\s*(\d+)/i)],
    ["Exit / Regional", grab(/Exit_Strong\s*(\d+\s*\/\s*Buy_Regional\s*\d+)/i)],
    ["Median UK hammer", grab(/median UK (?:oil )?hammer\s*(£[\d,]+)/i)],
    ["In-zone realisation", grab(/in-zone realisation\s*([\d.]+)/i)],
    ["Buy-regional realisation", grab(/buy_regional_realisation\s*(null|~?[\d.]+)/i)],
    ["Sell-through", grab(/sell-through\s*(\d+%)/i)],
    ["Exit vs regional", grab(/(?:exit_vs_regional_spread|Exit-vs-Regional)\s*([\d.]+x)/i)],
    ["Spread trusted", grab(/spread_trusted\s*(TRUE|FALSE|true|false)/i)],
    ["Arb read", grab(/arb_read\s*(BUY|WATCH|SELECTIVE)/i)],
    ["Data confidence", grab(/Data_Confidence\s*(High|Med|Low)/i)],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null);
}

function kpiTone(label: string, value: string): string {
  const v = value.toLowerCase();
  if (label === "Spread trusted") return v.startsWith("t") ? "text-harbour" : "text-destructive";
  if (label === "Arb read") return v === "buy" ? "text-harbour" : v === "watch" ? "text-destructive" : "text-primary";
  if (label === "Data confidence") return v === "high" ? "text-harbour" : v === "low" ? "text-destructive" : "text-primary";
  return "text-foreground";
}

function parseBody(body: string): Section[] {
  const paras = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.map((p): Section => {
    if (/^BASIS SYNC/i.test(p)) return { cls: "GRAIN", header: "Basis sync", text: p, kpis: extractKpis(p) };
    const m = p.match(/^([^:\n]{3,70}?):\s+([\s\S]*)$/) || p.match(/^([A-Z][^-\n]{3,70}?)\s+-\s+([\s\S]*)$/);
    if (m) {
      const header = m[1].trim();
      return { cls: classify(header), header, text: m[2].trim() };
    }
    return { cls: classify(p.slice(0, 40)), header: null, text: p };
  });
}

export function NoteBody({ body, className }: { body: string; className?: string }) {
  const sections = useMemo(() => parseBody(body), [body]);
  const grain = sections.find((s) => s.cls === "GRAIN");
  const headed = sections.filter((s) => s.header && s.cls !== "GRAIN").length;
  const sectionable = !!grain || headed >= 2;

  if (!sectionable) {
    return (
      <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-foreground", className)}>{body}</p>
    );
  }

  const preamble = grain ? grain.text.split(/grain:/i)[0].trim().replace(/[;.]$/, "") : "";

  return (
    <div className={className}>
      {grain?.kpis?.length ? (
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
            {grain.kpis.map(([label, value]) => (
              <div key={label} className="bg-card px-3 py-2">
                <p className="label-caps truncate">{label}</p>
                <p className={cn("num mt-0.5 text-sm", kpiTone(label, value))}>{value}</p>
              </div>
            ))}
          </div>
          {preamble && <p className="num mt-1.5 text-xs text-muted-foreground">{preamble}</p>}
        </div>
      ) : null}

      {sections
        .filter((s) => s.cls !== "GRAIN")
        .map((s, i) => {
          const tone = TONE[s.cls as Exclude<Cls, "GRAIN">];
          const showHeader = s.header && s.header.toLowerCase() !== tone.label.toLowerCase();
          return (
            <div key={i} className={cn("border-l-2 pl-3", tone.bar, i > 0 && "mt-3")}>
              <p className={cn("label-caps", tone.head)}>
                {tone.label}
                {showHeader ? ` · ${s.header}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{s.text}</p>
            </div>
          );
        })}
    </div>
  );
}
