import { SellerShell } from "@/components/seller/shell/seller-shell";

/**
 * Seller panel layout. Wraps every /seller/* page in the macro shell.
 * Route protection is intentionally not implemented in this step — it
 * arrives once the Supabase auth foundation is wired to a real session
 * inspection in a later step.
 */
export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SellerShell>{children}</SellerShell>;
}
