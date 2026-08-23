/**
 * `useToast` — client component'lardan toast tetiklemek için hook.
 *
 * Kullanım:
 *   const toast = useToast();
 *   toast.success("Kaydedildi.");
 *   toast.error("İşlem tamamlanamadı.");
 *   toast.info("Bilgi mesajı.");
 *   toast.warning("Dikkat.");
 *   // Ya da doğrudan:
 *   toast("Mesaj", { tone: "success" });
 */

"use client";

import { addToast, type ToastOptions } from "./index";

export type ToastFn = {
  (message: string, options?: ToastOptions): string;
  success: (message: string, durationMs?: number) => string;
  error: (message: string, durationMs?: number) => string;
  info: (message: string, durationMs?: number) => string;
  warning: (message: string, durationMs?: number) => string;
};

function createToastFn(): ToastFn {
  const fn = (message: string, options: ToastOptions = {}) =>
    addToast(message, options);

  fn.success = (message: string, durationMs?: number) =>
    addToast(message, { tone: "success", ...(durationMs ? { durationMs } : {}) });

  fn.error = (message: string, durationMs?: number) =>
    addToast(message, { tone: "error", ...(durationMs ? { durationMs } : {}) });

  fn.info = (message: string, durationMs?: number) =>
    addToast(message, { tone: "info", ...(durationMs ? { durationMs } : {}) });

  fn.warning = (message: string, durationMs?: number) =>
    addToast(message, { tone: "warning", ...(durationMs ? { durationMs } : {}) });

  return fn;
}

/** Stable referans — her çağrıda yeni obje oluşturmaz. */
const _toastFn = createToastFn();

export function useToast(): ToastFn {
  return _toastFn;
}
