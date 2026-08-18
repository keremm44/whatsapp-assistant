import Link from "next/link";

import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";
import {
  PRODUCTS_BACK_HREF,
  PRODUCTS_BACK_LABEL,
  PRODUCTS_PAGE_CAPTION,
  PRODUCTS_PAGE_DESCRIPTION,
  PRODUCTS_PAGE_TITLE,
} from "@/lib/seller/products-format";

const staticSkeleton = "skeleton animate-none";

export default function ProductsLoading() {
  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <div className="mb-4">
        <Link
          href={PRODUCTS_BACK_HREF}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {PRODUCTS_BACK_LABEL}
        </Link>
      </div>

      <div className="relative">
        <PageHeader
          caption={PRODUCTS_PAGE_CAPTION}
          title={PRODUCTS_PAGE_TITLE}
          description={PRODUCTS_PAGE_DESCRIPTION}
        />
        <LoadingSignal
          compact
          decorative
          className="absolute right-0 top-0 hidden sm:inline-flex"
        />
      </div>

      <div className="mt-8" aria-busy="true">
        <Surface className="overflow-hidden">
          <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="min-w-0 lg:border-r lg:border-divider">
              <div className="space-y-3 px-4 py-5 md:px-5" aria-hidden="true">
                <div className={`${staticSkeleton} h-9 w-full rounded-control`} />
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="space-y-2 border-t border-divider pt-4 first:border-t-0 first:pt-1"
                  >
                    <div className={`${staticSkeleton} h-4 w-2/5 rounded-sm`} />
                    <div className={`${staticSkeleton} h-3 w-3/4 rounded-sm`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden min-w-0 lg:block" aria-hidden="true">
              <div className="space-y-5 px-5 py-6">
                <div className="space-y-2">
                  <div className={`${staticSkeleton} h-5 w-1/3 rounded-sm`} />
                  <div className={`${staticSkeleton} h-3 w-2/3 rounded-sm`} />
                </div>
                <div className="space-y-4 border-t border-divider pt-5">
                  <div className={`${staticSkeleton} h-10 w-full rounded-control`} />
                  <div className={`${staticSkeleton} h-10 w-full rounded-control`} />
                  <div className={`${staticSkeleton} h-20 w-full rounded-control`} />
                </div>
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </PageContainer>
  );
}
