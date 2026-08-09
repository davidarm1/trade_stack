/**
 * Settings keys for the engineer travel-pay distance rule (tenant
 * `settings` k/v table) — deliberately separate from any client-facing
 * travel pricing, per your answer that these are independent rules. No
 * client billing distance concept exists in this codebase, and this
 * doesn't touch client pricing at all.
 */
export const DEPOT_POSTCODE_KEY = "travel_pay_depot_postcode";
export const TRAVEL_DISTANCE_THRESHOLD_MILES_KEY =
  "travel_pay_distance_threshold_miles";

export function resolveTravelDistanceSettings(
  settings: Record<string, string>,
): { depotPostcode: string | null; thresholdMiles: number | null } {
  const depotPostcode = settings[DEPOT_POSTCODE_KEY]?.trim() || null;
  const rawThreshold = settings[TRAVEL_DISTANCE_THRESHOLD_MILES_KEY]?.trim();
  const thresholdMiles = rawThreshold ? Number(rawThreshold) : null;
  return {
    depotPostcode,
    thresholdMiles:
      thresholdMiles != null && !Number.isNaN(thresholdMiles) && thresholdMiles > 0
        ? thresholdMiles
        : null,
  };
}
