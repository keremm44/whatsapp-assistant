import { LoadingSignal } from "@/components/shared/loading-signal";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import {
  BUSINESS_SECTION_DESCRIPTION,
  BUSINESS_SECTION_TITLE,
  GENERAL_SETTINGS_CAPTION,
  GENERAL_SETTINGS_DESCRIPTION,
  GENERAL_SETTINGS_TITLE,
  SESSION_SECTION_DESCRIPTION,
  SESSION_SECTION_TITLE,
} from "@/lib/seller/assistant-settings-format";

const staticSkeleton = "skeleton animate-none";

export default function SettingsLoading() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <div className="relative">
        <PageHeader
          caption={GENERAL_SETTINGS_CAPTION}
          title={GENERAL_SETTINGS_TITLE}
          description={GENERAL_SETTINGS_DESCRIPTION}
        />
        <LoadingSignal
          compact
          decorative
          className="absolute right-0 top-0 hidden sm:inline-flex"
        />
      </div>

      <div className="mt-8 max-w-xl space-y-8" aria-busy="true">
        <section aria-labelledby="settings-loading-business-heading">
          <div className="space-y-5 rounded-sheet border border-boundary/60 bg-raised px-4 py-5 shadow-surface md:px-6 md:py-6">
            <div className="space-y-1.5">
              <h2
                id="settings-loading-business-heading"
                className="type-section text-foreground"
              >
                {BUSINESS_SECTION_TITLE}
              </h2>
              <p className="max-w-[34rem] type-body text-muted">
                {BUSINESS_SECTION_DESCRIPTION}
              </p>
            </div>

            <div aria-hidden="true" className="max-w-[34rem] space-y-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className={`${staticSkeleton} h-3 w-28 rounded-sm`} />
                  <div className={`${staticSkeleton} h-11 w-full rounded-control sm:h-9`} />
                </div>
              ))}

              <div className="flex items-center gap-3 border-t border-divider pt-3.5">
                <div className={`${staticSkeleton} h-11 w-32 rounded-control sm:h-9`} />
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="settings-loading-feedback-heading" className="space-y-5">
          <SectionHeader
            id="settings-loading-feedback-heading"
            title="Geri Bildirim"
            description="Deneyiminizi, bir önerinizi veya karşılaştığınız bir sorunu bize iletin."
          />

          <div aria-hidden="true" className="space-y-4 rounded-md border border-border bg-surface-2 p-4 sm:p-5">
            <div className="space-y-2">
              <div className={`${staticSkeleton} h-3 w-20 rounded-sm`} />
              <div className={`${staticSkeleton} h-11 w-full rounded-control`} />
            </div>
            <div className="space-y-2">
              <div className={`${staticSkeleton} h-3 w-16 rounded-sm`} />
              <div className={`${staticSkeleton} h-11 w-full rounded-control`} />
            </div>
            <div className="space-y-2">
              <div className={`${staticSkeleton} h-3 w-16 rounded-sm`} />
              <div className={`${staticSkeleton} h-28 w-full rounded-control`} />
            </div>
            <div className={`${staticSkeleton} h-11 w-40 rounded-control sm:h-9`} />
          </div>

          <div aria-hidden="true" className="space-y-3">
            <div className="space-y-2">
              <div className={`${staticSkeleton} h-4 w-28 rounded-sm`} />
              <div className={`${staticSkeleton} h-3 w-72 max-w-full rounded-sm`} />
            </div>
            <div className="border-y border-divider">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="space-y-2 border-b border-divider px-1 py-3 last:border-b-0 sm:px-2">
                  <div className={`${staticSkeleton} h-3 w-20 rounded-sm`} />
                  <div className={`${staticSkeleton} h-4 w-52 max-w-full rounded-sm`} />
                  <div className={`${staticSkeleton} h-3 w-24 rounded-sm`} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-2.5">
          <SectionHeader
            title={SESSION_SECTION_TITLE}
            description={SESSION_SECTION_DESCRIPTION}
          />
          <div aria-hidden="true" className={`${staticSkeleton} h-11 w-28 rounded-control sm:h-9`} />
        </div>
      </div>
    </PageContainer>
  );
}
