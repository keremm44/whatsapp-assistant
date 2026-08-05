import { BrandMark } from "@/components/brand/brand-mark";
import { Container } from "@/components/ui/container";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen">
      <Container className="flex min-h-screen flex-col py-6">
        <div>
          <BrandMark />
        </div>
        <div className="grid flex-1 place-items-center py-10">{children}</div>
      </Container>
    </main>
  );
}
