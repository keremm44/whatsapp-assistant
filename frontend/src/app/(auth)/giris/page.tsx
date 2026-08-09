import { LoginForm } from "./_login-form";

/**
 * Login page. The interactive form is a client component so the server
 * component can stay focused on metadata and visual structure.
 */
export default function GirisPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="block h-[20px] w-[2px] rounded-full bg-primary"
        />
        <p className="font-heading text-[15px] font-semibold text-primary">
          WhatsApp Asistan
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-medium leading-tight text-foreground">
          Hesabınıza giriş yapın
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          WhatsApp Asistan paneline devam etmek için bilgilerinizi girin.
        </p>
      </div>

      <LoginForm />
    </div>
  );
}
