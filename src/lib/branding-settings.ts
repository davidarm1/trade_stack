/** Settings keys for sidebar / mobile header / invoice *top header* branding (tenant `settings`). */
export const BRANDING_SHOW_LOGO_KEY = "branding_show_logo";
export const BRANDING_SHOW_COMPANY_NAME_KEY = "branding_show_company_name";
/** Legacy: when true, logo replaced name (maps to logo only). */
export const BRANDING_USE_LOGO_LEGACY_KEY = "branding_use_logo";

function isTrue(v: string | undefined): boolean {
  return String(v ?? "").trim().toLowerCase() === "true";
}

/**
 * Resolves whether to show logo and/or company name in headers (dashboard + invoice top banner).
 * Invoice “From” postal blocks ignore this and always show full address text.
 */
export function resolveBrandingFromSettings(
  settings: Record<string, string>,
): { showLogo: boolean; showName: boolean } {
  const hasNameKey = Object.prototype.hasOwnProperty.call(
    settings,
    BRANDING_SHOW_COMPANY_NAME_KEY,
  );
  const hasLogoKey = Object.prototype.hasOwnProperty.call(settings, BRANDING_SHOW_LOGO_KEY);

  if (hasNameKey || hasLogoKey) {
    const showName = hasNameKey
      ? isTrue(settings[BRANDING_SHOW_COMPANY_NAME_KEY])
      : true;
    const showLogo = hasLogoKey ? isTrue(settings[BRANDING_SHOW_LOGO_KEY]) : false;
    if (!showName && !showLogo) {
      return { showLogo: false, showName: true };
    }
    return { showLogo, showName };
  }

  if (isTrue(settings[BRANDING_USE_LOGO_LEGACY_KEY])) {
    return { showLogo: true, showName: false };
  }
  return { showLogo: false, showName: true };
}
