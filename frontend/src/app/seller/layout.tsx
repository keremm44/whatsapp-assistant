/**
 * Seller panel layout. In the foundation step this is just a quiet
 * surface. The fixed 240px sidebar + 64px top bar shell is wired in the
 * app-shell step.
 */
export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
