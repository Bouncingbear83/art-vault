import { useMemo } from "react";
import { cn } from "@/lib/utils";

// Renders a note body as constituent sections instead of one block.
// Verdict bodies follow the "HEADER: prose" grammar (GRAIN -> FINDING -> READ
// -> GUARDS -> FLAGS); this parses that and lifts the rollup KPIs out of the
// opening BASIS SYNC line into a stat strip. Notes that don't follow the
// grammar fall back to the plain block, so it is safe for every note_type.
//
// Colour language (learnable, consistent):
//   TEAL   = good / sourceable  (arb_read BUY, Data_Confidence High,
//            realisation < 1.0 = below-estimate room, spread_trusted TRUE)
//   RED    = caution, read the note (arb_read WATCH, Data_Confidence Low)
//   OCHRE  = untrusted spread    (spread_trusted FALSE)
//   quiet  = everything else, including realisation >= 1.0 (no room)

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
  const split = g.match(/Exit_Strong\s*(\d+)\s*\/\s*Buy_Regional\s*(\d+)/i);
  const rows: [string, string | null][] = [
    ["n UK auto oil", grab(/n(?:_uk_auto_oil|=)\s*(\d+)/i)],
    ["Exit / Regional", split ? `${split[1]} / ${split[2]}` : null],
    ["Median UK hammer", grab(/median UK (?:oil )?hammer\s*(£[\d,]*\d)/i)],
    ["In-zone realisation", grab(/in-zone realisation\s*(null|~?[\d.]+)/i)],
    ["Buy-regional realisation", grab(/buy_regional_realisation\s*(null|~?[\d.]+)/i)],
    ["Sell-through", grab(/sell-through\s*(\d+%)/i)],
    ["Exit vs regional", grab(/(?:exit_vs_regional_spread|Exit-vs-Regional)\s*([\d.]+x)/i)],
    ["Spread trusted", grab(/spread_trusted\s*(TRUE|FALSE|true|false)/i)],
    ["Arb read", grab(/arb_read\s*(BUY|WATCH|SELECTIVE)/i)],
    ["Data confidence", grab(/Data_Confidence\s*(High|Med|Low)/i)],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null);
}

type Kind = "good" | "alarm" | "neutral" | "true" | "false" | "room" | "noroom" | "nullish" | "plain";

const REALISATION = new Set(["In-zone realisation", "Buy-regional realisation"]);

function kpiKind(label: string, value: string): Kind {
  const v = value.toLowerCase();
  if (label === "Arb read") return v === "buy" ? "good" : v === "watch" ? "alarm" : "neutral";
  if (label === "Data confidence") return v === "high" ? "good" : v === "low" ? "alarm" : "neutral";
  if (label === "Spread trusted") return v.startsWith("t") ? "true" : "false";
  if (REALISATION.has(label)) {
    if (v === "null") return "nullish";
    const n = parseFloat(v.replace("~", ""));
    return Number.isFinite(n) ? (n < 1.0 ? "room" : "noroom") : "plain";
  }
  return "plain";
}

function KpiValue({ label, value }: { label: string; value: string }) {
  const kind = kpiKind(label, value);

  if (kind === "good" || kind === "alarm" || kind === "neutral") {
    const chip =
      kind === "good"
        ? "bg-harbour text-harbour-foreground"
        : kind === "alarm"
          ? "bg-destructive text-destructive-foreground"
          : "border border-border text-foreground";
    return (
      <span
        className={cn(
          "num mt-0.5 inline-flex w-fit items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold tracking-wide",
          chip,
        )}
      >
        {value}
      </span>
    );
  }

  if (kind === "true") return <p className="num mt-0.5 text-sm font-semibold text-harbour">{"\u2713"} {value}</p>;
  if (kind === "false") return <p className="num mt-0.5 text-sm font-semibold text-primary">{"\u2717"} {value}</p>;
  if (kind === "room") return <p className="num mt-0.5 text-sm font-semibold text-harbour">{value}</p>;
  if (kind === "nullish") return <p className="num mt-0.5 text-sm text-muted-foreground">{value}</p>;
  // noroom + plain: quiet foreground; the absence of teal is itself the "no room" signal
  return <p className="num mt-0.5 text-sm text-foreground">{value}</p>;
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
    return <p className={cn("whitespace-pre-wrap text-sm leading-relaxed text-foreground", className)}>{body}</p>;
  }

  const preamble = grain ? grain.text.split(/grain:/i)[0].trim().replace(/[;.]$/, "") : "";

  return (
    <div className={className}>
      {grain?.kpis?.length ? (
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
            {grain.kpis.map(([label, value]) => (
              <div key={label} className="flex flex-col bg-card px-3 py-2">
                <p className="label-caps truncate">{label}</p>
                <KpiValue label={label} value={value} />
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
