/**
 * Request-scoped Supabase session resolver — server-only.
 *
 * NEDEN VAR?
 * ----------
 * Her server dosyası kendi başına `supabase.auth.getSession()` veya
 * `supabase.auth.getUser()` çağırıyordu. Tek bir /seller/* sayfası
 * açılışında bu 4-6 ayrı Supabase (GoTrue) ağ turuna dönüşüyor,
 * her biri 100-300ms. Toplamda giriş ~10sn, panel geçişi ~5sn.
 *
 * ÇÖZÜM
 * ------
 * `React.cache()` bir RSC render ağacı içinde aynı fonksiyonu
 * ilk çağrıda gerçekten çalıştırır, sonraki çağrılarda önbellekteki
 * sonucu döner. İstekler arası paylaşım YOK — React her request için
 * cache'i sıfırlar. Güvenlik garantisi korunur.
 *
 * KULLANIM
 * --------
 * Server component / server lib dosyalarında:
 *
 *   import { resolveSession } from "@/lib/supabase/session";
 *
 *   const session = await resolveSession();
 *   if (!session) { ... }          // oturum yok
 *   const token = session.accessToken;
 *
 * `resolveServerAccess` zaten bunu kullanır; başka server modülleri
 * ona ihtiyaç duymadan doğrudan `resolveSession` çağırabilir.
 */

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResolvedSession = {
  /** Supabase GoTrue user id */
  userId: string;
  email: string | null;
  /** JWT access token — bearer olarak backend'e gönderilir */
  accessToken: string;
};

/**
 * Tek Supabase ağ turu. Aynı RSC render'ında birden fazla çağrı
 * yapılsa bile Supabase'e yalnızca bir kez gidilir.
 *
 * `null` dönüşü → geçerli oturum yok (middleware zaten cookie
 * yenilemesini yapıyor; burada sadece okuyoruz).
 */
const resolveSessionUncached = async (): Promise<ResolvedSession | null> => {
  try {
    const supabase = await createSupabaseServerClient();

    // getUser() → GoTrue'ya gerçek bir doğrulama isteği atar.
    // getSession() → sadece yerel cookie'yi okur (doğrulama yok).
    // İkisini ayrı ayrı çağırmak yerine: getUser ile kullanıcıyı
    // doğrula, getSession ile token'ı al — fakat bu iki çağrı da
    // Supabase SDK içinde aynı cookie state'i paylaşır, ikinci
    // çağrı ağa gitmez. Yine de tek seferde almak için getSession
    // sonucunu kullanıyoruz: middleware zaten getUser yapmıştır.
    const [userResult, sessionResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);

    const user = userResult.data?.user;
    const accessToken = sessionResult.data?.session?.access_token;

    if (!user || !accessToken) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email ?? null,
      accessToken,
    };
  } catch {
    return null;
  }
};

/**
 * Request-scoped memoized session resolver.
 * React temizler her istek sonrası — kullanıcılar arası sızdırma yok.
 */
export const resolveSession = cache(resolveSessionUncached);
