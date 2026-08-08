/**
 * Public marketing site layout. The foundation step provides a quiet
 * wrapper. Header/footer components will be added when the marketing
 * sections are implemented in a later step.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">{children}</main>
    </div>
  );
}
