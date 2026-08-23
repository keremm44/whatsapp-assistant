/**
 * Toast notification system — sıfır bağımlılık, context tabanlı.
 *
 * Mimari:
 *   - `useToastStore` global singleton event emitter (React context değil,
 *     çünkü Provider'a gerek kalmadan her client component'tan
 *     çağrılabilmesi gerekiyor).
 *   - `useToast()` hook → `toast()` fonksiyonunu döndürür.
 *   - `useToastItems()` hook → `<Toaster>` bileşeninin subscribe ettiği
 *     aktif toast listesini döndürür.
 *   - `<Toaster>` → `seller-shell.tsx` içine, tek seferlik, sabit konum.
 *
 * Tonlar:
 *   success  → yeşil (success / success-muted token)
 *   error    → kırmızı (destructive token) — inline alert'in yerini almaz,
 *              form field seviyesinde hata inline kalır; global aksiyon
 *              hatası için toast kullanılır
 *   info     → mavi (info token)
 *   warning  → sarı (warning token)
 *
 * Süre: success/info 4 sn, warning 5 sn, error 7 sn (kapatılabilir).
 * Sıra: max 4 toast aynı anda görünür; yenisi eklendikçe en eskisi çıkar.
 */

export type ToastTone = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  message: string;
  /** Unix ms — oluşturulma zamanı, auto-dismiss için kullanılır. */
  createdAt: number;
  durationMs: number;
};

export type ToastOptions = {
  tone?: ToastTone;
  /** ms — varsayılan tone'a göre belirlenir. */
  durationMs?: number;
};

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 7000,
};

const MAX_VISIBLE = 4;

type Listener = (items: ToastItem[]) => void;

/** Modül seviyesinde singleton — Provider gerektirmez. */
let _items: ToastItem[] = [];
const _listeners = new Set<Listener>();

function _notify() {
  const snapshot = [..._items];
  _listeners.forEach((fn) => fn(snapshot));
}

let _idCounter = 0;
function _nextId(): string {
  _idCounter += 1;
  return `toast-${_idCounter}`;
}

export function addToast(message: string, options: ToastOptions = {}): string {
  const tone: ToastTone = options.tone ?? "info";
  const durationMs = options.durationMs ?? DEFAULT_DURATIONS[tone];
  const id = _nextId();

  const item: ToastItem = {
    id,
    tone,
    message,
    createdAt: Date.now(),
    durationMs,
  };

  // Max sınırını aşarsa en eskisini çıkar
  const next = [..._items, item];
  _items = next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
  _notify();
  return id;
}

export function removeToast(id: string): void {
  _items = _items.filter((t) => t.id !== id);
  _notify();
}

export function subscribeToasts(listener: Listener): () => void {
  _listeners.add(listener);
  listener([..._items]);
  return () => {
    _listeners.delete(listener);
  };
}
