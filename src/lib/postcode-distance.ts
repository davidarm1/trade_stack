/**
 * UK postcode geocoding + distance, via postcodes.io (free, no API key).
 * Used only for the engineer travel-pay distance rule — see
 * travel-distance-settings.ts. Not used anywhere near client billing.
 */

type LatLng = { lat: number; lng: number };

async function geocodePostcode(postcode: string): Promise<LatLng | null> {
  const cleaned = postcode.trim().replace(/\s+/g, "");
  if (!cleaned) return null;
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`,
      { cache: "force-cache" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { latitude: number; longitude: number };
    };
    if (!json.result) return null;
    return { lat: json.result.latitude, lng: json.result.longitude };
  } catch {
    return null;
  }
}

function haversineMiles(a: LatLng, b: LatLng): number {
  const R_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(h));
}

/**
 * Straight-line (not driving) distance between two UK postcodes, in
 * miles. Returns null if either postcode can't be geocoded — callers
 * should fail open (treat as eligible / don't block pay) rather than
 * silently excluding hours on a lookup failure, and surface that the
 * distance couldn't be determined so office can review manually.
 */
export async function postcodeDistanceMiles(
  postcodeA: string,
  postcodeB: string,
): Promise<number | null> {
  const [a, b] = await Promise.all([
    geocodePostcode(postcodeA),
    geocodePostcode(postcodeB),
  ]);
  if (!a || !b) return null;
  return haversineMiles(a, b);
}
