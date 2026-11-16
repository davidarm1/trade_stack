import { getSupportSessionInfo } from "@/lib/support-session";
import { EndSupportButton } from "./end-support-button";

/** Persistent bar shown while a platform admin is inside a company on a support session. */
export async function SupportBanner() {
  const info = await getSupportSessionInfo();
  if (!info) return null;
  return (
    <div className="border-b border-red-300 bg-red-600 px-4 py-2 text-sm text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1">
        <strong>Support session</strong>
        <span>
          {info.companyName} ·{" "}
          {info.role === "owner" ? "full access — changes affect real data" : "view only"}
        </span>
        <span className="opacity-90">
          until{" "}
          {new Date(info.expiresAt).toLocaleTimeString("en-GB", {
            timeZone: "Europe/London",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <EndSupportButton />
      </div>
    </div>
  );
}
