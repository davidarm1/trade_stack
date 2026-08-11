"use client";

export type WorkflowStepperState =
  | "done"
  | "current"
  | "ready"
  | "blocked"
  | "skipped";

export type WorkflowStepperStage = {
  key: string;
  label: string;
  detail: string;
  state: WorkflowStepperState;
};

function chipClass(state: WorkflowStepperState) {
  if (state === "done") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "current") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "ready") return "border-sky-200 bg-sky-50 text-sky-800";
  if (state === "skipped") return "border-violet-200 bg-violet-50 text-violet-800";
  return "border-slate-200 bg-slate-50 text-slate-400";
}

function dotForState(state: WorkflowStepperState) {
  if (state === "done") return "✓";
  if (state === "ready") return "↗";
  if (state === "skipped") return "↷";
  if (state === "current") return "•";
  return "·";
}

export function WorkflowStepper({
  stages,
  className = "",
}: {
  stages: readonly WorkflowStepperStage[];
  className?: string;
}) {
  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`.trim()}>
      {stages.map((stage) => (
        <div
          key={stage.key}
          className={`rounded-lg border px-3 py-2 text-xs shadow-sm ${chipClass(stage.state)}`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-current px-1 text-[10px] font-semibold leading-none">
              {dotForState(stage.state)}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{stage.label}</p>
              <p className="mt-0.5 text-[11px] opacity-80">{stage.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}