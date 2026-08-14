import { Skeleton } from "@/components/ui/skeleton";

interface ListSkeletonProps {
  rows?: number;
  className?: string;
}

export function ListSkeleton({ rows = 5, className = "" }: ListSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`} data-testid="list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="metric-card flex items-center gap-4 p-3">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 6, className = "" }: { cards?: number; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`} data-testid="card-grid-skeleton">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="metric-card p-4 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2 mb-6" data-testid="page-header-skeleton">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}
