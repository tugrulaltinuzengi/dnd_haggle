# v2 Güncelleme Planı — Konuşan Portreler ve Eşya Kütüphanesi (yerel)

**Hedef:** (A) Satıcı ve alıcı portreleri, yüklenen tek bir gerçekçi fantazi resminden uygulamanın kendi ürettiği **5 ağız karesiyle** konuşsun. (B) Satıcı eşyayı elle yazmak yerine görselli bir **eşya kütüphanesinden** seçsin.

**Çerçeve (kesinleşti):**
- **Yerel çalışır.** Sunucu DM'in bilgisayarında koşar, oyuncular aynı ağdan (Wi-Fi) bağlanır. Render ve bulut bu sürümün konusu değil.
- **Satılmaz, ticari değil.** Kendi masamız için.
- **The Crooked Moon lisanslı** (satın alınmış). Eşyaları ve görselleri DM'in sahip olduğu kopyadan alınır.
- **Görsel stil:** portreler ve eşyalar **gerçekçi fantazi**.

---

## 0. İçerik ve lisans çerçevesi

| Kaynak | Durum | Nasıl kullanılır |
|---|---|---|
| **The Crooked Moon** | Lisanslı, DM'in sahibi. (26 mirasçı büyülü eşya, [Foundry](https://foundryvtt.com/packages/the-crooked-moon-2014), [D&D Beyond](https://www.dndbeyond.com/tag/the-crooked-moon), Roll20.) | DM'in kendi kopyasından içe aktarılır. Foundry'de kurulu paketin klasörü okunur ya da eşyalar elle girilir (paket yapısı **uygulamada doğrulanacak**). Yayıncıya ek izin gerekmez, ama içerik yine de dağıtılmaz. |
| **5e.tools** | Resmî D&D içeriği, sitenin veri ve görselleri telifli. WotC 2024'te 5etools deposuna DMCA talebi gönderdi ([haber](https://tildes.net/~games.tabletop/1i39/5etools_repository_taken_down_after_dmca_request_by_wizards_of_the_coast)). | Ticari olmayan yerel kullanım riski düşürür, telifi ortadan kaldırmaz. Araç siteyi **taramaz**, DM'in kendi yerel kopyasındaki veri ve görselleri okur. |
| **Açık set** | game-icons.net (CC BY 3.0), Open5e / SRD (CC-BY 4.0). | Kutudan çıkınca çalışan varsayılan. Atıf "Hakkında" ekranında. |

**Depo kuralı:** Depo herkese açık. **Görseller, Crooked Moon metni ve 5e.tools verisi depoya girmez.** Hepsi `app/media/` ve `app/data/` altında, `.gitignore`'da. (Depoyu özel yaparsanız bile kural kalır: yerel dosyalar depoda değil, yedeğinizde durur.)
Bu hukuki tavsiye değildir.

---

## 1. Kararlar

| # | Karar | Durum |
|---|---|---|
| K1 | Çalışma modeli | ✅ Yerel sunucu, LAN. Uzaktaki oyuncular için isteğe bağlı tünel (Tailscale ya da Cloudflare Tunnel), sonraki aşama. |
| K2 | Depolama | ✅ Yerel disk: `app/media/` (görseller), `app/data/` (durum). Bulut ve Render diski **gerekmez**. Yedek betiği eklenir. |
| K3 | Portre stili | ✅ Gerçekçi fantazi (insan, elf, cüce, ork, tiefling…). Bu, ağız yöntemini belirliyor (bkz. A). |
| K4 | Eşya stili | ✅ Gerçekçi fantazi. Kaynaklar arası stil farkı için çerçeve ve kadraj normalizasyonu (bkz. B). |
| K5 | Görsel biçimi | Eşya: **PNG** (saydam), 512×512 + 128×128 küçük resim. Portre: PNG sprite sayfası, kare başı 768×768, 5 kare yan yana. |
| K6 | APK | ✅ LAN'daki `http://` adrese bağlanmak için **cleartext izni** açılır (yalnızca yerel ağ kullanımında kabul edilebilir). |
| K7 | Kaynak dosyaların yeri | ⬜ DM belirler: Crooked Moon Foundry paketi mi, elle giriş mi? 5e.tools yerel kopyası nerede? |

---

## 2. Yerel çalıştırma (v1.1'in ön koşulu)

