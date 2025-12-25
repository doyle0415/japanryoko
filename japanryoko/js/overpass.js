// overpass.js

export function buildOverpassQuery(lat, lon, radius = 800) {
  const r = Number(radius) || 800;
  const la = Number(lat).toFixed(6);
  const lo = Number(lon).toFixed(6);
  return `
    [out:json][timeout:25];
    (
      node(around:${r},${la},${lo})["amenity"="restaurant"];
      node(around:${r},${la},${lo})["amenity"="cafe"];
      node(around:${r},${la},${lo})["amenity"="place_of_worship"]["religion"="shinto"];
      node(around:${r},${la},${lo})["tourism"="attraction"];
    );
    out body qt;
  `;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

export async function fetchOverpass(query) {
  const encoded = encodeURIComponent(query);
  let lastError;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const url = `${ep}?data=${encoded}`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.elements)) {
        throw new Error("invalid payload");
      }
      return data.elements;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[Overpass] endpoint failed:", e);
      lastError = e;
      continue;
    }
  }
  throw new Error(`Overpass API 오류: ${lastError?.message || "unknown"}`);
}

export function parseOverpassElements(elements) {
  return elements
    .filter((el) => el && el.type === "node")
    .map((el) => {
      const t = el.tags || {};
      const category = normalizeCategory(t);
      const website =
        t.website ||
        t["contact:website"] ||
        t.url ||
        null;
      const phone =
        t.phone ||
        t["contact:phone"] ||
        null;
      const address =
        t["addr:full"] ||
        composeAddress(t);
      return {
        id: el.id,
        name: t.name || "이름 없음",
        nameKo: t["name:ko"] || null,
        category,
        amenity: t.amenity,
        tourism: t.tourism,
        cuisine: t.cuisine || null,
        website,
        opening_hours: t.opening_hours || null,
        phone,
        address,
        lat: el.lat,
        lon: el.lon
      };
    });
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function normalizeCategory(tags) {
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "place_of_worship" && tags.religion === "shinto") return "shrine";
  if (tags.tourism === "attraction") return "attraction";
  return "other";
}

function composeAddress(t) {
  const parts = [
    t["addr:postcode"],
    t["addr:state"],
    t["addr:city"],
    t["addr:district"],
    t["addr:suburb"],
    [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "),
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}


