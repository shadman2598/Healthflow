"use client";

import Link from "next/link";
import { cn } from "../../lib/utils";

type DashboardCardProps = {
  title: string;
  description?: string;
  href?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function DashboardCard({ title, description, href, action, children, className }: DashboardCardProps) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        ) : null}
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
