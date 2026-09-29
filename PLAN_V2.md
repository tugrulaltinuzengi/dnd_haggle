# v2 Güncelleme Planı — Konuşan Portreler ve Eşya Kütüphanesi (yerel)

**Hedef:** (A) Satıcı ve alıcı portreleri, yüklenen tek bir gerçekçi fantazi resminden uygulamanın kendi ürettiği **5 ağız karesiyle** konuşsun. (B) Satıcı eşyayı elle yazmak yerine görselli bir **eşya kütüphanesinden** seçsin; kütüphane **5e.tools eşya adlarını** temel alsın. (C) Satıcı **kendi eşyasını üretip satabilsin ve kendi görselini kullanabilsin**. (D) Kütüphanenin görselleri, **subagent'larla çalışan bir otomasyonla** bulunsun ya da üretilsin ve PNG'ye çevrilsin. (E) **Oyuncular da tezgâh açsın**, birbirine satış yapsın. (F) İleride **ayrı D&D oyuncu uygulamasıyla entegre** çalışsın.

**Çerçeve (kesinleşti):**
- **Yerel çalışır.** Sunucu DM'in bilgisayarında koşar, oyuncular aynı ağdan (Wi-Fi) bağlanır. Render ve bulut bu sürümün konusu değil.
- **Satılmaz, ticari değil.** Kendi masamız için.
- **Eşzamansız (CRM gibi):** Oyuncuların aynı odada olması gerekmez. Teklifler DM çevrimdışıyken bırakılır, DM sonra cevaplar. **Uzaktan erişim bu yüzden öne alındı** (Bölüm 2).
- **The Crooked Moon lisanslı** (satın alınmış). Eşyaları ve görselleri DM'in sahip olduğu kopyadan alınır.
- **Görsel stil:** portreler ve eşyalar **gerçekçi fantazi**.

---

## 0. İçerik ve lisans çerçevesi

| Kaynak | Durum | Nasıl kullanılır |
|---|---|---|
| **The Crooked Moon** | Lisanslı, DM'in sahibi. (26 mirasçı büyülü eşya, [Foundry](https://foundryvtt.com/packages/the-crooked-moon-2014), [D&D Beyond](https://www.dndbeyond.com/tag/the-crooked-moon), Roll20.) | DM'in kendi kopyasından içe aktarılır. Foundry'de kurulu paketin klasörü okunur ya da eşyalar elle girilir (paket yapısı **uygulamada doğrulanacak**). Yayıncıya ek izin gerekmez, ama içerik yine de dağıtılmaz. |
| **5e.tools** | **Vazgeçilmez** kaynak (eşya adları, tür, nadirlik, fiyat). Sitenin veri ve görselleri telifli. WotC 2024'te 5etools deposuna DMCA talebi gönderdi ([haber](https://tildes.net/~games.tabletop/1i39/5etools_repository_taken_down_after_dmca_request_by_wizards_of_the_coast)). | **Adlar ve oyun verisi** DM'in yerel `items.json` kopyasından okunur (araç siteyi taramaz). Sitenin görselleri kullanılmaz, görseller Bölüm 6'daki otomasyonla bulunur/üretilir. |
| **Web görselleri** | Üçüncü taraf, telifli. Google Görseller sonuçlarını otomatik kazımak Google'ın hizmet şartlarına aykırı ve kırılgan (engel, captcha). Google'ın resmî görsel arama API'si 2025'ten beri **yeni müşterilere kapalı**, 1 Ocak 2027'de kapanıyor ([Google](https://developers.google.com/custom-search/v1/overview)). | **Google Görseller kazıyıcısı kurulmaz.** Yerine lisans bilgisi taşıyan kaynaklar (Openverse, Wikimedia Commons) ve yerel üretim kullanılır (Bölüm 6). |
| **Açık set** | game-icons.net (CC BY 3.0), Open5e / SRD (CC-BY 4.0). | Kutudan çıkınca çalışan varsayılan. Atıf "Hakkında" ekranında. |

**Depo kuralı:** Depo herkese açık. **Görseller, Crooked Moon metni ve 5e.tools verisi depoya girmez.** Hepsi `app/media/` ve `app/data/` altında, `.gitignore`'da. (Depoyu özel yaparsanız bile kural kalır: yerel dosyalar depoda değil, yedeğinizde durur.)
Bu hukuki tavsiye değildir.

---

## 1. Kararlar

