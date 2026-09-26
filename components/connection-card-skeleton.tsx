import { Skeleton } from "./ui/skeleton";

export function ConnectionCardSkeleton({ name }: { name?: string }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <p className="pt-1 text-center text-sm text-muted-foreground" role="status">
        Reading your reasons{name ? ` and ${name}'s` : ""} side by side…
      </p>
      <div className="rounded-3xl bg-card p-5">
        <div className="flex items-center justify-center gap-6">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-px w-10" />
          <Skeleton className="size-16 rounded-full" />
        </div>
        <Skeleton className="mx-auto mt-4 h-5 w-40" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-3xl bg-card p-5">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
      <div className="space-y-3 rounded-3xl border border-dashed border-white/10 p-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
