export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-16">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-10 w-2/3 max-w-xl animate-pulse rounded bg-muted" />
      <div className="h-16 w-full max-w-2xl animate-pulse rounded bg-muted" />
      <span className="sr-only">Loading</span>
    </main>
  );
}
