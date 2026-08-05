import type { LoginInput } from "@/types/application";
import { ApiUnavailableError } from "./client";

export async function signIn(input: LoginInput): Promise<never> {
  void input;
  // Backend yalnızca mevcut Bearer token doğruluyor; parola ile giriş sözleşmesi yok.
  throw new ApiUnavailableError(
    "Parola ile giriş endpointi henüz mevcut değil.",
  );
}
