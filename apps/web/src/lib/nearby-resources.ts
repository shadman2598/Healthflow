export type NearbyResource = {
  id: string;
  name: string;
  address: string;
  phone: string;
  /** Primary display distance (prefers driving when available). */
  distance: string;
  /** Straight-line km from postal-code centre (always set). */
  distanceKm: number;
  /** Road distance km when OSRM succeeds. */
  driveKm?: number;
  /** Estimated drive minutes when OSRM succeeds. */
  driveMinutes?: number;
  website: string;
  lat: number;
  lon: number;
  mapsUrl: string;
  directionsUrl: string;
};

export type NearbySearchResult = {
  results: NearbyResource[];
  origin: { lat: number; lon: number; label: string };
  disclaimer: string;
  integrationNote: string;
};

/** Categories shown in the finder. Keep string values stable for Care Guide links. */
export const RESOURCE_CATEGORIES = [
  "Pharmacy",
  "Optometrist / eye doctor",
  "Physiotherapy",
  "Massage therapy",
  "Dentist",
  "Chiropractor",
  "Walk-in clinic",
  "Laboratory (blood test)",
  "Imaging / x-ray",
  "Mental health support",
  "Family doctor / clinic",
  "Urgent care / ER",
  "Hospital",
  "Audiologist",
  "Medical supply / pharmacy equipment"
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number] | string;

type GeoPoint = { lat: number; lon: number; label: string };

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const BASE_RADIUS_M = 8000;
const EXPANDED_RADIUS_M = 15000;
const WIDE_RADIUS_M = 25000;
const USER_AGENT = "HealthFlowResourceFinder/1.1 (clinic patient navigator; contact: healthflow.local)";

