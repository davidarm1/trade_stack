import { NewDocumentForm } from "./new-document-form";

export default function NewOnboardingDocumentPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">
        New onboarding document
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Staff must accept this before they can use the app, if marked
        required.
      </p>
      <NewDocumentForm />
    </div>
  );
}
