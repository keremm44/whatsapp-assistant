/**
 * Auth route group layout. Login and invite completion are part of the same
 * product journey as the public introduction and seller workspace, so they
 * use the Instrument material ladder rather than falling back to the root
 * light palette while a seller is entering the product.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-theme auth-canvas flex min-h-screen items-center justify-center px-4 py-10 text-foreground sm:px-6 sm:py-12">
      <div className="w-full max-w-[440px] rounded-floating border border-boundary/80 bg-raised/95 p-6 shadow-2 sm:p-8">
        {children}
      </div>
    </div>
  );
}
