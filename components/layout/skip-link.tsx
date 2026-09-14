export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only rounded-lg px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:inline-flex focus-visible:ring-3 focus-visible:outline-none"
    >
      Skip to content
    </a>
  );
}
