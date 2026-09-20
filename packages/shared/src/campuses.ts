import { z } from "zod";
import { AnchorSchema } from "./preferences.ts";

export const KnownBuildingSchema = z.object({
  name: z.string(),
  // Street address when verified. Used for address-based exclusion.
  address: z.string().nullable(),
  manager: z.string().nullable(),
});
export type KnownBuilding = z.infer<typeof KnownBuildingSchema>;

export const CampusPresetSchema = z.object({
  id: z.string(),
  anchor: AnchorSchema,
  // Where sources should center their geo queries, and how wide to cast the net
  searchRadiusMiles: z.number(),
  zips: z.array(z.string()),
  neighborhoods: z.array(z.string()),
  // Large managed buildings a profile can exclude or target with one click
  knownBuildings: z.array(KnownBuildingSchema),
});
export type CampusPreset = z.infer<typeof CampusPresetSchema>;

// Coordinates are campus centers, accurate to about a block. Profiles can override with a custom anchor.
export const CAMPUSES: CampusPreset[] = [
  {
    id: "homewood",
    anchor: { label: "JHU Homewood", lat: 39.3299, lon: -76.6205 },
    searchRadiusMiles: 2,
    zips: ["21218", "21211", "21210"],
    neighborhoods: [
      "Charles Village",
      "Remington",
      "Hampden",
      "Waverly",
      "Oakenshawe",
      "Abell",
      "Tuscany-Canterbury",
      "Guilford",
      "Old Goucher",
      "Wyman Park",
    ],
    knownBuildings: [
      { name: "Nine East 33rd", address: "9 E 33rd St", manager: "HH Red Stone" },
      { name: "The Marylander", address: "3501 St Paul St", manager: "Morgan Properties" },
      { name: "The Academy on Charles", address: null, manager: null },
      { name: "The Social North Charles", address: null, manager: null },
      { name: "Hopkins House", address: null, manager: null },
      { name: "The Carlyle", address: null, manager: null },
      { name: "The Blackstone", address: null, manager: null },
      { name: "The Allston", address: null, manager: null },
    ],
  },
  {
    id: "peabody",
    anchor: { label: "Peabody Institute", lat: 39.2975, lon: -76.6152 },
    searchRadiusMiles: 1.5,
    zips: ["21201", "21202"],
    neighborhoods: ["Mount Vernon", "Midtown-Belvedere", "Bolton Hill", "Station North"],
    knownBuildings: [],
  },
  {
    id: "east-baltimore",
    anchor: { label: "JHU East Baltimore (Medical Campus)", lat: 39.2967, lon: -76.5927 },
    searchRadiusMiles: 2,
    zips: ["21205", "21231", "21224", "21202"],
    neighborhoods: ["Butchers Hill", "Fells Point", "Upper Fells Point", "Patterson Park", "Canton", "Washington Hill"],
    knownBuildings: [],
  },
  {
    id: "carey",
    anchor: { label: "Carey Business School (Harbor East)", lat: 39.2822, lon: -76.6017 },
    searchRadiusMiles: 1.5,
    zips: ["21202", "21231"],
    neighborhoods: ["Harbor East", "Fells Point", "Little Italy", "Inner Harbor"],
    knownBuildings: [],
  },
  {
    id: "dc-bloomberg-center",
    anchor: { label: "Hopkins Bloomberg Center (DC)", lat: 38.893, lon: -77.019 },
    searchRadiusMiles: 2,
    zips: ["20001", "20002", "20004"],
    neighborhoods: ["Penn Quarter", "Capitol Hill", "Shaw", "NoMa"],
    knownBuildings: [],
  },
];

export function getCampus(id: string): CampusPreset | undefined {
  return CAMPUSES.find((c) => c.id === id);
}
