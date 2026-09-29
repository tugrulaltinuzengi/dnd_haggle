# Aşamalı Plan

**Yön değişikliği:** Pazar artık bir telefon uygulaması. Oyuncu ile DM canlı, karşılıklı oynar. Sürekli açık pazar sunucusuna DM bağlanır. Arayüz Hearthstone gibi basit: 6 karakter kartı, büyük düğmeler, kısa metinler. Uygulama [app/](app/) klasöründe.

| Aşama | Ad | Durum |
|---|---|---|
| 0 | Taslak paket (kurallar, kart, ajan, olasılık testi) | ✅ |
| 1 | Tasarım kilidi (kararlar) | ✅ |
| 2 | Kararları dokümanlara uygulama | ✅ |
| 3 | Uygulama (kural motoru + canlı sunucu + telefon arayüzü) | ✅ |
| 4 | Teklifler: CRM gibi haftalık pazar | ✅ |
| 5 | Yayın: sunucuyu sürekli açık bir yere koy | ⏳ DM'den barındırıcı seçimi |
| 6 | Masa testi ve ayar (v1.0) | ⏳ |

## Verilen kararlar
Formül f = X − a·u/2 · DC 12 / 15 / 18 · Rep 4 / 3 / 2 · Y < X/4 zarsız ret Rep −1 · aynı ya da yüksek Y serbest, düşük Y Rep −1 · Rep 0: o gün o satıcıyla hiçbir alışveriş pazarlığı yok · Hard Gamble her an (büyülüde yasak). Ayrıntı: [DM_PAKETI.md](DM_PAKETI.md).

## Aşama 3 — Uygulama ✅
- [x] `engine.js`: kurallar, 12 birim testi.
- [x] `server.js`: sürekli açık pazar, SSE ile canlı, kalıcı durum, DM PIN'i, zarı sunucu atar.
- [x] Oyuncu: 6 karakter, satıcılar, teklif kaydırıcısı, 3 yaklaşım, Sez, Hard Gamble, çanta.
- [x] DM: canlı pazarlıklar, hızlı replik, fiyat sabitleme, satıcı/eşya yönetimi, altın, avantaj, yeni gün.
- [x] PWA (ana ekrana eklenir), iki telefonlu tarayıcı testi.

## Aşama 4 — Teklifler (CRM gibi haftalık pazar) ✅
- [x] Teklif hattı: Yeni → Karşı teklif → Anlaşıldı → Teslim edildi, her adımda not ve geçmiş.
- [x] Oyuncu teklif bırakır (katalog ya da özel istek), DM oyuncuya teklif gönderir.
- [x] DM panosu: filtreler, kabul / karşı teklif (kural önerisiyle) / reddet.
- [x] Haftalık Pazar: anlaşmaları toplu teslim, hafta ilerler, açık teklifler kalır.
- [x] 5 API testi + tarayıcı senaryosu.

## Aşama 5 — Yayın
- [x] Render hazırlığı: `render.yaml`, sertleştirilmiş `Dockerfile`, üretimde `DM_PIN` zorunlu.
- [x] Android WebView kabuğu ve CI ile APK derlemesi (CI başarılı, `pazar-apk` çıktısı). Gerçek cihazda henüz denenmedi.
- [ ] Render'da yayınla: Blueprint ile repoyu bağla, `DM_PIN` gir.
- [ ] Adresi oyuncularla paylaş, iki gerçek telefonla dene.
- Adımlar: [app/README.md](app/README.md)

## Aşama 6 — Masa testi ve ayar
- [ ] En az 3 oturum, her satıcı tipiyle en az 3 pazarlık ([TEST_KAYDI.md](TEST_KAYDI.md)).
- [ ] Hedefler: nötr satıcıda +5 bonusla sinirlenme %15'in altı, Hard Gamble ara sıra seçiliyor, açgözlü satıcı gerçekten zor hissettiriyor.
- [ ] DC, Rep ve fiyatlara göre ayar, sürüm etiketi `v1.0`.

## v2 (sonraki sürüm, yerel)
Konuşan portreler (5 ağız karesi, gerçekçi fantazi) ve görselli eşya kütüphanesi: [PLAN_V2.md](PLAN_V2.md). Sunucu DM'in bilgisayarında koşar (LAN), ticari değil. The Crooked Moon lisanslı. Telifli görsel, kitap metni ve 5e.tools verisi herkese açık depoya girmez, yerel klasörlerde kalır. Oyuncular aynı odada olmak zorunda değil (CRM gibi, eşzamansız): uzaktan erişim için Cloudflare Tunnel önerilir. Karanlık tema (Darkest Dungeon ağırlıklı) ilk geçişle uygulandı. Render/APK yayın adımları (Aşama 5) yerel çalışma tercih edildiği için beklemede.