function normalizePostalCode(postalCode: string): string {
  const compact = postalCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length === 6) {
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  return postalCode.trim().toUpperCase().replace(/\s+/g, " ");
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Normalize legacy / alias labels to canonical category keys. */
function canonicalCategory(category: string): string {
  const c = category.trim();
  if (c === "Laboratory") return "Laboratory (blood test)";
  if (/blood\s*test|lab\b|life\s*labs|dynacare/i.test(c)) return "Laboratory (blood test)";
  if (/urgent|emergency|er\b/i.test(c) && !/hospital/i.test(c)) return "Urgent care / ER";
  return c;
}

function categoryFilters(category: string): string[] {
  switch (canonicalCategory(category)) {
    case "Pharmacy":
      return ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'];
    case "Optometrist / eye doctor":
      return [
        '["healthcare"="optometrist"]',
        '["amenity"="optometrist"]',
        '["shop"="optician"]',
        '["healthcare:speciality"="ophthalmology"]',
        '["healthcare:speciality"="optometry"]'
      ];
    case "Physiotherapy":
      return [
        '["healthcare"="physiotherapist"]',
        '["amenity"="physiotherapist"]',
        '["healthcare:speciality"="physiotherapy"]',
        '["healthcare:speciality"="physical_therapy"]'
      ];
    case "Massage therapy":
      return [
        '["shop"="massage"]',
        '["leisure"="massage"]',
        '["healthcare"="massage_therapist"]',
        '["healthcare:speciality"="massage"]'
      ];
    case "Dentist":
      return ['["amenity"="dentist"]', '["healthcare"="dentist"]'];
    case "Chiropractor":
      return [
        '["healthcare"="chiropractor"]',
        '["healthcare:speciality"="chiropractic"]'
      ];
    case "Walk-in clinic":
      return [
        '["healthcare"="clinic"]["name"~"walk[- ]?in|urgent care|walkin",i]',
        '["amenity"="clinic"]["name"~"walk[- ]?in|urgent care|walkin",i]',
        '["healthcare"="urgent_care"]',
        '["amenity"="clinic"]',
        '["healthcare"="clinic"]'
      ];
    case "Laboratory (blood test)":
      return [
        '["healthcare"="laboratory"]',
        '["amenity"="laboratory"]',
        '["healthcare"="sample_collection"]',
        '["healthcare:speciality"="blood_check"]',
        '["healthcare:speciality"="pathology"]',
        '["amenity"="blood_bank"]',
        '["name"~"LifeLabs|Dynacare|Gamma-Dynacare|blood (test|lab|collection)|medical lab",i]'
      ];
    case "Imaging / x-ray":
      return [
        '["healthcare"="radiology"]',
        '["healthcare:speciality"="radiology"]',
        '["healthcare"="diagnostic_radiology"]',
        '["healthcare:speciality"="ultrasound"]',
        '["healthcare:speciality"="mri"]',
        '["healthcare:speciality"="ct"]',
        '["name"~"imaging|x-?ray|ultrasound|MRI|CT (scan)?|radiology",i]'
      ];
    case "Mental health support":
      return [
        '["healthcare"="psychotherapist"]',
        '["healthcare"="psychologist"]',
        '["healthcare:speciality"="psychiatry"]',
        '["healthcare:speciality"="psychotherapy"]',
        '["amenity"="social_facility"]["social_facility:for"="mental_health"]',
        '["amenity"="social_facility"]'
      ];
    case "Family doctor / clinic":
      return [
        '["amenity"="doctors"]',
        '["healthcare"="doctor"]',
        '["healthcare"="centre"]',
        '["amenity"="clinic"]',
        '["healthcare"="clinic"]'
      ];
    case "Urgent care / ER":
      return [
        '["healthcare"="urgent_care"]',
        '["amenity"="hospital"]["emergency"="yes"]',
        '["emergency"="yes"]',
        '["healthcare:speciality"="emergency"]',
        '["name"~"urgent care|emergency|ER\\b|walk[- ]?in",i]'
      ];
    case "Hospital":
      return ['["amenity"="hospital"]', '["healthcare"="hospital"]'];
    case "Audiologist":
      return [
        '["healthcare"="audiologist"]',
        '["healthcare:speciality"="audiology"]',
        '["shop"="hearing_aids"]',
        '["name"~"audiolog|hearing (aid|clinic)",i]'
      ];
    case "Medical supply / pharmacy equipment":
      return [
        '["shop"="medical_supply"]',
        '["shop"="orthopedic"]',
        '["healthcare"="medical_supply"]',
        '["name"~"medical (supply|equipment)|home health|mobility",i]'
      ];
    default:
      return ['["amenity"="clinic"]', '["healthcare"]'];
  }
}

/** Nominatim free-text query phrases for fallback (local search). */
function fallbackQueries(category: string): string[] {
  switch (canonicalCategory(category)) {
    case "Pharmacy":
      return ["pharmacy", "drugstore"];
    case "Optometrist / eye doctor":
      return ["optometrist", "eye clinic", "optician"];
    case "Physiotherapy":
      return ["physiotherapy", "physiotherapist", "physical therapy"];
    case "Laboratory (blood test)":
      return ["blood test lab", "medical laboratory", "LifeLabs", "Dynacare"];
    case "Imaging / x-ray":
      return ["medical imaging", "x-ray clinic", "radiology"];
    case "Walk-in clinic":
      return ["walk-in clinic", "urgent care clinic"];
    case "Urgent care / ER":
      return ["urgent care", "emergency department"];
    case "Hospital":
      return ["hospital"];
    case "Audiologist":
      return ["audiologist", "hearing clinic"];
    case "Medical supply / pharmacy equipment":
      return ["medical supply store", "home health care"];
    default:
      return [canonicalCategory(category)];
  }
}

function buildOverpassQuery(origin: GeoPoint, category: string, radiusM: number): string {
  const filters = categoryFilters(category);
  const around = `(around:${radiusM},${origin.lat},${origin.lon})`;
  const parts = filters.flatMap((filter) => [
    `node${filter}${around};`,
    `way${filter}${around};`,
    `relation${filter}${around};`
  ]);
  return `
    [out:json][timeout:30];
    (
      ${parts.join("\n")}
    );
    out center tags 80;
  `;
}

function buildAddress(tags: Record<string, string> = {}): string {
  const line1 = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const line2 = [tags["addr:city"] ?? tags["addr:suburb"], tags["addr:postcode"] ?? tags["addr:state"]]
    .filter(Boolean)
    .join(", ");
  const composed = [line1, line2].filter(Boolean).join(", ");
  return composed || tags["addr:full"] || "Address unavailable — open directions for the map pin";
}

async function geocodePostalCode(postalCode: string): Promise<GeoPoint> {
  const normalized = normalizePostalCode(postalCode);
  const compact = normalized.replace(/\s+/g, "");

  // Browser / GitHub Pages: Nominatim blocks CORS — use Photon (Komoot) instead.
  if (typeof window !== "undefined") {
    try {
      const photonUrl =
        `https://photon.komoot.io/api/?q=${encodeURIComponent(`${normalized}, Canada`)}` +
        `&limit=3&lang=en`;
      const response = await fetch(photonUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) {
        const data = (await response.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] };
            properties?: { name?: string; countrycode?: string; postcode?: string; city?: string; state?: string };
          }>;
        };
        const features = data.features ?? [];
        const ranked = [...features].sort((a, b) => {
          const aPc = (a.properties?.postcode ?? "").replace(/\s+/g, "").toUpperCase();
          const bPc = (b.properties?.postcode ?? "").replace(/\s+/g, "").toUpperCase();
          const aHit = aPc === compact || aPc.startsWith(compact.slice(0, 3)) ? 1 : 0;
          const bHit = bPc === compact || bPc.startsWith(compact.slice(0, 3)) ? 1 : 0;
          return bHit - aHit;
        });
        const hit = ranked.find((f) => f.geometry?.coordinates?.length === 2);
        if (hit?.geometry?.coordinates) {
          const [lon, lat] = hit.geometry.coordinates;
          const props = hit.properties ?? {};
          if (!props.countrycode || props.countrycode.toUpperCase() === "CA") {
            const label = [props.name, props.city, props.state, props.postcode, "Canada"]
              .filter(Boolean)
              .join(", ");
            return { lat, lon, label: label || normalized };
          }
        }
      }
    } catch {
      // fall through to Nominatim (works in Node / Next route handlers)
    }
  }

  const attempts = [
    `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(normalized)}&countrycodes=ca&format=json&addressdetails=1&limit=3`,
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${normalized}, Canada`)}&countrycodes=ca&format=json&addressdetails=1&limit=3`,
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(compact)}&countrycodes=ca&format=json&addressdetails=1&limit=3`
  ];

  type NomHit = {
    lat: string;
    lon: string;
    display_name?: string;
    type?: string;
    class?: string;
    importance?: number;
    address?: { postcode?: string; country_code?: string };
  };

  for (const url of attempts) {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" }
    });
    if (!response.ok) continue;
    const data = (await response.json()) as NomHit[];
    if (!data.length) continue;

    // Prefer hits whose address postcode matches (more accurate than city centroid).
    const scored = [...data].sort((a, b) => {
      const aPc = (a.address?.postcode ?? "").replace(/\s+/g, "").toUpperCase();
      const bPc = (b.address?.postcode ?? "").replace(/\s+/g, "").toUpperCase();
      const target = compact;
      const aExact = aPc === target || aPc.startsWith(target.slice(0, 3)) ? 1 : 0;
      const bExact = bPc === target || bPc.startsWith(target.slice(0, 3)) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return (b.importance ?? 0) - (a.importance ?? 0);
    });

    const hit = scored[0];
    if (hit.address?.country_code && hit.address.country_code.toLowerCase() !== "ca") {
      continue;
    }

    return {
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      label: hit.display_name ?? normalized
    };
  }

  throw new Error("Could not locate that postal code. Try a full Canadian code like M5V 3L9.");
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": USER_AGENT
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(35000)
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { elements?: OverpassElement[] };
      return data.elements ?? [];
    } catch {
      // try next mirror
    }
  }

  return [];
}

async function nominatimFallback(
  origin: GeoPoint,
  category: string
): Promise<OverpassElement[]> {
  const delta = 0.18; // ~20 km box
  const viewbox = [
    origin.lon - delta,
    origin.lat + delta,
    origin.lon + delta,
    origin.lat - delta
  ].join(",");

  const results: OverpassElement[] = [];
  const seen = new Set<number>();

  for (const phrase of fallbackQueries(category).slice(0, 3)) {
    const q = encodeURIComponent(phrase);
    const url =
      `https://nominatim.openstreetmap.org/search?q=${q}` +
      `&format=json&limit=12&addressdetails=1&extratags=1&countrycodes=ca` +
      `&viewbox=${viewbox}&bounded=1`;

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) continue;
      const data = (await response.json()) as Array<{
        place_id: number;
        lat: string;
        lon: string;
        display_name: string;
        name?: string;
        extratags?: Record<string, string>;
      }>;

      for (const item of data) {
        if (seen.has(item.place_id)) continue;
        seen.add(item.place_id);
        results.push({
          type: "node",
          id: item.place_id,
          lat: Number(item.lat),
          lon: Number(item.lon),
          tags: {
            name: item.name ?? item.display_name.split(",")[0] ?? phrase,
            "addr:full": item.display_name,
            phone: item.extratags?.phone ?? item.extratags?.["contact:phone"] ?? "",
            website: item.extratags?.website ?? item.extratags?.["contact:website"] ?? ""
          }
        });
      }
    } catch {
      // continue
    }

    await new Promise((r) => setTimeout(r, 1100));
  }

  return results;
}

