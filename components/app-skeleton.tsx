export function AppSkeleton() {
  return (
    <div className="flex h-dvh w-full bg-bg" aria-busy="true" aria-label="Loading Domaxing">
      <div className="hidden w-64 shrink-0 flex-col gap-2 border-r border-line bg-sidebar p-4 md:flex">
        <div className="skeleton mb-4 h-6 w-24 rounded-md" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-7 rounded-md" style={{ width: `${70 + ((i * 13) % 25)}%` }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6 md:p-12">
        <div className="skeleton mb-6 h-9 w-40 rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton size-5 rounded-full" />
            <div className="skeleton h-4 rounded-md" style={{ width: `${40 + ((i * 17) % 40)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
