# v2 Güncelleme Planı — Konuşan Portreler ve Eşya Kütüphanesi

**Hedef:** (A) Satıcı ve alıcı portreleri, yüklenen tek bir resimden uygulamanın kendi ürettiği **5 ağız karesiyle** konuşsun. (B) Satıcı eşyayı elle yazmak yerine, görselli bir **eşya kütüphanesinden** seçsin.

---

## 0. Önce bilmeniz gerekenler (hukuk, planı belirleyen kısım)

| Kaynak | Ne olduğu | Sonuç |
|---|---|---|
| **The Crooked Moon** | Legends of Avantris'in ücretli Kickstarter kitabı (600+ sayfa, 26 mirasçı büyülü eşya). D&D Beyond, Roll20, Foundry'de satılıyor. [Foundry](https://foundryvtt.com/packages/the-crooked-moon-2014), [D&D Beyond](https://www.dndbeyond.com/tag/the-crooked-moon) | Ticari ve telifli. Eşya metni ve görselleri **izinsiz kopyalanamaz**. Sadece ~26 eşya olduğu için "hepsini çekmek" yerine yayıncıdan izin istemek ya da elle eklemek daha ucuz. |
| **5e.tools** | Resmî D&D içeriğini ve görsellerini barındıran hayran sitesi. Wizards of the Coast, 2024'te 5etools deposuna DMCA talebi gönderdi. [Haber](https://tildes.net/~games.tabletop/1i39/5etools_repository_taken_down_after_dmca_request_by_wizards_of_the_coast) | Görsellerin çoğu WotC ya da üçüncü taraf sanatçıların telifli işi. Toplu çekip **herkese açık depoya ya da APK'ya koymak takedown riski** taşır. |

**Bu yüzden plan şöyle kuruldu:**
1. Depo **görsel içermez**, sadece içe aktarma aracı ve kütüphane altyapısı içerir. Depo herkese açık olduğu için görseller commit'lenmez (`.gitignore`).
2. Uygulama **kutudan çıkınca çalışır**: açık lisanslı varsayılan set ve tür ikonları gelir.
3. 5e.tools ve Crooked Moon görselleri, **DM'in kendi elindeki dosyalardan** (kendi sahip olduğu dosya klasörü ya da zip) **yerel bir araçla** içe aktarılır. Görseller sadece DM'in özel sunucusunda durur, dağıtılmaz. Otomatik site kazıma (scraping) aracı yazmıyorum, sebebi yukarıda.
4. Crooked Moon için yayıncıdan yazılı izin istenir. İzin gelirse resmî varlıklar eklenir.

Bu, kendi masanızda kullanmanız için hukuki riski en aza indirir. Yine de hukuki tavsiye değildir, yayın niyetiniz varsa bir uzmana danışın.

---

## 1. Kararlar (Aşama 0'da kilitlenir)

| # | Karar | Öneri |
|---|---|---|
| K1 | Görsel kaynak politikası | Varsayılan: açık lisanslı set. Ek: DM'in yerel içe aktarması. Kazıma yok. |
| K2 | Varsayılan açık set | [game-icons.net](https://game-icons.net) (CC BY 3.0, atıf gerekir) ve tür ikonları. Veri için Open5e / SRD 5.1 (CC-BY 4.0). Lisansları uygulamada "Hakkında" ekranına yazılır. |
| K3 | Ağız karesi yöntemi | Tarayıcıda canvas ile "çene açma" (bkz. A). Üretken yapay zekâ yok. |
| K4 | Depolama | **Kalıcı disk şart.** Render ücretsiz planda disk yok, yüklenen görseller uyanınca kaybolur. Öneri: Render Starter + `/data` diski, ya da Cloudflare R2 (S3 uyumlu). |
| K5 | Görsel biçimi | Eşya: **PNG**, 256×256, saydam. Portre: PNG sprite sayfası (5 kare yan yana, kare başı 512×512). |

---

## 2. Özellik A — Konuşan portre (5 kare)

### 5 kare (görünüm, viseme)
| # | Kare | Ne zaman |
|---|---|---|
| 0 | Kapalı | Sessizlik, m / b / p |
| 1 | Hafif aralık | e, i, s, t, d, n, k … |
| 2 | Orta | ç, ş, j, y, g, ğ … |
| 3 | Geniş | a |
| 4 | Yuvarlak | o, ö, u, ü |

### Üretim yöntemi (K3): "çene açma"
Tek resimden, cihaz içinde, sunucuda GPU olmadan:
1. **Ağzı bul.** Yüz işaretleri için tarayıcıda MediaPipe Face Landmarker (WASM) denenir. Bulunamazsa (ork, hayvan, çizgi film, maske) **yedek: DM resimde ağız merkezini ve genişliğini 2 dokunuşla işaretler.** Bu yedek her karakterde çalışır ve asıl yol olarak da kullanılabilir.
2. **Çeneyi ayır.** Ağız çizgisinin altındaki bölge yumuşak kenarlı bir ağ (mesh) olarak kaldırılır, kare başına farklı mesafede aşağı kaydırılır.
3. **Ağız içini çiz.** Açılan boşluğa koyu gradyan, üstte diş şeridi, altta dil çizilir. Renkler resimden örneklenir. Yuvarlak karede (4) ağız yatayda daralır.
4. **5 kareyi tek PNG sprite sayfasına** yaz ve sunucuya yükle.
5. **Önizleme:** DM 5 kareyi görür, ağız yerini kaydırıcıyla ince ayar yapar, kabul eder.

### Oynatma (çalışma anı)
- Satıcı repliği baloncukta yazılırken karakter karakter kareler değişir: harf → yukarıdaki tabloya göre kare, ~12 kare/sn, replik bitince kapalı kareye döner. **Ses gerekmez.** İleride TTS eklenirse aynı tablo ses zamanlamasına bağlanır.
- Sinirlenmiş ruh hâlinde (😡) hafif titreme, isteğe bağlı göz kırpma.
- Alıcı (oyuncu): oyuncu da resim yükleyebilir. Portre DM'in canlı ekranında, oyuncu teklif notu yazdığında konuşur. 6 karakter kartı için de varsayılan portre gelir.

### Bitiş ölçütleri
- İnsan yüzlü bir örnek portre otomatik bulunur ve 5 kare üretilir. Ork, hayvan ve çizgi film örnekleri yedek yolla üretilir.
- 5 kare telefonda 512 px'te göze çirkin görünmez (kenar dikişi, boşluk yok). Üretim < 3 sn.
- Replik oynatırken sayfa akıcı kalır (düşük kare kaybı).
- Yüklenen resim: en çok 5 MB, PNG/JPEG/WebP, sunucuda yeniden kodlanır (EXIF ve gömülü veri silinir).

---

## 3. Özellik B — Eşya kütüphanesi

### Veri modeli
`{ id, name, aliases[], type, rarity, valueGp, magical, source, license, image: "media/items/<id>.png" | null }`

- `magical`, `rarity` ≠ none ise doğru.
- Fiyat kaynakta yoksa DMG rarite aralığının ortası (common 100, uncommon 400, rare 4.000 …) önerilir, DM değiştirir.
- Kaynak ve lisans **her kayıtta tutulur**, böylece hangi görselin nereden geldiği bellidir ve gerekirse toplu silinir.

### Kaynaklar (bağdaştırıcılar)
| Bağdaştırıcı | Veri | Görsel |
|---|---|---|
| `open` (varsayılan, depoda) | Open5e / SRD eşyaları | game-icons.net ikonları + tür ikonları |
| `local-5etools` | DM'in yerel 5e.tools veri klasörü (JSON) | DM'in kendi görsel klasörü |
| `local-folder` | Adı serbest bir klasör/zip (`Uzun Kılıç.png`) | Aynı dosyalar |
| `manual-crookedmoon` | Yayıncı izniyle ya da DM'in sahip olduğu kitaptan **elle** girilen ~26 eşya | DM yükler |

Hiçbiri internetten toplu indirmez. Araç, DM'in verdiği dosyaları okur.

### İçe aktarma hattı (`tools/import-items`, DM'in makinesinde çalışır)
1. Girdiyi oku (JSON, klasör ya da zip).
2. Görseli **256×256 PNG**'ye çevir (`sharp`), saydam arka planı koru, taşan görseli sığdır, boyut ve renk derinliği normalize et.
3. Adı **slug'a** çevir (Türkçe karakterler dahil), ad çakışmalarını çöz.
4. Veri ile görseli **ada göre eşleştir**: tam ad, sonra takma ad, sonra bulanık eşleşme. Belirsiz eşleşmeler DM'e onaya sunulur.
5. Görseli olmayan eşya **tür ikonuna** düşer (silah, zırh, iksir, yüzük, asa, parşömen …). Boş kutu asla görünmez.
6. **Kapsam raporu:** kaç eşya, kaçının görseli var, hangileri eşleşmedi.
7. Çıktıyı sunucunun `/data/media/items` klasörüne ve kütüphane JSON'una yaz. Tekrar çalıştırmak aynı sonucu verir (idempotent).

### Satıcı seçicisi (DM arayüzü)
- **Pazar → + Eşya** artık aranabilir bir **kütüphane ızgarası** açar (küçük görsel + ad + fiyat).
- Süzgeçler: tür, nadirlik, büyülü, kaynak. Arama ada ve takma ada bakar.
- Seçince ad, fiyat, büyülü bayrağı ve görsel **otomatik dolar**. DM fiyatı değiştirebilir.
- **Dükkân şablonu:** "Demirci, Simyacı, Gezgin Tüccar" gibi ön ayarlar, kurala göre rastgele N eşya doldurur (rarite tablosu). DM dilediğini çıkarır.
- Görsel; satıcı listesinde, pazarlık ekranında (büyük), çantada ve tekliflerde görünür.

### Bitiş ölçütleri
- Kütüphane 1.000+ eşyayı 200 ms'de arar ve listeler (telefonda). Görseller tembel yüklenir.
- Kapsam raporu üretilir, eşleşmeyen eşyalar listelenir.
- Depoda hiçbir telifli görsel yok (`git ls-files` denetimi testte).
- Her kayıtta kaynak ve lisans dolu.

---

## 4. Aşamalar

| Sürüm | Aşama | İş | Boyut |
|---|---|---|---|
| — | **V0** Karar kilidi | K1–K5 onayı. Avantris'e izin e-postası. Render Starter + disk ya da R2. | S |
| v1.1 | **V1** Medya katmanı | `/api/media` yükleme (boyut, tür, yeniden kodlama), kalıcı disk, `/media` sunumu, önbellek başlıkları, DM'e "medya" yetkisi, testler | M |
| v1.1 | **V2** Portre + ağız kareleri | Yükleme, ağız işaretleme (yedek yol), çene açma üreticisi, önizleme ve ince ayar, sprite kaydı | L |
| v1.1 | **V3** Konuşma animasyonu | Baloncuk metni → kare eşlemesi, satıcı ve alıcı portreleri, ruh hâli efektleri, oyuncu avatarı | M |
| v1.1 | **V4** Yüz bulma | MediaPipe ile otomatik ağız bulma, başarısızsa yedek yola düş | M |
| v1.2 | **V5** Kütüphane çekirdeği | Veri modeli, `open` kaynağı (Open5e + game-icons), tür ikonları, `Hakkında` ve lisans ekranı | M |
| v1.2 | **V6** İçe aktarma aracı | `local-5etools`, `local-folder`, PNG hattı, eşleştirme, kapsam raporu, `.gitignore` ve depo denetimi | L |
| v1.2 | **V7** DM seçicisi ve şablonlar | Izgara arama, süzgeç, otomatik doldurma, dükkân şablonları, görsellerin oyuncu ekranlarında gösterimi | L |
| v2.0 | **V8** Elle Crooked Moon | ~26 eşya için elle giriş formu (izin varsa), yayıncı kredi satırı | S |
| v2.0 | **V9** APK ve sürüm | `versionCode 2`, görsel önbelleği, ilk açılış boyut bütçesi, cihazda test | M |

**Sıra gerekçesi:** V1 iki özelliğin de ortak temeli. Portre (V2–V4) ve kütüphane (V5–V7) birbirinden bağımsız, ayrı ilerleyebilir. Kütüphane, telif sorusu yüzünden `open` set ile başlar, DM'in kendi içe aktarması sonra gelir.

### Genel testler
- Birim: viseme eşlemesi, slug ve eşleştirme, rarite fiyat tablosu, medya doğrulaması.
- API: yükleme sınırları, yetki (oyuncu başkasının portresini değiştiremez), yeniden kodlama.
- Tarayıcı (Playwright): portre yükle → kareler üretildi → replikte kare değişti. Kütüphaneden eşya seç → pazarda görsel göründü.
- Boyut bütçesi: sayfa ilk yükleme < 500 KB (görseller hariç). Portre sprite < 400 KB.

---

## 5. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Telifli görselin yayına karışması | Takedown, depo kaybı | Depoda görsel yok, denetim testi, kaynak+lisans kaydı |
| Çene açma bazı resimlerde kötü görünür (saç, sakal, maske, profil) | Kötü kare | Elle işaretleme ve önizleme, "bu portre için animasyonu kapat" seçeneği |
| Render'da disk yok → görseller kaybolur | Bozuk görsel bağlantıları | K4 kararı, medya yoksa emoji/ikona düşme |
| Görsel sayısı büyür, telefon yavaşlar | Takılma | 256 px PNG, tembel yükleme, önbellek |
| Ad eşleşmesi tutmaz (Türkçe/İngilizce) | Görselsiz eşya | Takma ad tablosu, onay ekranı, tür ikonu yedeği |

---

## 6. Açık sorular (DM)
1. Kütüphane kaynağı olarak varsayılan açık set (game-icons.net atıflı) yeterli mi, yoksa kendi görsel klasörünüz var mı?
2. Depolama: Render Starter + disk mi, R2 mi?
3. Portrelerin çizim tarzı nedir (gerçekçi, çizgi film, piksel)? Yöntem buna göre ayarlanır.
4. Avantris'e izin için e-postayı siz mi göndereceksiniz? İsterseniz taslağı hazırlarım.
