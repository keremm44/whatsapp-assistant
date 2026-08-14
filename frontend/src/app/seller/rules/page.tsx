import Link from "next/link";

import { RulesWorkspace } from "@/components/seller/rules/rules-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import {
  normalizeRuleViewParam,
  RULES_BACK_HREF,
  RULES_BACK_LABEL,
  RULES_PAGE_CAPTION,
  RULES_PAGE_DESCRIPTION,
  RULES_PAGE_TITLE,
} from "@/lib/seller/rules-format";
import { resolveRuleListFromSession } from "@/lib/seller/rules-server";

/**
 * Mesaja Göre Cevaplar — seller-defined trigger/response pairs
 * (internal Rule contract; the /seller/rules route is unchanged).
 *
 * Server Component. View is URL-owned (`?view=active|inactive|all`).
 */
export default async function SellerRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeRuleViewParam(params.view);
  const listBootstrap = await resolveRuleListFromSession(view);

  return (
    <PageContainer className="py-8 sm:py-10">
      <div className="mb-4">
        <Link
          href={RULES_BACK_HREF}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {RULES_BACK_LABEL}
        </Link>
      </div>
      <PageHeader
        caption={RULES_PAGE_CAPTION}
        title={RULES_PAGE_TITLE}
        description={RULES_PAGE_DESCRIPTION}
      />
      <div className="mt-8">
        <RulesWorkspace listBootstrap={listBootstrap} view={view} />
      </div>
    </PageContainer>
  );
}
