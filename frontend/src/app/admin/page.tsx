import { AdminOverview } from "@/components/admin/dashboard/admin-overview";
import { PageContainer } from "@/components/shared/page-container";
import { resolveAdminOverviewFromSession } from "@/lib/admin/overview-server";

/** Admin landing — real operational overview composed from the existing
 * admin application, seller, feedback and announcement read endpoints. */
export default async function AdminHomePage() {
  const snapshot = await resolveAdminOverviewFromSession();

  return (
    <PageContainer size="wide" className="py-8 sm:py-10">
      <AdminOverview snapshot={snapshot} />
    </PageContainer>
  );
}
