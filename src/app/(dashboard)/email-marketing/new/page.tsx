import { NewTemplateForm } from "./new-template-form";

export default function NewEmailTemplatePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">New template</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create a reusable email template to send to staff or opted-in
        clients.
      </p>
      <NewTemplateForm />
    </div>
  );
}
