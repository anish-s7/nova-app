"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  subtitle,
  backHref,
  onBack,
  trailing,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const backClass =
    "-ml-2 inline-flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5 focus-visible:outline-2";
  return (
    <header className={cn("flex min-h-14 items-center gap-1 px-4 pt-3", className)}>
      {backHref ? (
        <Link href={backHref} className={backClass} aria-label="Back">
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
      ) : onBack !== undefined ? (
        <button type="button" onClick={onBack ?? (() => router.back())} className={backClass} aria-label="Back">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1> : null}
        {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {trailing}
    </header>
  );
}
