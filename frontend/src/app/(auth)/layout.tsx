/**
 * Auth route group layout. A single near-white card sits on the warm
 * cream canvas. The form's usable width is approximately 400-440px on
 * desktop. On mobile the card fills the available width with safe
 * padding.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6 sm:py-12">
      <div className="w-full max-w-[440px] rounded-lg border border-border bg-surface p-6 shadow-surface sm:p-8">
        {children}
      </div>
    </div>
  );
}