function toResource(
  element: OverpassElement,
  origin: GeoPoint,
  postalCode: string
): NearbyResource | null {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat == null || lon == null) return null;

  const tags = element.tags ?? {};
  const name = tags.name ?? tags.brand ?? tags.operator ?? tags["official_name"];
  if (!name) return null;

  const distanceKm = haversineKm(origin, { lat, lon });
  const phone = tags.phone ?? tags["contact:phone"] ?? "Not listed";
  const website =
    tags.website ?? tags["contact:website"] ?? tags["brand:website"] ?? "";
  const address = buildAddress(tags);
  const destination = `${lat},${lon}`;

  return {
    id: `${element.type}-${element.id}`,
    name,
    address,
    phone,
    distance: `${formatDistance(distanceKm)} straight-line`,
    distanceKm,
    website: website || `https://www.openstreetmap.org/${element.type}/${element.id}`,
    lat,
    lon,
    mapsUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      postalCode
    )}&destination=${encodeURIComponent(destination)}&travelmode=driving`
  };
}

/** Enrich top results with OSRM driving distance/duration when the public router is reachable. */
async function enrichWithDrivingDistances(
  origin: GeoPoint,
  resources: NearbyResource[]
): Promise<NearbyResource[]> {
  if (resources.length === 0) return resources;

  const coords = [
    `${origin.lon},${origin.lat}`,
    ...resources.map((r) => `${r.lon},${r.lat}`)
  ].join(";");

  // sources=0 destinations=1;2;...
  const destinations = resources.map((_, i) => i + 1).join(";");
  const url =
    `https://router.project-osrm.org/table/v1/driving/${coords}` +
    `?sources=0&destinations=${destinations}&annotations=duration,distance`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return resources;
    const data = (await response.json()) as {
      code?: string;
      distances?: Array<Array<number | null>>;
      durations?: Array<Array<number | null>>;
    };
    if (data.code !== "Ok" || !data.distances?.[0] || !data.durations?.[0]) {
      return resources;
    }

    const distances = data.distances[0];
    const durations = data.durations[0];

    return resources.map((resource, index) => {
      const metres = distances[index];
      const seconds = durations[index];
      if (metres == null || seconds == null || !Number.isFinite(metres) || metres < 0) {
        return resource;
      }
      const driveKm = metres / 1000;
      const driveMinutes = Math.max(1, Math.round(seconds / 60));
      return {
        ...resource,
        driveKm,
        driveMinutes,
        distance: `${formatDistance(driveKm)} drive · ${driveMinutes} min`,
        // Rank by road distance when available.
        distanceKm: driveKm
      };
    });
  } catch {
    return resources;
  }
}

