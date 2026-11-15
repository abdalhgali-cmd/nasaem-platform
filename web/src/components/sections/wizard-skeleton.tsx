// Placeholder with the shape of the request wizard's first step (card, step
// line, a few option cards, the navigation row). Shown while the wizard's
// code or its catalog is loading, so the real content replaces something of
// about its own size instead of pushing the page down.
export function WizardSkeleton({ options = 3 }: { options?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="جارٍ تحميل قائمة الخدمات"
      data-testid="wizard-skeleton"
      className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8"
    >
      <div className="mb-2 h-5 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mb-2 flex items-center gap-2">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-1.5 flex-1 rounded-full bg-border" />)}
      </div>
      <div className="mb-6 h-4" />
      <div className="h-7 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-6 grid gap-3">
        {Array.from({ length: options }, (_, index) => (
          <div key={index} className="h-[6.5rem] animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" />
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between">
        <div className="h-12 w-28 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-12 w-28 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}