| # | Karar | Durum |
|---|---|---|
| K1 | Çalışma modeli | ✅ Sunucu DM'in bilgisayarında. Oyuncular **uzaktan** bağlanır: öneri **Cloudflare Tunnel** (HTTPS adresi, oyuncuya kurulum yok) ya da Tailscale (özel ağ). Aynı odadakiler için LAN yedeği. |
| K2 | Depolama | ✅ Yerel disk: `app/media/` (görseller), `app/data/` (durum). Bulut ve Render diski **gerekmez**. Yedek betiği eklenir. |
| K3 | Portre stili | ✅ Gerçekçi fantazi (insan, elf, cüce, ork, tiefling…). Bu, ağız yöntemini belirliyor (bkz. A). |
| K4 | Eşya stili | ✅ Gerçekçi fantazi. Kaynaklar arası stil farkı için çerçeve ve kadraj normalizasyonu (bkz. B). |
| K5 | Görsel biçimi | Eşya: **PNG** (saydam), 512×512 + 128×128 küçük resim. Portre: PNG sprite sayfası, kare başı 768×768, 5 kare yan yana. |
| K6 | APK | ✅ Tünel HTTPS verdiği için APK `https://` ile çalışır (bugünkü ayar yeterli). LAN yedeği için `http://` gerekirse **cleartext izni** ayrı bir seçenek olarak eklenir. |
| K12 | Dış oyuncu uygulaması | ✅ Ayrı bir D&D oyuncu uygulaması var, **ileride entegre çalışacak**. Bu sürümde entegrasyona hazır bir API ve kimlik/eşya modeli tasarlanır (Bölüm 8). Uygulamanın ayrıntıları henüz bilinmiyor. |
| K13 | Oyuncu tezgâhları | ✅ Oyuncular çantalarındaki eşyayı satışa koyar. Kurallar Bölüm 7'de, ⬜ ücret ve büyülü eşya kararları DM'de. |
| K14 | Altın ve çantanın esas kaynağı | ⬜ Dış oyuncu uygulaması mı, Pazar mı, eşitleme mi? Dış uygulama belli olunca kilitlenir (Bölüm 8). O zamana dek her değişim tek bir defterden geçer. |
| K11 | Görsel tema | ✅ Karanlık, kirli, elle çizilmiş his: **Darkest Dungeon ağırlıklı**, Isaac'ten fiyat ve sayaç dili, mobile uyarlanmış (Bölüm 2b). İlk geçiş uygulandı. |
| K7 | Kaynak dosyaların yeri | ⬜ DM belirler: Crooked Moon Foundry paketi mi, elle giriş mi? 5e.tools yerel kopyası nerede? |
| K8 | Satıcının kendi eşyası | ✅ Satıcı eşya üretir, kendi görselini yükler. Eşyalar `owner` alanı taşır. **Oyuncular da tezgâh açar** (K13). |
| K9 | Görsel bulma yöntemi | ✅ **RTX 2060 var** (6 GB ise sınırlı, 12 GB ise rahat; Bölüm 6). Ana yol **yerel üretim** (tutarlı gerçekçi fantazi), yardımcı: Openverse/Wikimedia (sıradan eşyalar) ve DM'in kendi görselleri. |
| K10 | Otomasyon çatısı | ✅ Claude Code subagent'ları, DM'in makinesinde yerel çalışır. Sonuçlar DM onayından geçer. |

---

## 2. Yerel çalıştırma ve uzaktan erişim (v1.1'in ön koşulu)

Sunucu DM'in bilgisayarında, oyuncular başka yerlerde. Bu yüzden asıl mesele **erişim**:

| Yol | Nasıl | Artı | Eksi |
|---|---|---|---|
| **Cloudflare Tunnel** (öneri) | DM'in makinesinde `cloudflared` ile HTTPS adresi açılır | Oyuncuya kurulum yok, **HTTPS** (PWA ve APK sorunsuz), güvenlik duvarı ayarı yok | Hızlı tünelde adres her açılışta değişir. Sabit adres için alan adı ve adlandırılmış tünel gerekir |
| **Tailscale** | Herkes uygulamayı kurar, DM'in makinesine özel adresle bağlanır | Kapalı ağ, kalıcı adres | Her oyuncu kurulum yapar |
| **LAN** | Aynı Wi-Fi'de `http://192.168.x.x:3000` | Ek araç yok | Sadece aynı ağ, `http://` olduğu için PWA yok |
| **Bulut** (ileride) | Render Starter + disk | DM'in bilgisayarı kapalıyken de açık | Ücret, yerel tercihinizle çelişir |

Yapılacaklar:
- Sunucu açılışta adresleri yazar (yerel ve varsa tünel). DM ekranı adresi **QR kodu ve paylaşma düğmesiyle** gösterir.
- **`npm run tunnel`**: `cloudflared` kurulu mu kontrol eder, tüneli açar, adresi ekrana yazar ve DM ekranına iletir. Adres değişirse oyuncuya gösterilecek **davet bağlantısı** yenilenir.
- **Eşzamansızlık:** Teklifler DM çevrimdışıyken de bırakılabildiği için *DM'in makinesi açık olmalı* (sunucu). DM uygulamada değilken bile sunucu teklifleri saklar. Makine kapalıysa kimse bağlanamaz: bilinen sınır. Kalıcı çözüm küçük bir hep-açık makine (mini PC) ya da bulut.
- **Bildirimler (isteğe bağlı, V11):** DM cevap verince oyuncuya bildirim. HTTPS üzerinde Web Push, APK'da yerel bildirim. Çekirdek plana girmez, teklif akışı bildirimsiz de çalışır.
- **DM_PIN:** Tünel herkese açık bir adres olduğu için PIN **zorunlu ve güçlü** olmalı. Yanlış PIN denemesine hız sınırı eklenir.
- **Yedek:** `npm run backup` → `app/data/` ve `app/media/` tarihli zip.
- **Başlatma:** `npm start` yeterli, ayrıca çift tıkla başlatan betik (`start.bat`, `start.sh`).

---

## 2b. Görsel tema (UI), referanslı

**Referanslar:** Darkest Dungeon *Provision* ve *The Hoarder* ekranları ve The Binding of Isaac dükkânı. Yalnızca **düzen, renk ve his** alınır. Oyunların sanat varlıkları (portre, ikon, doku) **kullanılmaz**, tüm görseller kendimizin ya da yerel üretimin.

**Referanstan mobile uyarlama**
| Referans | Mobil karşılığı |
|---|---|
| Solda ışıkta oturan satıcı, altta kararan vinyet | Üstte tam genişlikte **satıcı portresi**, kenarlarda vinyet ve alta doğru kararma. Köşede satıcının künye plakası (küçük çerçeveli simge + adı) |
| Sağ üstte çerçeveli **eşya slotları**, altında altın simgeli fiyat | Aşağıda 3 sütunlu **raf**, slotlar yüksek dikdörtgen çerçeveli, altında **altın simgeli fiyat** |
| Sağ altta envanter ızgarası (8 sütun) | **Çanta:** 4 sütunlu slot ızgarası, boş slotlar koyu, kapasite sayacı (5/20), kusurlu eşyada 🩹 |
| Hoarder: üstte simge sekmeleri (tümü, silah, …) | Rafta **süzgeç simgeleri** (tümü, silah, zırh, iksir, büyülü) |
| Isaac: eşyanın altında büyük fiyat, köşede sayaçlar | Fiyat büyük ve okunaklı, üstte **altın/hafta-gün sayaçları** (HUD) |
| Kısa ipucu satırı (`[CLICK] inventory to sell back`) | Sayfa altında italik ipucu satırı ("Eşyaya dokun, pazarlığa başla.") |

