/**
 * Auth route group layout. Centered card surface; intentionally quiet
 * because the auth step is high-stakes for the seller.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-1">
        {children}
      </div>
    </div>
  );
}
