/**
 * Seller panel entry point ("Genel Bakış"). The real dashboard work
 * queue ("Bugün ilgilenmeniz gerekenler") is built in the dashboard step.
 */
export default function SellerOverviewPage() {
  return (
    <section className="mx-auto max-w-5xl px-8 py-12">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl text-foreground">Genel Bakış</h1>
        <p className="text-sm text-muted-foreground">
          Bugün ilgilenmeniz gerekenler burada görünecek.
        </p>
      </header>
    </section>
  );
}
