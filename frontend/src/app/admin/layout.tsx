/**
 * Admin surface layout. The admin panel is not in the immediate roadmap
 * beyond the existing /admin/applications endpoints; this layout exists
 * so the route can be linked from documentation without 404s.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
