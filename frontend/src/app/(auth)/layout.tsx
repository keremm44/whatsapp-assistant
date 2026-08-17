/**
 * Auth route group layout. A single card sits on a soft, brand-tinted
 * canvas (`auth-canvas` — a faint iris top-light, identity only). The
 * form's usable width is approximately 400-440px on desktop. On mobile
 * the card fills the available width with safe padding.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-canvas flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
      <div className="w-full max-w-[440px] rounded-xl border border-border bg-surface p-6 shadow-surface sm:p-8">
        {children}
      </div>
    </div>
  );
}
