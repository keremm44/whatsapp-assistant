import Link from "next/link";

import { OrderCollectionWorkspace } from "@/components/seller/assistant-settings/order-collection-workspace";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import {
  ORDER_COLLECTION_PAGE_CAPTION,
  ORDER_COLLECTION_PAGE_DESCRIPTION,
  ORDER_COLLECTION_PAGE_TITLE,
  SETTINGS_BACK_HREF,
  SETTINGS_BACK_LABEL,
} from "@/lib/seller/assistant-settings-format";
import { resolveSellerSettingsFromSession } from "@/lib/seller/assistant-settings-server";

/**
 * Sipariş Toplama — seller-wide order collection settings.
 *
 * This page does not replace product-specific personalization fields.
 * Those stay on /seller/products.
 */
export default async function SellerOrderCollectionPage() {
  const bootstrap = await resolveSellerSettingsFromSession();

  return (
    <PageContainer className="py-8 sm:py-10">
      <div className="mb-4">
        <Link
          href={SETTINGS_BACK_HREF}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {SETTINGS_BACK_LABEL}
        </Link>
      </div>
      <PageHeader
        caption={ORDER_COLLECTION_PAGE_CAPTION}
        title={ORDER_COLLECTION_PAGE_TITLE}
        description={ORDER_COLLECTION_PAGE_DESCRIPTION}
      />
      <div className="mt-8">
        <OrderCollectionWorkspace bootstrap={bootstrap} />
      </div>
    </PageContainer>
  );
}
