# ChatGPT / Coding Agent Başlangıç Promptu

Aşağıdaki metin repository üzerinde yeni bir geliştirme oturumuna başlarken kullanılacak çalışma promptudur.

---

Bu repository üzerinde mevcut mimariyi koruyarak çalış.

## Zorunlu başlangıç

Kod yazmadan önce sırasıyla:

1. Kök `AGENTS.md` dosyasını oku.
2. `PROJECT_STRUCTURE.md` dosyasını oku.
3. Görev backend ile ilgiliyse `backend/AGENTS.md` dosyasını oku.
4. Görev frontend ile ilgiliyse `frontend/AGENTS.md` dosyasını oku.
5. Görevle doğrudan ilişkili mevcut kodu ve testleri incele.
6. API/schema/state/route isimlerini tahmin etme; repository içinden doğrula.

## Çalışma biçimi

Önce bana kısa olarak şunları söyle:

- İstenen davranışı nasıl anladın?
- Hangi dosyalar kaynak-of-truth?
- Hangi dosyalara dokunmayı planlıyorsun?
- En büyük regression/security riski nedir?

Sonra en küçük güvenli değişikliği uygula.

## Sınırlar

- Görevle ilgisiz refactor yapma.
- İstenmeyen dosyaları formatlama/yeniden düzenleme.
- Mevcut API contract'ını sessizce değiştirme.
- Yeni field, endpoint, table, state veya reason code uydurma.
- Auth/authorization kontrolünü client tarafına taşıma.
- Secret/service key'i frontend'e koyma.
- Eski migration dosyasını değiştirme.
- CI, deployment veya environment config'i görev gerektirmiyorsa değiştirme.
- Yeni dependency eklemeyi varsayılan çözüm yapma.
- `main` üzerinde force-push/history rewrite/merge yapma.
- Test çalıştırmadan testlerin geçtiğini söyleme.

## Test yaklaşımı

Önce değişikliğin dar testini çalıştır.

Backend değiştiyse mümkün olduğunda:

```powershell
cd backend
python -m pytest -q
```

Frontend değiştiyse:

```powershell
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
```

Gerçek Supabase integration testi yalnızca görev bunu gerektiriyorsa ve doğru environment mevcutsa çalıştır.

## Sonuç formatı

İş bitince şu dört şeyi net yaz:

1. Değişen dosyalar.
2. Davranışta ne değişti.
3. Hangi test/check komutları çalıştırıldı ve sonuçları.
4. Kalan risk veya doğrulanamayan nokta varsa ne olduğu.

Bir hata veya belirsizlik görürsen gizleme. Repository içeriğiyle doğrulanamayan şeyi gerçekmiş gibi yazma.

---

## Görev şablonu

Yeni oturumlarda yukarıdaki prompttan sonra görevi şu biçimde vermek yeterlidir:

```text
Görev:
<istenen değişiklik>

Kapsam:
<varsa özellikle değişmesini/değişmemesini istediğim alan>

Kabul kriterleri:
- <kriter 1>
- <kriter 2>
```

Kabul kriteri verilmemişse agent mevcut davranış, testler, `AGENTS.md` ve contract'lardan minimum güvenli kapsamı çıkarmalı; kapsamı gereksiz yere büyütmemelidir.