async function collectElements(
  origin: GeoPoint,
  category: string
): Promise<OverpassElement[]> {
  let elements = await queryOverpass(buildOverpassQuery(origin, category, BASE_RADIUS_M));

  if (elements.length < 5) {
    const expanded = await queryOverpass(
      buildOverpassQuery(origin, category, EXPANDED_RADIUS_M)
    );
    elements = mergeElements(elements, expanded);
  }

  if (elements.length < 3) {
    const wide = await queryOverpass(buildOverpassQuery(origin, category, WIDE_RADIUS_M));
    elements = mergeElements(elements, wide);
  }

  if (elements.length === 0) {
    elements = await nominatimFallback(origin, category);
  }

  return elements;
}

function mergeElements(a: OverpassElement[], b: OverpassElement[]): OverpassElement[] {
  const map = new Map<string, OverpassElement>();
  for (const el of [...a, ...b]) {
    map.set(`${el.type}-${el.id}`, el);
  }
  return [...map.values()];
}

export async function searchNearbyResources(
  postalCode: string,
  category: string
): Promise<NearbySearchResult> {
  const normalizedPostal = normalizePostalCode(postalCode);
  const origin = await geocodePostalCode(normalizedPostal);
  // Be polite to Nominatim rate limits before Overpass / fallback calls.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const elements = await collectElements(origin, category);

  const unique = new Map<string, NearbyResource>();
  for (const element of elements) {
    const resource = toResource(element, origin, normalizedPostal);
    if (!resource) continue;
    // Keep results within the wide search window for fallback noise control.
    if (resource.distanceKm > WIDE_RADIUS_M / 1000 + 2) continue;
    const key = `${resource.name.toLowerCase()}|${resource.lat.toFixed(4)}|${resource.lon.toFixed(4)}`;
    const existing = unique.get(key);
    if (!existing || resource.distanceKm < existing.distanceKm) {
      unique.set(key, resource);
    }
  }

  let results = [...unique.values()]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);

  // Re-rank top candidates by real road distance when OSRM is available.
  results = await enrichWithDrivingDistances(origin, results);
  results = results.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 15);

  const usedDriving = results.some((r) => r.driveKm != null);

  return {
    results,
    origin: {
      lat: origin.lat,
      lon: origin.lon,
      label: origin.label
    },
    disclaimer: usedDriving
      ? "Results use OpenStreetMap places near your postal-code centre, ranked by estimated driving distance (OSRM). Listings may be incomplete and are not medical endorsements."
      : "Results use OpenStreetMap places near your postal-code centre, ranked by straight-line distance. Listings may be incomplete and are not medical endorsements.",
    integrationNote:
      "Directions open in Google Maps from your postal code. Map data © OpenStreetMap contributors. Routing via OSRM when available."
  };
}