Bulut gidince şunlar önem kazanıyor:
- **Adres bulma:** Sunucu açılışta LAN adreslerini yazar (`http://192.168.x.x:3000`). DM ekranı adresi **QR koduyla** gösterir, oyuncu kameradan okutup açar. IP değişirse APK'nın "⚙️ Sunucu adresi" düğmesi zaten var.
- **PWA sınırı:** Tarayıcıdan "Ana ekrana ekle" ve service worker, `http://` LAN adreslerinde çalışmaz (güvenli bağlam ister). Bu yüzden **oyuncular için asıl yol APK**. Tarayıcıda sayfa yine açılır.
- **Güvenlik duvarı:** 3000 portu yerel ağa açılır (Windows/macOS uyarısı için kısa rehber).
- **DM_PIN:** Yerelde de zorunlu kalsın (aynı Wi-Fi'deki herkes DM olamasın).
- **Yedek:** `npm run backup` → `app/data/` ve `app/media/` tarihli zip.
- **Başlatma:** `npm start` yeterli, ayrıca çift tıkla başlatan betik (`start.bat`, `start.sh`).

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

## 5. Aşamalar

| Sürüm | Aşama | İş | Boyut |
|---|---|---|---|
| — | **V0** Karar kilidi | K7: kaynak dosyalar nerede? Portre kaynakları hazır mı? | S |
| v1.1 | **V1** Yerel çalıştırma | LAN adresleri, QR, güvenlik duvarı rehberi, yedek betiği, başlatma betikleri, APK cleartext izni | M |
| v1.1 | **V2** Medya katmanı | `/api/media` yükleme (boyut, tür, yeniden kodlama), yerel disk, `/media` sunumu, önbellek, testler | M |
| v1.1 | **V3** Portre + ağız kareleri | Yükleme, yüz işareti + ağ deformasyonu, ağız içi dokuları, yedek 2 dokunuş yolu, önizleme ve ince ayar, sprite kaydı | L |
| v1.1 | **V4** Konuşma animasyonu | Baloncuk metni → kare eşlemesi, satıcı ve alıcı portreleri, ruh hâli efektleri, oyuncu avatarı | M |
| v1.2 | **V5** Kütüphane çekirdeği | Veri modeli, `open` kaynağı, tür ikonları, rarite çerçeveleri, "Hakkında" ve lisans ekranı | M |
| v1.2 | **V6** İçe aktarma aracı | `local-5etools`, `local-folder`, `foundry-package`, PNG hattı, eşleştirme, kapsam raporu, depo denetimi | L |
| v1.2 | **V7** DM seçicisi ve şablonlar | Izgara arama, süzgeç, otomatik doldurma, dükkân şablonları, görsellerin oyuncu ekranlarında gösterimi | L |
| v2.0 | **V8** Crooked Moon | 26 eşyanın içe aktarımı ya da elle girişi, ekran doğrulaması | S |
| v2.0 | **V9** APK ve sürüm | `versionCode 2`, görsel önbelleği, cihazda test, uzaktaki oyuncular için isteğe bağlı tünel rehberi | M |

**Sıra:** V1 ve V2 iki özelliğin ortak temeli. Portre (V3–V4) ve kütüphane (V5–V7) birbirinden bağımsız, ayrı ilerleyebilir. Kütüphane açık setle başlar, DM'in yerel kopyaları V6'da bağlanır.

### Genel testler
- Birim: viseme eşlemesi, slug ve eşleştirme, rarite fiyat tablosu, medya doğrulaması.
- API: yükleme sınırları, yetki (oyuncu başkasının portresini değiştiremez), yeniden kodlama.
- Tarayıcı (Playwright): portre yükle → kareler üretildi → replikte kare değişti. Kütüphaneden eşya seç → pazarda görsel göründü.
- Bütçe: sayfa ilk yükleme < 500 KB (görseller hariç). Portre sprite < 1 MB. Eşya küçük resmi < 15 KB.

---

## 6. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Telifli dosyanın yanlışlıkla depoya girmesi | Takedown | `.gitignore`, `git ls-files` denetim testi, kaynak+lisans kaydı |
| Ağ deformasyonu bazı resimlerde kötü görünür (saç, sakal, profil, maske, tusk) | Kötü kare | İnce ayar, 2 dokunuş yolu, "animasyonu kapat" |
| `http://` LAN'da PWA çalışmaz | Kurulumsuz deneyim | Oyuncular için APK, tarayıcıda düz sayfa |
| IP adresi değişir | Bağlanamama | QR, APK'da sunucu adresi düğmesi, isteğe bağlı sabit IP/mDNS |
| DM'in bilgisayarı kapalıyken pazar yok | Oturum dışı erişim yok | Beklenen davranış (yerel), gerekirse tünel |
| Foundry paket yapısı beklenenden farklı | İçe aktarma çalışmaz | `local-folder` ve `manual` yedekleri, V0'da doğrulama |
| Kaynaklar arası stil farkı | Tutarsız görünüm | Kadraj normalizasyonu, rarite çerçevesi, gölge |

---

## 7. Açık sorular (DM)
1. **Crooked Moon nereden?** Foundry'de kurulu paketiniz var mı, yoksa PDF/D&D Beyond mi? (PDF ise 26 eşya için elle giriş en kısa yol.)
2. **5e.tools kopyası:** Yerelde bir kopyanız var mı, yoksa açık set + elle eklemeyle mi başlayalım?
3. **Portreler:** Elinizde hazır gerçekçi fantazi portreler var mı, yoksa kendiniz mi üreteceksiniz? Ağız kapalı, önden bakan çekimlere ihtiyaç var.
4. **Oyuncular nerede?** Hepsi aynı odada/Wi-Fi'de mi, yoksa uzaktan bağlanan var mı? (Uzaktakiler için tünel aşaması öne alınır.)