**Tasarım dili:** yakın siyah zemin, kirli kahverengi paneller, çift kenarlıklı ve iç gölgeli çerçeveler, **soluk altın** (`#c9a24e`) ve **kan kırmızısı** vurgular, parşömen renkli metin. Başlıklar geniş harf aralıklı **serif büyük harf** (Cinzel/Palatino yedekli, çevrimdışı güvenli). Hafif tuval dokusu ve vinyet, düğmeler koyu kırmızı zemin + altın kenar, pazarlık sonucu kartları kritikte altın parıltı, sinirlenmede kırmızı.

**Durum:**
- ✅ İlk geçiş uygulandı: renkler, tipografi, dokular, portre penceresi, künye plakası, raf, filtreler, çanta ızgarası, simgeli alt çubuk, pazarlık ve sonuç kartları.
- ⏳ Portre ve eşya görselleri gelene kadar **emoji yer tutucu** (sepya filtreli) kullanılıyor. Görsel alanları hazır (`portrait` ve eşya küçük resmi), V3–V8 dolduracak.
- ⏳ Cila: eşya slotlarında rarite çerçevesi, konuşan portre (V4–V5), Isaac tarzı piksel sayaç yazı tipi, ses ve titreşim geri bildirimi (isteğe bağlı).

**Bitiş ölçütleri:** 360–430 px genişlikte hiçbir ekranda yatay kaydırma yok. Dokunma hedefleri ≥ 44 px. Metin kontrastı okunaklı (parşömen/koyu zemin ≥ 7:1, soluk metin ≥ 4.5:1). Tema tek bir CSS dosyasında değişkenlerle tutulur.

---

## 3. Özellik A — Konuşan portre (5 kare), gerçekçi fantazi

### 5 kare
| # | Kare | Ne zaman |
|---|---|---|
| 0 | Kapalı | Sessizlik, m / b / p |
| 1 | Hafif aralık | e, i, s, t, d, n, k … |
| 2 | Orta | ç, ş, j, y, g, ğ … |
| 3 | Geniş | a |
| 4 | Yuvarlak | o, ö, u, ü |

### Kaynak resim şartı (DM'e rehber)
Önden bakan, omuz üstü, **ağız kapalı ve nötr**, yüz net, en az 768 px, PNG/JPEG/WebP. (Yapay zekâyla üretiyorsanız komuta "ön görünüm, kapalı ağız, nötr ifade" ekleyin.) Uygulama portre üretmez, DM verir.

### Yöntem: yüz işaretlerine dayalı ağ deformasyonu
Gerçekçi yüzlerde basit "çene kaydırma" plastik durur. Bu yüzden:
1. **Yüz işaretleri:** Tarayıcıda MediaPipe Face Landmarker (WASM) dudak ve çene noktalarını bulur. İnsan, elf ve cüce yüzlerinde iyi çalışır.
2. **Ağ deformasyonu:** Dudak ve çene çevresi üçgen ağ olarak, her kare için hedef dudak açıklığına göre esnetilir (üst dudak hafif, alt dudak ve çene daha çok). Yanaklar da hafifçe hareket eder, böylece ağız "yapışık" görünmez.
3. **Ağız içi:** Açılan boşluk, resimden örneklenen renklerle koyu gradyan + **üst diş şeridi + dil** ile doldurulur. Dişler yumuşak kenarlı ve dudak gölgesi altında kalır. Diş ve dil dokuları uygulamayla gelen temiz, elle yapılmış küçük bir doku setidir (dışarıdan telifli doku yok).
4. **Ork, tiefling, hayvansı yüzler:** Yüz bulunamazsa ya da diş/çıkıntı sorun çıkarırsa **yedek yol:** DM ağız merkezini ve genişliğini 2 dokunuşla işaretler, aynı deformasyon bu noktalarla çalışır. Azı dişi (tusk) gibi öğeler çene ile birlikte hareket eden katman olarak işaretlenebilir.
5. **Önizleme ve ince ayar:** DM 5 kareyi görür, açıklık ve ağız yerini kaydırıcıyla ayarlar, kabul eder. Kötü çıkan portrede **"animasyonu kapat"** (statik portre) seçeneği vardır.
6. **İsteğe bağlı deney (yerel GPU varsa):** Açık kaynaklı bir yüz canlandırma modeliyle kare üretimi denenebilir. Lisansı ve kurulum yükü yüzünden çekirdek plana **girmez**, ayrı deney.

### Oynatma
- Satıcı repliği baloncukta yazılırken karakter karakter kare değişir (~12 kare/sn), replik bitince kapalı kareye döner. **Ses gerekmez.** İleride TTS eklenirse aynı tablo ses zamanlamasına bağlanır.
- Sinirlenmiş ruh hâlinde (😡) hafif titreme, isteğe bağlı göz kırpma.
- Alıcı (oyuncu): oyuncu portre yükleyebilir. Portre, DM'in canlı ekranında oyuncu teklif notu yazdığında konuşur. 6 karakter kartı için varsayılan gerçekçi fantazi portreleri DM sağlar.

### Bitiş ölçütleri
- İnsan, elf ve cüce örnek portrelerde ağız otomatik bulunur, 5 kare üretilir ve **dikiş, bulanıklık ya da "kayan yüz" görünmez**.
- Ork ve hayvansı örnek portrelerde yedek yolla kabul edilebilir kareler çıkar.
- Üretim < 5 sn (bilgisayar tarayıcısında). Telefonda oynatma akıcı.
- Yüklenen resim en çok 8 MB, sunucuda yeniden kodlanır (EXIF ve gömülü veri silinir).

