import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="font-heading text-2xl text-foreground">
        Aradığınız sayfa bulunamadı
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Bağlantı eski olabilir ya da sayfa kaldırılmış olabilir.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Ana sayfaya dön
      </Link>
    </div>
  );
}
