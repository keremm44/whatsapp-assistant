/**
 * Login route shell. The actual sign-in form is added in the auth step;
 * this page only confirms the route works and surfaces a calm message.
 */
export default function GirisPage() {
  return (
    <div className="space-y-3 text-center">
      <h1 className="font-heading text-2xl text-foreground">Satıcı girişi</h1>
      <p className="text-sm text-muted-foreground">
        Giriş formu yakında hazır olacak. Davet bağlantınız varsa e-postanızdaki
        bağlantıyı kullanın.
      </p>
    </div>
  );
}
