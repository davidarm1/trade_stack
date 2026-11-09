import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

/** True when the Stripe secret key is configured on the server. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set on the server.");
  if (!client) client = new Stripe(key);
  return client;
}

/** Public origin of the app, used for Stripe return URLs and pay links. */
export function appOrigin(fallback?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return (fallback ?? "").replace(/\/+$/, "");
}
