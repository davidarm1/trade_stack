import Link from "next/link";
import { redirect } from "next/navigation";
import { PACKAGES, type PackageId } from "@/lib/plans";
import {
  signUpFromRegisterForm,
  submitRegisterTestPayment,
} from "@/actions/auth";

function q(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parsePackageId(
  v: string | string[] | undefined,
): PackageId | null {
  const s = q(v);
  return s === "core" || s === "pro" ? s : null;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string | string[];
    package?: string | string[];
    declined?: string | string[];
    error?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const stepRaw = q(sp.step);
  const step =
    stepRaw === "2" ? 2 : stepRaw === "3" ? 3 : stepRaw === "4" ? 4 : 1;
  const packageId = parsePackageId(sp.package);

  if ((step === 2 || step === 3 || step === 4) && !packageId) {
    redirect("/register");
  }

  const selectedPackage = packageId
    ? PACKAGES.find((p) => p.id === packageId)
    : null;

  const paymentDeclined = q(sp.declined) === "1";
  const signupError = q(sp.error) ?? null;

  return (
    <div className="relative isolate z-10 flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Step {step} of 4
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {step === 1 && "Choose your package"}
          {step === 2 && "Monthly billing"}
          {step === 3 && "Payment"}
          {step === 4 && "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {step === 1 && "Select the plan that fits your business."}
          {step === 2 &&
            "Trade Stack is billed monthly. You can change or cancel later."}
          {step === 3 &&
            "Test checkout: use card number 63430 to simulate a successful payment."}
          {step === 4 &&
            "Your workspace will use the package and billing you selected."}
        </p>

        {step === 1 && (
          <form method="get" action="/register" className="mt-8 space-y-3">
            <input type="hidden" name="step" value="2" />
            {PACKAGES.map((p) => (
              <label
                key={p.id}
                className="block w-full cursor-pointer rounded-lg border border-slate-200 px-4 py-4 transition has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50 has-[:checked]:ring-1 has-[:checked]:ring-slate-900 hover:border-slate-300"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="package"
                    value={p.id}
                    required
                    className="mt-1 h-4 w-4 shrink-0 border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {p.name}
                      </span>
                      <span className="text-sm text-slate-600">
                        {p.priceMonthlyLabel}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {p.description}
                    </span>
                  </span>
                </div>
              </label>
            ))}
            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Continue
            </button>
          </form>
        )}

        {step === 2 && packageId && selectedPackage && (
          <div className="mt-8 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">
                {selectedPackage.name} — monthly
              </p>
              <p className="mt-1">{selectedPackage.priceMonthlyLabel}</p>
              <p className="mt-2 text-slate-600">
                Billed every month. Taxes may apply.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/register"
                className="flex flex-1 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </Link>
              <form
                method="get"
                action="/register"
                className="flex flex-1 flex-col"
              >
                <input type="hidden" name="step" value="3" />
                <input type="hidden" name="package" value={packageId} />
                <button
                  type="submit"
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Continue to payment
                </button>
              </form>
            </div>
          </div>
        )}

        {step === 3 && packageId && selectedPackage && (
          <form
            action={submitRegisterTestPayment}
            className="mt-8 space-y-4"
          >
            <input type="hidden" name="packageId" value={packageId} />
            <div>
              <label
                htmlFor="cardNumber"
                className="block text-sm font-medium text-slate-700"
              >
                Card number
              </label>
              <input
                id="cardNumber"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="e.g. 63430 for test approval"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              <p className="mt-1 text-xs text-slate-500">
                Sandbox: entering exactly{" "}
                <span className="font-mono">63430</span> (digits only) approves
                payment.
              </p>
            </div>
            {paymentDeclined && (
              <p className="text-sm text-red-600" role="alert">
                Payment was declined. For testing, use card number 63430 to
                simulate approval.
              </p>
            )}
            <div className="flex gap-3">
              <Link
                href={`/register?step=2&package=${packageId}`}
                className="flex flex-1 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </Link>
              <button
                type="submit"
                className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Pay and continue
              </button>
            </div>
          </form>
        )}

        {step === 4 && packageId && selectedPackage && (
          <form action={signUpFromRegisterForm} className="mt-8 space-y-4">
            <input type="hidden" name="packageId" value={packageId} />
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {selectedPackage.name} (monthly) — payment simulated as approved.
            </div>
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700"
              >
                Full name
              </label>
              <input
                id="name"
                name="name"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="companyName"
                className="block text-sm font-medium text-slate-700"
              >
                Company name
              </label>
              <input
                id="companyName"
                name="companyName"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            {signupError && (
              <p className="text-sm text-red-600" role="alert">
                {signupError}
              </p>
            )}
            <div className="flex gap-3">
              <Link
                href={`/register?step=3&package=${packageId}`}
                className="flex flex-1 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </Link>
              <button
                type="submit"
                className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Create account
              </button>
            </div>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-slate-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