---

## 4. Özellik B — Eşya kütüphanesi, gerçekçi fantazi

### Veri modeli
`{ id, name, aliases[], type, rarity, valueGp, magical, source, license, image, thumb }`

- Fiyat kaynakta yoksa DMG rarite aralığının ortası önerilir (common 100, uncommon 400, rare 4.000 …), DM değiştirir.
- Kaynak ve lisans **her kayıtta tutulur**. Bir kaynağı toplu kaldırmak tek komuttur.

### Kaynaklar (bağdaştırıcılar), hepsi yerel dosya okur
| Bağdaştırıcı | Veri | Görsel |
|---|---|---|
| `open` (varsayılan) | Open5e / SRD eşyaları | game-icons.net ikonları + tür ikonları |
| `local-5etools` | DM'in yerel 5e.tools veri klasörü (JSON) | Aynı kopyadaki görseller |
| `foundry-package` | Foundry'de kurulu **The Crooked Moon** paketi (paket yapısı doğrulanacak) | Paketin eşya ikon ve görselleri |
| `local-folder` | Serbest klasör/zip (`Uzun Kılıç.png`) | Aynı dosyalar |
| `manual` | Elle girilen eşya (ör. Crooked Moon'un 26 eşyası, paket okunamazsa) | DM yükler |

### İçe aktarma hattı (`tools/import-items`, DM'in makinesinde)
1. Girdiyi oku (JSON, klasör, zip ya da Foundry paketi).
2. Görseli **512×512 PNG** ve **128×128 küçük resme** çevir (`sharp`): saydam arka planı koru, içeriği **kırp, ortala, eşit boşluk bırak** (kaynaklar arası kadraj uyumu).
3. **Stil uyumu:** Rarite rengiyle ince bir çerçeve ve yumuşak gölge arayüzde uygulanır (common gri, uncommon yeşil, rare mavi, very rare mor, legendary turuncu, artifact kırmızı). Görsel dosyaya gömülmez, farklı kaynaklar aynı çerçeveyle birleşir.
4. Adı slug'a çevir (Türkçe karakterler dahil), çakışmaları çöz.
5. Veri ile görseli ada göre eşleştir: tam ad → takma ad → bulanık eşleşme. Belirsiz olanlar DM onayına sunulur.
6. Görseli olmayan eşya **tür ikonuna** düşer. Boş kutu görünmez.
7. **Kapsam raporu:** kaç eşya, kaçının görseli var, hangileri eşleşmedi.
8. Çıktıyı `app/media/items/` ve kütüphane JSON'una yaz. Tekrar çalıştırmak aynı sonucu verir.

### Satıcı seçicisi (DM arayüzü)
- **Pazar → + Eşya** aranabilir bir **kütüphane ızgarası** açar (küçük resim, ad, fiyat, rarite çerçevesi).
- Süzgeçler: tür, nadirlik, büyülü, kaynak. Arama ada ve takma ada bakar.
- Seçince ad, fiyat, büyülü bayrağı ve görsel **otomatik dolar**. DM fiyatı değiştirebilir.
- **Dükkân şablonu:** "Demirci, Simyacı, Gezgin Tüccar" gibi ön ayarlar, rarite tablosuna göre rastgele N eşya doldurur. DM dilediğini çıkarır.
- Görsel; satıcı listesinde, pazarlık ekranında (büyük), çantada ve tekliflerde görünür.

### Bitiş ölçütleri
- 1.000+ eşyalık kütüphane telefonda 200 ms'de aranır ve listelenir. Görseller tembel yüklenir.
- Kapsam raporu üretilir, eşleşmeyenler listelenir.
- **Depoda telifli görsel, Crooked Moon metni ya da 5e.tools verisi yok** (`git ls-files` denetimi testte).
- Her kayıtta kaynak ve lisans dolu.

---

## 5. Özellik C — Satıcı kendi eşyasını üretip satar

Satıcı (DM) kütüphanede olmayan ya da değiştirilmiş eşyaları kendisi oluşturur ve kendi görselini kullanır.

- **Eşya editörü** (Pazar → + Eşya → *Yeni eşya*): ad, kısa açıklama, tür, nadirlik, büyülü mü, fiyat, stok, **görsel**.
- **Kendi görselin:** telefondan kamera/galeri ya da bilgisayardan dosya. Uygulama görseli kare kırpar, isteğe bağlı arka planı siler, **512 PNG + küçük resim** yapar. Görsel yoksa tür ikonu görünür.
- **Varyant üret:** Kütüphaneden bir eşya seçip "Kopyala ve değiştir" ile (ör. *+1 Uzun Kılıç → Don Kılıcı*) yeni eşya çıkar. Kaynak `custom`, lisans "kendi" olarak kaydedilir.
- **Satışa koy:** Üretilen eşya doğrudan satıcının rafına düşer, stok ve fiyat orada ayarlanır. Aynı eşya başka satıcıya da eklenebilir.
- **Veri:** `owner` alanı `{ type: 'merchant' | 'player', id }` tutar. DM'in satıcıları için DM üretir. **Oyuncu tezgâhındaki üretimin kuralları Bölüm 7'de** (DM onayı, sınırlar).
- **Yetki:** Satıcı eşyalarını yalnızca DM düzenler. Yüklenen dosya sunucuda yeniden kodlanır.

**Bitiş ölçütleri:** Telefondan çekilen fotoğrafla eşya oluşturulur, pazarda, pazarlıkta ve çantada görünür. Varyant kaynağı ve fiyatı korunur. Görselsiz eşya tür ikonuyla görünür.

---

## 6. Özellik D — Görsel bulucu otomasyonu (subagent'lar)

**Amaç:** 5e.tools eşya adlarının her biri için uygun bir **gerçekçi fantazi** görsel bulmak ya da üretmek ve PNG'ye çevirmek. DM'in müdahalesi sadece onay ekranında.

### Ne yapılmaz
Google Görseller'i HTML olarak kazıyan araç **kurulmaz**: Google'ın şartlarına aykırı, kırılgan, sonuçlar telifli ve stil olarak tutarsız (gerçek kılıç fotoğrafı, oyun karesi, filigranlı ürün resmi karışık gelir). Google'ın resmî API'si de yeni müşteriye kapalı. Zaten motoru olan biri için isteğe bağlı `google-cse` bağdaştırıcısı yazılabilir (100 ücretsiz sorgu/gün, sonrası ücretli, 2027'de kapanıyor). Çekirdek plana girmez.

### Görsel kaynakları (bağdaştırıcı, öncelik sırasıyla)
| # | Kaynak | Ne için | Not |
|---|---|---|---|
| 1 | `local-folder` / `foundry-package` | DM'in kendi görselleri, Crooked Moon | Her zaman öncelikli |
| 2 | `generate-local` | Tüm eşyalar, **tutarlı stil** | Yerel görüntü üretici (ComfyUI ya da Automatic1111 API'si) çağrılır. Sabit komut şablonu: *"realistic fantasy <ad>, isolated object, studio lighting, no text"*, negatif komut: yazı, filigran, çerçeve, el. RTX 2060 için ayarlar aşağıda. |
| 3 | `openverse`, `wikimedia` | Sıradan eşyalar (ip, meşale, kılıç, zırh) | Lisans bilgisi döner (CC0 / CC-BY…), atıf manifeste yazılır. Fantazi/büyülü eşyalarda genelde sonuç yoktur. |
| 4 | `google-cse` (isteğe bağlı) | Sadece zaten motoru olanlar | Kullanılabilirlik 2027'de biter |

**RTX 2060 ile yerel üretim (K9):**
- **Bellek:** RTX 2060'ın iki sürümü var, 6 GB ve 12 GB. **6 GB ise** SD 1.5 tabanlı bir model rahat çalışır, SDXL sınırlı ve yavaştır (düşük bellek modu gerekir). **12 GB ise** SDXL Turbo/Lightning türevleri de makul.
- **Öneri (başlangıç):** SD 1.5 tabanlı, gerçekçi fantazi stiline yakın bir model, 512×512 üretim, ardından PNG hattında 512 px'e yerleştirme. Tutarlılık için **sabit tohum ailesi, sabit komut şablonu ve sabit bir stil ekleri** (LoRA) kullanılır.
- **Süre (kaba tahmin, ölçülecek):** SD 1.5'te eşya başı birkaç saniye. 2.000 eşya için kabaca birkaç saat, gece çalıştırılır. SDXL'de eşya başı belirgin biçimde daha uzun. **V7'nin ilk işi 20 eşyalık bir kıyas denemesidir**, hız ve kaliteye göre model seçilir.
- **Bellek dışı:** Arka plan silme (`rembg` benzeri) CPU'da da çalışır, GPU'yu meşgul etmez. Üretim ve işleme sırayla, tek GPU işçisiyle yapılır (paralellik 1), judge subagent'ı GPU kullanmaz.
- **Lisans:** Seçilen modelin ve LoRA'ların lisansı kaydedilir (ticari olmayan kullanım için genelde sorun yok, yine de model kartı okunur). Çıktı `source: generated`, `license: model:<ad>` olarak yazılır.
- **Portre üretimi:** Aynı düzenek ağız kapalı, önden bakan portreleri de üretebilir (DM'in isteğine bağlı). Yüz tutarlılığı için ayrıca bir deney yapılır. Çekirdek plana girmez.

**Beklenti (dürüst):** Web kaynaklarının fantazi eşyalardaki isabeti düşüktür. Tutarlı gerçekçi fantazi görünüm için **yerel üretim ana yol**, web kaynakları sıradan eşyalar için destek olur.

### Hat ve subagent'lar
Komut: `/item-images run` (Claude Code, DM'in makinesi). Ana ajan sırayı yönetir, işçi subagent'ları paralel çalıştırır.

1. **İsim kuyruğu (CLI `names`)**: DM'in yerel 5e.tools `items.json` / `items-base.json` dosyalarından eşya adı, tür, nadirlik, fiyat, kaynak okunur (alan adları **uygulamada doğrulanacak**). Açık set (Open5e/SRD) tabandır. Sonuç `queue.json` dosyasına yazılır, **kaldığı yerden devam eder**.
2. **`item-image-finder` (subagent)**: 20'lik gruplarla adlar için adayları toplar. Sırayla kaynak 1 → 3'ü dener, bulunamazsa 2'ye (üretim) düşer. Adayları `staging/` klasörüne indirir/üretir (en çok 4 aday), kaynak URL'si, lisans ve sorgu manifeste yazılır. Sorgu hız sınırına uyar.
3. **`item-image-judge` (subagent, görsel değerlendirme)**: Adayları görür (Read ile resim açar). Ölçüt: doğru eşya mı, **tek nesne** mi, gerçekçi fantazi stili mi, yazı/filigran/çerçeve/arayüz yok mu, çözünürlük ≥ 512 px mi. En iyisini seçer ya da **reddeder** (ret nedeniyle). Reddedilenler üretim kuyruğuna gider (en çok 2 deneme).
4. **`item-image-processor` (subagent)**: Seçilen görseli 512 PNG ve 128 küçük resme çevirir, arka planı siler (`rembg` benzeri yerel araç ya da renk maskesi), içeriği kırpıp ortalar, doku ve ışık farkını hafif dengeler. `app/media/items/` altına yazar, `library.json`'a kayıt ekler (kaynak, lisans, sorgu, karar notu).
5. **DM onay ekranı (uygulamada, Bölüm 4)**: Seçilen görsel ve alternatifler yan yana görünür. DM **onayla / başkasını seç / kendi görselini yükle / yeniden üret** der. Onaylanmayan görsel oyunculara görünmez (tür ikonu görünür).
6. **Rapor:** kaç eşya, kaçı otomatik onaylandı / DM onayında / reddedildi, kaynak dağılımı, tahmini süre.

### Konfigürasyon ve sınırlar
- `tools/item-images/config.json`: kaynak sırası, üretici adresi, aday sayısı, paralellik (öneri 3 işçi), zaman aşımı.
- **Yerel ve özel:** Görseller `app/media/` içinde, `.gitignore`'da. Manifest kaynak URL'sini tutar, `purge --source <ad>` ile bir kaynak toplu silinir. APK görselleri paketlemez, çalışma anında DM sunucusundan alır.
- **Maliyet:** Yerel üretim ve Openverse ücretsiz. (İsteğe bağlı `google-cse` için ücret ve kota, güncel koşullar doğrulanmalı.)
- **Süre (tahmini):** 2.000 eşya için yerel üretimde GPU'ya bağlı birkaç saat, gece çalıştırılabilir.

### Bitiş ölçütleri
- 50 adlık örnek partide: her ad için bir görsel (otomatik seçim ya da üretim) veya tür ikonu vardır. Boş kutu yok.
- Judge, bilerek koyulan kötü adayları (filigranlı, çok nesneli, yazılı) reddeder.
- Kuyruk yarıda kesilip yeniden başlatılınca kaldığı yerden sürer.
- Depoda hiç görsel, veri dosyası ya da manifest yok, `git ls-files` denetimi geçer.
- Her kayıtta kaynak, lisans ve karar notu dolu.

---

## 7. Özellik E — Oyuncu tezgâhları

Oyuncular çantalarındaki eşyaları satışa koyar, başka oyuncular satın alır ya da teklif verir. Aynı teklif hattı (CRM) ve Haftalık Pazar kullanılır.

**Temel akış**
1. Oyuncu **Tezgâhım** sekmesinde tezgâhını açar (ad, kısa açıklama, portre/avatar). Çantadan eşya seçip **fiyat** koyar. Eşya listelenirken çantadan **rezerve** edilir (çift satış olmaz).
2. Tezgâh, pazarda satıcılar gibi görünür (portresiyle, "Oyuncu tezgâhı" etiketiyle). Alıcı eşyaya dokunur:
   - **Tam fiyata satın al** (Haftalık Pazar'da teslim), ya da
   - **Teklif ver**: satıcı **oyuncu** cevaplar (kabul / karşı teklif / reddet), aynı Yeni → Karşı → Anlaşıldı → Teslim hattı. DM'in satıcı eşyasında verdiği kararı burada tezgâh sahibi verir.
3. **Haftalık Pazar** (DM düğmesi) oyuncu-oyuncu anlaşmalarını da teslim eder: alıcının altını düşer, satıcıya geçer (ücret düşülmüş), eşya el değiştirir. Alıcının altını yetmezse ya da eşya artık rezervede değilse anlaşma "Teslim olmadı" olur ve rezerve serbest kalır.

**Kurallar (K13)**
| Konu | Kural | Durum |
|---|---|---|
| Zar ile pazarlık | **Yok.** Oyuncu tezgâhında sadece teklif hattı. (Satıcının tutumu ve Rep, DM satıcılarına özgü.) | ✅ Öneri |
| Pazar ücreti | Her satıştan **%5** DM'in kasasına gider (altın çıkışı). DM oranı ayarlar (0–20). | ⬜ DM |
| Büyülü eşya satışı | DM her oyuncu için açıp kapatır. Varsayılan: kapalı, DM tek tek onaylar. | ⬜ DM |
| Kusurlu eşya | **Satılamaz** (Hard Gamble'ın 0 gp kuralı). Listelenemez. | ✅ Kural |
| Oyuncunun ürettiği eşya | Karşı taraf görmeden önce **DM onayı**. Onaysız üretim yayınlanmaz. Üretim sınırı haftada N eşya (DM ayarlar). | ⬜ DM |
| Fiyat sınırları | Katalogdaki eşyada fiyat etiketin %25–%400'ü arasında (aşırı fiyatla altın aktarma engeli). DM aşabilir. | ⬜ DM |
| Kendine satış / çete | Kendi tezgâhından alamaz. Aynı iki oyuncu arasında haftalık üst sınır (DM ayarlar) ve DM'in tüm anlaşmaları görebildiği **denetim günlüğü**. | ✅ Öneri |
| DM yetkisi | DM tezgâhı kapatabilir, bir anlaşmayı **iptal edebilir**, tüm listeleri görür. DM tezgâhları tümden kapatabilir. | ✅ |

**Bitiş ölçütleri**
- İki oyuncu arasında: listele → teklif → karşı teklif → kabul → Haftalık Pazar → eşya ve altın doğru el değiştirir, ücret düşülür. Toplam altın (oyuncular + ücret) korunur (birim testi).
- Aynı eşya iki kez satılamaz (rezerve). Kusurlu eşya listelenemez. Yetkisiz kişi başkasının tezgâhını değiştiremez.
- Anlaşma sırasında satıcı eşyayı çantasından çıkarmaya çalışırsa engellenir.
- DM'in denetim günlüğünde her el değişimi görünür.

---

## 8. Özellik F — Dış D&D oyuncu uygulamasıyla entegrasyon (ileride)

Ayrı bir D&D oyuncu uygulaması var ve ileride bu pazara bağlanacak. Bu sürümde **entegrasyonun yapılmasını değil, mümkün olmasını** sağlıyoruz. Uygulamanın teknolojisi, veri modeli ve kimlik sistemi bilinmediği için ayrıntılar aşağıdaki sorulara bağlı.

**Bugünden alınacak kararlar (ucuz, sonradan pahalı):**
- **Sürümlü kamu API'si:** Yeni uç noktalar baştan `/api/v1/...` altında. OpenAPI şeması dosyası tutulur. Mevcut iç uç noktalar sonra taşınır.
- **Dış kimlik bağı:** Oyuncu kaydında `externalId` alanı (dış uygulamadaki karakter kimliği). Eşleme tek yönlü başlar: dış uygulama Pazar oyuncusunu **kimliğiyle** bulur.
- **Tek doğruluk kaynağı (karar gerekir, K14):** Altın ve çanta hangi uygulamada duruyor? Seçenekler:
  1. **Dış uygulama esas**, Pazar sadece okur/yazar (altın düş, eşya ekle) API üzerinden.
  2. **Pazar esas**, dış uygulama Pazar'dan okur.
  3. **Eşitleme:** ikisinde de var, olay tabanlı (satın alma, teslim) senkron.
  Bu sürümde **altın ve eşya değişimleri tek bir yerden (bir "defter" tablosundan)** geçer, böylece entegrasyonda tek noktadan bağlanır.
- **Olaylar (webhook):** `purchase.settled`, `offer.updated`, `stall.updated`, `gold.changed`. İmzalı, yeniden denemeli.
- **Gömülü mod:** `?embed=1` ile üst çubuksuz açılır, dış uygulama WebView/iframe ile gömebilir. `postMessage` ile oyuncu kimliği ve tema ayarı alır.
- **Kimlik doğrulama:** Dış uygulamadan gelen çağrılar için API anahtarı ya da kısa ömürlü JWT. PIN ve oyuncu jetonu değişmez.
- **Veri biçimi:** Eşya ve çanta şeması, dış uygulamanın envanter alanlarına eşlenebilir olacak şekilde ad, tür, nadirlik, değer, ağırlık, kaynak alanlarını içerir.

**Bitiş ölçütleri (bu sürümde):** OpenAPI dosyası ve `/api/v1` altında oyuncu, çanta, altın, eşya, teklif uç noktaları. Tüm altın/eşya değişimleri deftere yazılır. Webhook gönderimi bir sahte alıcıya karşı testte doğrulanır. Gerçek entegrasyon dış uygulama belli olunca ayrı bir aşamadır.

---

## 9. Aşamalar

| Sürüm | Aşama | İş | Boyut |
|---|---|---|---|
| — | **V0** Karar kilidi | K7 (kaynak dosyalar nerede), RTX 2060 belleği (6/12 GB), tünel türü, K13 tezgâh kuralları, dış uygulamanın ayrıntıları (K12/K14) | S |
| ✅ | **V0b** Tema, ilk geçiş | Karanlık tema, portre penceresi, raf, çanta ızgarası, filtreler, simgeli çubuk (Bölüm 2b) | M |
| v1.1 | **V1** Yerel çalıştırma ve uzaktan erişim | `npm run tunnel` (Cloudflare Tunnel), davet bağlantısı ve QR, PIN hız sınırı, yedek betiği, başlatma betikleri, LAN yedeği | M |
| v1.1 | **V2** Medya katmanı | `/api/media` yükleme (boyut, tür, yeniden kodlama, kare kırpma), yerel disk, `/media` sunumu, önbellek, testler | M |
| v1.1 | **V2b** Defter ve `/api/v1` | Altın/eşya değişimlerinin tek defterden geçmesi, `/api/v1` ve OpenAPI, `externalId`, webhook altyapısı (Bölüm 8) | M |
| v1.1 | **V3** Satıcı eşya üretimi | Eşya editörü, **kendi görseli** (kamera/galeri), varyant üret, `owner` alanı, tür ikonları, rarite çerçeveleri | M |
| v1.1 | **V3b** Oyuncu tezgâhı | Tezgâh, rezerve, oyuncu-oyuncu teklif hattı, Haftalık Pazar'da oyuncu teslimi, ücret, DM denetim günlüğü ve kısıtlar, onay kuyruğu, defter tablosu | L |
| v1.1 | **V4** Portre + ağız kareleri | Yükleme, yüz işareti + ağ deformasyonu, ağız içi dokuları, yedek 2 dokunuş yolu, önizleme ve ince ayar, sprite kaydı | L |
| v1.1 | **V5** Konuşma animasyonu | Baloncuk metni → kare eşlemesi, satıcı ve alıcı portreleri, ruh hâlleri, oyuncu avatarı | M |
| v1.2 | **V6** Kütüphane çekirdeği ve 5e.tools verisi | Veri modeli, `open` kaynağı, `local-5etools` **ad ve veri** aktarımı, ad eşleştirme, "Hakkında" ve lisans ekranı, depo denetimi | L |
| v1.2 | **V7** Görsel bulucu otomasyonu | İsim kuyruğu, `item-image-finder`/`-judge`/`-processor` subagent'ları, `generate-local`, Openverse/Wikimedia, arka plan silme, kaldığı yerden devam, rapor | L |
| v1.2 | **V8** DM seçici, onay ekranı, şablonlar | Kütüphane ızgarası, süzgeç, otomatik doldurma, **görsel onay kuyruğu**, dükkân şablonları | L |
| v2.0 | **V9** Crooked Moon | 26 eşyanın içe aktarımı ya da elle girişi, ekran doğrulaması | S |
| v2.0 | **V10** APK ve sürüm | `versionCode 2`, görsel önbelleği, cihazda test | M |
| v2.x | **V11** Bildirimler (isteğe bağlı) | DM ya da tezgâh sahibi cevap verince bildirim (Web Push / APK yerel bildirim) | M |
| v2.x | **V12** Dış uygulama entegrasyonu | Dış oyuncu uygulamasına bağlanma (K12, K14 kararına göre): eşleme, olay akışı, gömülü mod | L |

**Sıra:** V1–V2b tüm özelliklerin temeli (erişim, medya, **defter ve `/api/v1`**). **V3 (satıcı kendi eşyası ve görseli) ve V3b (oyuncu tezgâhı)** medya ve defter katmanından hemen sonra gelir, çünkü kütüphane ve otomasyon olmadan da işe yarar. Portre (V4–V5) ve kütüphane (V6–V8) birbirinden bağımsız ilerleyebilir. Otomasyon (V7) V6'nın ad kuyruğuna ve V2'nin medya katmanına dayanır, **ilk işi 20 eşyalık kıyas denemesidir** (RTX 2060 ile model seçimi). Dış uygulama entegrasyonu (V12) ancak K12/K14 netleşince başlar.

### Genel testler
- Birim: viseme eşlemesi, slug ve eşleştirme, rarite fiyat tablosu, medya doğrulaması.
- API: yükleme sınırları, yetki (oyuncu başkasının portresini değiştiremez), yeniden kodlama.
- Tarayıcı (Playwright): portre yükle → kareler üretildi → replikte kare değişti. Kütüphaneden eşya seç → pazarda görsel göründü.
- Bütçe: sayfa ilk yükleme < 500 KB (görseller hariç). Portre sprite < 1 MB. Eşya küçük resmi < 15 KB.

---

## 10. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Telifli dosyanın yanlışlıkla depoya girmesi | Takedown | `.gitignore`, `git ls-files` denetim testi, kaynak+lisans kaydı |
| Ağ deformasyonu bazı resimlerde kötü görünür (saç, sakal, profil, maske, tusk) | Kötü kare | İnce ayar, 2 dokunuş yolu, "animasyonu kapat" |
| `http://` LAN'da PWA çalışmaz | Kurulumsuz deneyim | Oyuncular için APK, tarayıcıda düz sayfa |
| IP adresi değişir | Bağlanamama | QR, APK'da sunucu adresi düğmesi, isteğe bağlı sabit IP/mDNS |
| DM'in bilgisayarı kapalıyken pazar yok | Oturum dışı erişim yok | Beklenen davranış (yerel), gerekirse tünel |
| Foundry paket yapısı beklenenden farklı | İçe aktarma çalışmaz | `local-folder` ve `manual` yedekleri, V0'da doğrulama |
| Tünel adresi değişir, herkese açık bir adres | Oyuncu bağlanamaz, yetkisiz DM denemesi | Davet bağlantısı yenileme, PIN hız sınırı ve güçlü PIN, gerekirse adlandırılmış tünel |
| Oyuncular arasında altın aktarımıyla sömürü (çete, sahte fiyat) | Oyun dengesi bozulur | Ücret, fiyat sınırları, haftalık çift sınırı, denetim günlüğü, DM iptali |
| Rezerve ve teslim yarışması (eşya iki kez satılır) | Kayıp eşya/altın | Rezerve, tek defter, teslimde yeniden doğrulama, işlem tekrarına dayanıklılık, birim testleri |
| Dış uygulamanın modeli bilinmiyor | Sonradan uyumsuzluk | Sürümlü API, defter, `externalId`, K14 kararını erkene almak |
| RTX 2060 6 GB ile SDXL yavaş/yetersiz | Üretim süresi uzar | SD 1.5 ile başla, 20 eşyalık kıyas denemesi, gece çalıştırma |
| DM'in bilgisayarı kapalı | Teklif bırakılamaz | Bilinen sınır. Çözüm: hep-açık mini PC ya da bulut |
| Kaynaklar arası stil farkı | Tutarsız görünüm | Kadraj normalizasyonu, rarite çerçevesi, gölge, yerel üretimi ana yol yapmak |
| Web görsellerinde düşük isabet (fantazi eşyalar) | Yanlış ya da kalitesiz görsel | Judge subagent'ı, DM onayı, üretime düşme |
| Yerel üretim için GPU yok | Otomasyon yavaş ya da imkânsız | K9: Openverse + kendi görselleri + tür ikonları ile başla, üretimi sonra ekle |
| Google Görseller'e bağımlılık | Şart ihlali, engel, kapanan API | Kurulmaz, alternatif kaynaklar (Bölüm 6) |
| Subagent hatalı görsel seçer | Yanlış eşya görseli | Judge ret nedeni, DM onay kuyruğu, onaysız görsel oyunculara görünmez |
| Kullanıcı görseli zararlı dosya olabilir | Güvenlik | Yeniden kodlama, boyut ve tür sınırı, yalnızca DM yükler |

---

## 11. Açık sorular (DM)
1. **RTX 2060 kaç GB?** 6 GB mı 12 GB mı? ComfyUI ya da Automatic1111 kurulu mu? (Model seçimi ve üretim süresi buna göre değişir.)
2. **5e.tools verisi:** Yerelde `items.json` gibi bir kopyanız var mı? Yoksa siteden kendiniz indirip bir klasöre koyabilir misiniz?
3. **Oyuncu tezgâhı kuralları:** Pazar ücreti %5 uygun mu? Büyülü eşya satışı varsayılan kapalı (DM onayıyla) mı olsun? Oyuncunun ürettiği eşya için DM onayı şart mı? Fiyat sınırı %25–%400 makul mü?
4. **Crooked Moon nereden?** Foundry'de kurulu paketiniz var mı, yoksa PDF/D&D Beyond mi? (PDF ise 26 eşya için elle giriş en kısa yol.)
5. **Portreler:** Elinizde hazır gerçekçi fantazi portreler var mı, yoksa kendiniz mi üreteceksiniz? Ağız kapalı, önden bakan çekimlere ihtiyaç var.
6. **Erişim:** Cloudflare Tunnel (oyuncuya kurulum yok, adres değişebilir) mi, Tailscale (herkes kurar, kalıcı adres) mi tercih edersiniz? DM'in bilgisayarı oyun dışında açık kalabilir mi?
7. **Dış oyuncu uygulaması:** Hangisi (ad, web/mobil, kendi geliştirdiğiniz mi)? Karakterin altını ve çantasını orada mı tutuyor? Kimlik doğrulaması nasıl (hesap, oda kodu)? API'si ya da veri dışa aktarımı var mı? (K14: altın ve çantanın esas kaynağı hangisi olsun?)
