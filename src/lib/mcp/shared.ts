// Controlled values — must match the SQL enums verbatim.
export const NOTE_TYPE = ["Verdict", "Classification", "Trigger", "Flag", "Learning", "Playbook", "Lot"] as const;
export const SCOPE = ["Artist", "Venue", "Subject", "Medium", "System", "Portfolio", "Lot"] as const;
export const DECISION = [
  "Reclassify",
  "Set_Trigger",
  "Add_Vocab",
  "Patch_Taxonomy",
  "Buy",
  "Skip",
  "Monitor",
  "No_Action",
] as const;
export const ACTION = ["Open", "Actioned", "Superseded", "Wontfix", "Archived"] as const;
export const CONFIDENCE = ["High", "Med", "Low"] as const;
export const PRIORITY = ["P1", "P2", "P3"] as const;
export const PLAY_TYPE = ["Arbitrage", "Quality_hold", "Pending", "NA"] as const;

export const today = () => new Date().toISOString().slice(0, 10);

export function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
