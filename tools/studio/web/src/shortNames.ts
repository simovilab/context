// Short display names for the tree index. Full names remain authoritative in
// each node's node.yaml and are shown in the node's Summary tab.

export const SHORT_NAMES: Record<string, string> = {
  project: "InfoTP",

  C1: "Data management",
  C1P1: "GTFS docs",
  C1P2: "GTFS ZIP",
  C1P3: "governance",

  C2: "GTFS editor",
  C2P1: "database",
  C2P2: "web editor",
  C2P3: "editor docs",

  C3: "Realtime alerts",
  C3P1: "guidelines",
  C3P2: "alert system",

  C4: "Integration",
  C4P1: "data API",
  C4P2: "realtime API",
  C4P3: "semantic API",
  C4P4: "compute API",
  C4P5: "dev portal",

  C5: "Public website",
  C5P1: "public site",
  C5P2: "content admin",

  C6: "Visual identity",
  C6P1: "nomenclature",
  C6P2: "visual manual",
  C6P3: "signage manual",
  C6P4: "signage gen",

  C7: "Education & promotion",
  C7P1: "comms strategy",
  C7P2: "portfolio",
};

export function shortName(id: string, fallback: string): string {
  return SHORT_NAMES[id] ?? fallback;
}
