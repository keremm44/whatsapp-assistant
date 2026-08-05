import { z } from "zod";
import { normalizePhone } from "./phone";
import { normalizeOptionalUrl } from "./url";

const phone = z.string().transform((value, context) => {
  const result = normalizePhone(value);

  if (!result.success) {
    context.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }

  return result.value;
});

const optionalUrl = z.string().transform((value, context) => {
  const result = normalizeOptionalUrl(value);

  if (!result.success) {
    context.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }

  return result.value;
});

export const applicationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Ad soyadınızı yazın.")
    .max(100, "Ad soyad çok uzun."),
  whatsappPhone: phone,
  storeName: z
    .string()
    .trim()
    .min(2, "Mağaza adınızı yazın.")
    .max(120, "Mağaza adı çok uzun."),
  storeUrl: optionalUrl,
  note: z.string().trim().max(500, "Notunuz en fazla 500 karakter olabilir."),
  contactConsent: z.boolean().pipe(
    z.literal(true, {
      error: "Mesaj gönderebilmemiz için onayınız gerekli.",
    }),
  ),
});

export type ApplicationFormValues = z.infer<typeof applicationSchema>;
export type ApplicationFormInput = z.input<typeof applicationSchema>;

export const loginSchema = z.object({
  email: z.email("Geçerli bir e-posta adresi yazın."),
  password: z.string().min(1, "Şifrenizi yazın."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
