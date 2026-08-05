import type { SellerApplicationInput } from "@/types/application";
import { ApiUnavailableError } from "./client";

export async function submitSellerApplication(
  input: SellerApplicationInput,
): Promise<never> {
  void input;
  // Backend'de public başvuru sözleşmesi tanımlandığında burada gerçek yol kullanılacak.
  throw new ApiUnavailableError("Public başvuru endpointi henüz mevcut değil.");
}
