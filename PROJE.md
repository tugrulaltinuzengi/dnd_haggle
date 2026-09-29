# Pazar — D&D Pazarlık ve Ekonomi Uygulaması

**Tek doküman.** Bundan sonra kurallar, kararlar, plan, kullanım ve test notları yalnızca burada tutulur. Ayrı `.md` dosyası açılmaz.
Eski dosyalar (DM_PAKETI, REFERANS_KARTI, OYUN_TESTI, DM_AGENT, TEST_KAYDI, PLAN, PLAN_V2, app/README) bu dosyada birleştirildi, git geçmişinde durur.

**Kural:** her sürüm ve her plan değişikliği **Bölüm 12 (Sürüm günlüğü)**'ne eklenir, aynı commit'te.

İçindekiler: 1 Durum · 2 Kararlar · 3 Oyun kuralları · 4 Uygulama (kullanım, yayın, APK) · 5 Tema · 6 Ekonomi ve endeksler (isteğe bağlı) · 7 Sonraki özellikler (portre, kütüphane, üretim, otomasyon, tezgâh, erişim/Tailscale, sunucu donanımı, masaüstü düzeni) · 8 Aşamalar · 9 Riskler · 10 Açık sorular · 11 Ekler · 12 Sürüm günlüğü

---

## 1. Durum

**Şu anki sürüm: 0.11.** Ayrıntı Bölüm 12.

**Çalışan:** kural motoru, canlı sunucu (DM + oyuncular, SSE), 6 karakter, pazarlık (zar, **Pazar** barı, Hard Gamble, Sez), **Yakınlık** sistemi (ayrı uzun vadeli bar), teklifler (CRM hattı) ve Haftalık Pazar, alışveriş defteri (filtre + CSV), karanlık tema, masaüstü düzeni, Tailscale araçları, PIN hız sınırı, yedek ve başlatma betikleri, Android WebView kabuğu ve **medya katmanı** (eşya görseli, satıcı portresi). 40 birim/API/araç testi ve 5 senaryolu tarayıcı testi geçiyor. Kod: [app/](app/), [android/](android/).

**Bu turda (0.11):** medya katmanı (V2), ESP32 kararının planı, uyumluluk vektörleri, APK'da yalnızca `*.ts.net` için HTTP izni.

**Önemli karar (K20):** sunucu **DM'in PC'sinde çalışmayacak**, hep-açık bir cihazda olacak ve DM bunun **ESP32 + Tailscale** olmasını istiyor. Tailscale'in ESP32'de çalışması mümkün (MicroLink, doğrulandı), ama pazar sunucusu Node.js olduğu için ESP'ye **yeniden yazılması** gerekir. Bu yüzden önce iki ucuz **kanıt çalışması** (spike) yapılır (Bölüm 7). Node sunucusu referans ve yedek yol olarak kalır.

**Yol haritası (hedef sürümler):**
- **v1.0:** ESP32 kanıt çalışması (V-ESP0), satıcı ve oyuncu eşya üretimi (V3, V3b), sorgu modu (V-POLL), ESP32 portu (V-ESP1, karar sonrası).
- **v1.1:** konuşan portreler.
- **v1.2:** eşya kütüphanesi (5e.tools verisi) ve görsel otomasyonu.
- **v2.0:** Crooked Moon, APK v2.
- **v2.1:** ekonomi ve endeksler (isteğe bağlı modül).
- **Ertelendi:** dış oyuncu uygulaması entegrasyonu, bildirimler, QR kodu.

**Bilinen davranış (DM kabul etti):** başarısızlık fiyatı u arttıkça düşer (95/90/85 gp, X=100 Y=60); açgözlü satıcı ortalamada nötrden ucuz satabilir. Masa testinde izlenecek.

---

## 2. Kararlar

| # | Karar | Durum |
|---|---|---|
| — | Başarısızlık formülü `f = X − a·u/2`, DC 12/15/18, Rep 4/3/2 | ✅ |
| — | Y < X/4 zarsız ret, Rep −1. Önceki tekliften düşük Y Rep −1. Aynı ya da yüksek Y serbest | ✅ |
| — | Rep 0: 1,1×X, satıcı o gün o oyuncuyla hiçbir alışverişte pazarlık yapmaz | ✅ |
| — | Hard Gamble her an (büyülüde yasak), f = 0,5×X, eşya kusurlu ve satılamaz | ✅ |
| K1 | Sunucu **hep-açık bir cihazda**, DM'in PC'sinde değil (DM kararı). Hedef cihaz **ESP32 + MicroLink (Tailscale)**, spike'larla kanıtlanacak. Node sunucusu referans olarak kalır, Raspberry Pi/PC'de de çalışır. Erişim Tailscale, PC ve mobil. Pi/PC'de `tailscale serve` ile HTTPS | ✅ (ESP ⏳ kanıt) |
| K2 | Depolama yerel disk: `app/media/`, `app/data/`. Bulut gerekmez | ✅ |
| K3–K4 | Portre ve eşya stili gerçekçi fantazi | ✅ |
| K5 | Eşya PNG 512 + 128 küçük resim (saydam). Portre PNG sprite (5 kare) | ✅ |
| K6 | APK `https://` ister, **yalnızca `*.ts.net` adreslerine** şifresiz HTTP'ye izin verir (ESP32 HTTPS sunamadığı için, ağ güvenlik yapılandırması). Diğer adresler https zorunlu | ✅ |
| K7 | Kaynak dosyalar (Crooked Moon paketi, 5e.tools kopyası) nerede | ⬜ DM |
| K8 | Satıcı kendi eşyasını üretir, kendi görselini yükler. `owner` = satıcı ya da oyuncu | ✅ |
| K9 | RTX 2060 **6 GB**, ComfyUI/Automatic1111 **kurulu değil** (kurulum V7'nin ilk adımı). SD 1.5 ile başla, SDXL 6 GB'ta yavaş. Yardımcı: Openverse/Wikimedia, DM'in kendi görselleri | ✅ |
| K10 | Görsel otomasyonu Claude Code subagent'larıyla, DM onayından geçer | ✅ |
| K11 | Tema: çok karanlık, Darkest Dungeon ağırlıklı, mobil, emoji yok | ✅ |
| K12 | Ayrı bir D&D oyuncu uygulaması var (yerel, Electron olduğu hatırlanıyor). **Şimdilik geçildi**, entegrasyon işleri ertelendi | ⏸ ertelendi |
| K13 | Oyuncu tezgâhı kuralları **DM'in ayarıdır**: pazar ücreti varsayılan %5 ama DM 0 yapıp hiç almayabilir, büyülü eşya, onay ve fiyat sınırı da DM ayarı | ✅ |
| K14 | Altın ve çantanın esas kaynağı (dış uygulama mı, Pazar mı, eşitleme mi) | ⏸ ertelendi |
| K15 | Ekonomi (Bölüm 6) **isteğe bağlı modül**: DM açar/kapatır, varsayılan kapalı, alt özellikler tek tek. DM **"evet"** dedi: modül açıldığında önerilen varsayılanlar (5e yaşam tarzı giderleri, endekslerin oyunculara açık olması, silah/zırh aşınması) devrede olur. Parametreler modül açılırken ayarlanır | ✅ |
| K16 | **İki ayrı bar.** Pazarlıkta **Pazar** barı (anlık sabır, oran olarak gösterilir) ve satıcı başına uzun vadeli **Yakınlık** barı. DC ve satıcı tipi gizli kalır | ✅ |
| K17 | Uygulama **hem PC hem mobilden** kullanılır: telefonda APK/tarayıcı, PC'de tarayıcı (masaüstü düzeni V1b) | ✅ |
| K18 | Sunucu donanımı: **ESP32-S3 (PSRAM ≥ 8 MB, flash ≥ 16 MB, microSD)** DM'in tercihi, model ⬜. Yedek yol Raspberry Pi Zero 2 W (Node değişmeden) | ✅ (model ⬜) |
| K20 | **ESP32 hedefi:** önce kanıt (Spike 1: tailnet içinden TCP/HTTP, Spike 2: bellek, LittleFS, SD), sonra C++ port; uyumluluk vektörleri ve aynı HTTP testleriyle doğrulanır. Kanıt başarısızsa Raspberry Pi'ye dönülür | ⏳ |
| K21 | Medya: tarayıcıda kırp + yeniden boyutlandır + yeniden kodla (canvas), sunucu sihirli baytla doğrular (yalnız PNG/JPEG), sınırlar: eşya 700 KB, küçük resim 60 KB, portre 400 KB, 32–2048 px. Sunucu görüntü işlemez (ESP'ye taşınabilir) | ✅ |
| K19 | **Yakınlık** (Bölüm 3): oyuncu × satıcı, 0–100, 5 seviye, kazanç/kayıp ve haftalık tavan, DC indirimi, başlangıç sabır bonusu, kilitli eşya. Değerler başlangıç önerisi, masa testinde ayarlanır | ✅ (değerler ⬜) |

**İçerik ve lisans:** ticari değil, kendi masamız. **The Crooked Moon lisanslı** (sahibiz), DM'in kendi kopyasından içe aktarılır. 5e.tools verisi DM'in yerel kopyasından okunur, site taranmaz. **Google Görseller kazınmaz** (Google'ın şartlarına aykırı, kırılgan, sonuçlar tutarsız). Google'ın resmî görsel arama API'si 2025'ten beri yeni müşterilere kapalı, 1 Ocak 2027'de kapanıyor ([Google](https://developers.google.com/custom-search/v1/overview)). WotC 2024'te 5etools deposuna DMCA talebi gönderdi ([haber](https://tildes.net/~games.tabletop/1i39/5etools_repository_taken_down_after_dmca_request_by_wizards_of_the_coast)). **Depo herkese açık: telifli görsel, kitap metni ve 5e.tools verisi depoya girmez** (`app/media/`, `app/data/` `.gitignore`'da; `git ls-files` denetimi testte olacak). Hukuki tavsiye değildir.

---

## 3. Oyun kuralları

### Değişkenler
| Sembol | Anlam |
|---|---|
| X | Satıcının (güncel) fiyatı |
| Y | Oyuncunun teklifi, X/4 ≤ Y < X |
| G = X − Y, a = G/2 | Pazarlık payı ve yarısı |
| u | Satıcı tutumu: 0,5 cömert, 1 nötr, 1,5 açgözlü (gizli) |
| Rep | Satıcının sabrı (gizli sayı, oran çubukta görünür) |

| | Cömert | Nötr | Açgözlü |
|---|---|---|---|
| u | 0,5 | 1,0 | 1,5 |
| DC | 12 | 15 | 18 |
| Kritik eşiği (DC+5) | 17 | 20 | 23 |
| Başlangıç Rep | 4 | 3 | 2 |

u için zar (tanışınca): d6, 1–2 cömert, 3–4 nötr, 5–6 açgözlü. Önemli tüccarı DM seçer. Sez (Insight) DC 15, satıcının **tipini** söyler (sayıyı değil), günde bir deneme.

### Tur
1. Oyuncu teklif eder (Y). Y < X/4: zarsız ret, Rep −1. Önceki teklifin altında Y: Rep −1, zar yine atılır.
2. **d20 + bonus** (İkna, Blöf ya da Gözdağı bonusu). Avantaj: ortak dil, önceki iyilik, ölçülü rüşvet (en fazla bir tane), iki zarın yükseği sayılır.
3. Sonuç:

| Sonuç | Koşul | Fiyat f | Rep |
|---|---|---|---|
| Kritik | doğal 20 ya da ≥ DC+5 | Y | — |
| Başarı | ≥ DC | Y + a·u/2 | — |
| Başarısız | < DC | X − a·u/2 | −1 (Blöf ve Gözdağı −2) |

Başarıda fiyat sabitlenir (kabul ya da vazgeç). Başarısızlıktan sonra aynı ya da yüksek Y ile tekrar denenebilir.

**Rep 0:** pazarlık biter, f = 1,1×X. Satıcı o gün o oyuncuyla **hiçbir alışverişte** pazarlık yapmaz (etiket fiyatı geçerli), Yeni Gün'de sıfırlanır. Hard Gamble açıktır.

**Hard Gamble (her an):** f = 0,5×X (pazarlıkta ulaşılan fiyat sayılmaz). Eşya **kusurlu**: satılamaz (0 gp), yalnızca kullanılır / parçalanır / yok edilir. Silah doğal 1'de kırılır, zırh −1 AC, alet ve araçta dezavantaj yok. **Büyülü eşyada yasak.**

**Diğer:** Deception yakalanırsa (başarısızlık) ve Intimidation başarısızlığında Rep −2. Fiyatlar en yakın cp'ye yuvarlanır. Kitap fiyatı DM ±%20 oynatabilir.

### Yakınlık (uzun vadeli, satıcı başına)
Pazar barı (Rep) tek pazarlıktır. **Yakınlık** oyuncunun bir satıcıyla uzun vadeli ilişkisidir: oyuncu × satıcı, 0–100, başlangıç 20, kalıcıdır (Yeni Gün ve Haftalık Pazar'da sıfırlanmaz).
| Seviye | Eşik | Zar eşiği (DC) | Diğer |
|---|---|---|---|
| Yabancı | 0 | 0 | |
| Tanıdık | 20 | 0 | |
| Müşteri | 40 | −1 | |
| Dost | 60 | −2 | pazarlığa **+1 sabırla** başlar |
| Sırdaş | 80 | −3 | + Dost'un bonusu |
DC indirimi kritik eşiğini de kaydırır ve **oyuncuya gösterilmez**. **Kazanç/kayıp:** alışveriş +2, teklif teslimi +5, anlaşma (kritik/başarı) +1, Hard Gamble −2, hakaret gibi teklif −1, satıcı sinirlenirse −5. Kazançlar oyuncu × satıcı başına **haftada en çok +10** (saymayı bırakma, tekrar tekrar alışveriş yaparak yükseltme engeli), kayıplar sınırsız. DM istediği zaman ± ayarlar (Kişi sekmesi).
**Kilitli eşya:** DM eşyaya "gereken yakınlık" koyabilir. Yakınlığı yetmeyen oyuncu eşyanın **adını ve fiyatını göremez** ("Kilitli · Yakınlık: Dost" görünür), pazarlık, satın alma, Hard Gamble ve teklif reddedilir.

### Örnek (X = 100, Y = 60, a = 20)
| u | Kritik | Başarı | Başarısız | Rep 0 | Hard Gamble |
|---|---|---|---|---|---|
| 0,5 | 60 | 65 | 95 | 110 | 50 |
| 1,0 | 60 | 70 | 90 | 110 | 50 |
| 1,5 | 60 | 75 | 85 | 110 | 50 |

### Karakterler (oyuncu seçer)
Ozan (İkna +6, Blöf +3, Gözdağı 0, 80 gp) · Hırsız (+2/+6/+2, 60 gp) · Barbar (0/0/+6, 100 gp) · Paladin (+5/0/+3, 90 gp) · Büyücü (+1/+1/+1, 200 gp) · Druid (+4/+1/+1, 70 gp). Sez bonusları: 2, 3, 0, 2, 4, 5.

---

## 4. Uygulama

### Çalıştır
```bash
cd app
DM_PIN=1234 node server.js        # http://localhost:3000, bağımlılık yok (Node 18+); ya da ./start.sh, start.bat
npm test                          # 40 birim/API/araç testi (vektör testi dahil)
npm run e2e                       # tarayıcı testi: 5 senaryo (playwright gerekir)
npm run vectors                   # kural motoru uyumluluk vektörlerini yeniden üretir (conformance/)
npm run tailscale                 # Tailscale HTTPS yayını (Bölüm 7). --funnel: herkese açık, --stop: kapat
npm run backup                    # data/ ve media/ -> backups/pazar-TARIH.tgz
```
DM için giriş ekranında **Ben DM'im** + PIN. Üretimde (`NODE_ENV=production`) `DM_PIN` zorunlu. **PIN hız sınırı:** aynı adresten 5 yanlış denemede 10 dakika kilit (`PIN_LOCK_MS` ile ayarlanır). Durum `app/data/data.json`'da tutulur (eski varsayılan `app/data.json` idi).

### Nasıl çalışır
Sunucu her zarı atar (oyuncu sayı görmez). Durum `app/data.json`'da tutulur. Canlı güncelleme SSE ile. Oyuncu kendi adıyla girer (aynı ad aynı oyuncuya bağlanır, masa içi kolaylık, güvenlik değil).

**Oyuncu:** karakter seç → satıcı → raf → eşya → teklif kaydırıcısı ve yaklaşım (İkna/Blöf/Gözdağı) → **Pazarlık Et**. Pazarlık ekranında üstte **iki ayrı bar**: **Pazar** (anlık, Sakin / Huzursuz / Sinirli / Bitti, oran gösterir) ve **Yakınlık** (uzun vadeli, seviye adı ve eşikler). Satıcı listesinde ve portrede de Yakınlık görünür. Sonrasında Satın Al, tekrar dene, Sez, Hard Gamble. Çantada 18 slot ve **harcama kaydı**.
**DM:** Canlı (pazarlıklar, Pazar barı, hızlı replik, fiyat sabitleme), Teklif (CRM panosu), Pazar (satıcı ve eşya yönetimi, eşyaya gereken yakınlık), Kişi (**davet adresi** kopyala/paylaş, altın, avantaj, teklif gönder, **satıcı başına yakınlık ±5**), **Defter** (tüm altın hareketleri, oyuncu ve tür süzgeci, toplamlar, **CSV indir**), Yeni Gün.

### Teklifler (CRM) ve Haftalık Pazar
Aşamalar: Yeni (DM bekleniyor) → Karşı teklif (cevap oyuncuda) → Anlaşıldı (Pazar gününde teslim) → Teslim edildi. Kapananlar: Reddedildi, Geri çekildi, Teslim olmadı. Oyuncu teklif bırakır (katalog ya da özel istek), DM kabul / karşı teklif (kural önerisiyle: Y + a·u/2) / reddet, ya da oyuncuya teklif gönderir. Teklifte zar yok. Katalog eşyasında teklif etiketin altında ve en az %25'i, oyuncunun en çok 10 açık teklifi olur.
**Haftalık Pazar** (DM): anlaşılanları teslim eder (altın düşer, eşya çantaya girer, stok azalır; altın yetmezse ya da eşya tükenmişse "Teslim olmadı"), hafta ve gün ilerler, pazarlıklar ve yasaklar sıfırlanır, cevap bekleyen teklifler kalır.

### Medya (yapıldı, 0.11)
DM Pazar sekmesinde eşyaya **Görsel**, satıcıya **Portre** ekler (telefonda kamera/galeri). **Tarayıcı** görseli ortadan kırpar, yeniden boyutlandırır ve yeniden kodlar (EXIF gider): eşya 512×512 PNG (700 KB'ı aşarsa 384, sonra 256) + 128×128 küçük resim, portre 768×512 JPEG. Sunucu görüntü işlemez, yalnızca **sihirli baytlarla doğrular** (PNG/JPEG, SVG ve diğerleri reddedilir), boyut ve piksel sınırını uygular, dosya adını kendisi üretir ve `?v=` ile önbellek tazeler. `POST /api/media?kind=item|portrait&id=…&variant=main|thumb` (yalnız DM), `GET /media/…` (yol atlatma engelli, `nosniff`, değişmez önbellek), `dm/mediaclear`, eşya/satıcı silinince dosyalar da silinir. Dosyalar `app/media/` altında (`MEDIA_DIR`), depoya girmez. Oyuncu ekranında raf ve pazarlıkta büyük görsel, çantada küçük resim, yoksa yazı kutusu. **Şu an yalnızca DM yükler**, oyuncu tezgâhı gelince (V3b) kendi eşyası için de açılır.

### Alışveriş defteri (yapıldı)
Her altın hareketi kaydedilir: `{ t, hafta, gün, tür (alım, hard gamble, teklif teslimi, DM), oyuncu, satıcı, eşya, tutar (− harcama, + gelir), etiket }`. Oyuncu kendi kayıtlarını, DM hepsini ve toplamları görür. DM'in altın ayarları da deftere yazılır (ekonomideki "kaynak" tarafı). Ekonomi motorunun (Bölüm 6) veri kaynağı budur.

### Render'a yayın
`render.yaml` ve `app/Dockerfile` hazır: Render → **New → Blueprint** → repo. Panelde **`DM_PIN`** gir. Kalıcı disk ücretli plan ister (starter), ücretsiz planda uyanınca pazar sıfırlanır. Sağlık kontrolü `/api/chars`. Docker imajı bu ortamda derlenemedi, aynı ortam değişkenleriyle `node server.js` doğrulandı. Kendi sunucunda: `docker build -t pazar app && docker run -p 3000:3000 -e NODE_ENV=production -e DM_PIN=xxxx -e PORT=3000 -v pazar-data:/data pazar`. Erişim Tailscale ile olacağı için Render şu an gereksiz, dosyalar yedek olarak duruyor.

### Android APK
`android/` ince bir WebView kabuğu (oyun mantığı sunucuda). GitHub Actions derler (`.github/workflows/apk.yml`, derleme başarılı). **İndir:** GitHub → Actions → APK → son çalışma → Artifacts → `pazar-apk` (giriş gerekir, 90 gün). **Yeniden derle:** Run workflow, Render adresini kutuya yazarsan APK'ya gömülür. Kur: bilinmeyen kaynaklara izin ver, debug imzalıdır. İlk açılışta adresi sorar (Tailscale HTTPS adresi girilir), giriş ekranındaki **Sunucu adresi** düğmesiyle değişir. Yalnızca `https://` (`usesCleartextTraffic=false`). DM'in `prompt/confirm` pencereleri köprülü. **Cihazda henüz denenmedi.** Android araçları `dl.google.com` üzerinde, bu ortamın ağ politikası engelliyor, o yüzden derleme CI'da.

---

## 5. Tema (UI)

**Referans:** Darkest Dungeon *Provision* ve *The Hoarder*, The Binding of Isaac dükkânı. Yalnızca düzen, renk ve his alınır, oyunların sanat varlıkları kullanılmaz.

| Referans | Mobil karşılığı |
|---|---|
| Solda ışıkta oturan satıcı, vinyet | Üstte satıcı portresi penceresi, kenarlarda vinyet, köşede künye plakası |
| Çerçeveli eşya slotları, altında altın simgeli fiyat | **2 sütunlu raf**, büyük görsel alanı, altında altın simgeli büyük fiyat |
| Envanter ızgarası | Çanta 3 sütun, 18 slot, kapasite sayacı |
| Hoarder simge sekmeleri | Rafta yazılı süzgeç: Tümü, Silah, Zırh, İksir, Büyülü |
| Isaac sayaçları ve fiyat dili | Üstte HUD: karakter, altın (kendi altın simgesi, CSS), hafta/gün |

**Dil:** neredeyse siyah zemin (`#050403`), soluk altın (`#a3823d`) ve kan kırmızısı vurgular, parşömen renkli metin, geniş aralıklı serif büyük harf başlıklar (çevrimdışı güvenli), hafif doku, güçlü vinyet. **Emoji yok:** görsel gelmemiş yerler **yazı kutusu** (eşya: tür + ad, portre: baş harf + "PORTRE"), simgeler CSS ile çizilen altın ve nokta. Gerçek görsel gelince alan arka plan görseline döner (`portrait`, `image` alanları hazır).

**İki bar (K16):** pazarlık ekranında en üstte, **yapışkan**. **Pazar** barı anlık sabırdır: Sakin (altın) → Huzursuz (kehribar) → Sinirli (kırmızı, titrek) → Bitti. **Yakınlık** barı uzun vadelidir: soğuk çelik rengi, 20/40/60/80 eşik çentikleri, seviye adı (Yabancı … Sırdaş). Pazar barı sayı ve segment göstermez, oran gösterir. **Not:** düşüş adımından satıcı tipi tahmin edilebilir (Rep 2'de ilk düşüş yarım çubuk, Rep 4'te dörtte bir). Sez mekaniği tipi *adıyla* verdiği için değerini korur, ama çubuk onu zayıflatır. Kabul edilen bir ödün.

**Masaüstü düzeni (yapıldı, 0.10):** ≥ 900 px'te pazarlık ekranı iki bölme (solda satıcı, iki bar, replik, eşya ve fiyat; sağda sonuç, teklif ve işlemler), raf ve çanta daha çok sütun, DM listeleri 2–3 sütun. Mobil düzen aynı. Klavye: Enter pazarlık, sol/sağ ok teklifi değiştirir.

**Bitiş ölçütleri:** 360–430 px genişlikte yatay kaydırma yok, dokunma hedefleri ≥ 44 px, metin kontrastı okunaklı. Tema tek CSS dosyasında değişkenlerle.
**Cila (sonra):** rarite çerçevesi, konuşan portre, piksel sayaç yazı tipi, ses ve titreşim (isteğe bağlı).

---

## 6. Ekonomi ve endeksler (Özellik G)

**İsteğe bağlı modül (K15):** DM açarsa çalışır, **varsayılan kapalı**. Kapalıyken fiyatlar sabit kalır ve uygulama v0.9'daki gibi davranır. DM alt özellikleri tek tek açar: fiyat düzeyi (enflasyon), yaşam giderleri, bakım/aşınma, endeksleri oyunculara göstermek.

**Amaç:** altın hep gerekli kalsın. Skyrim'in *sweetroll endeksi* sorunundan kaçın: zamanla bir somun ekmek ya da bir tatlı, oyuncunun cebindekine göre sıfırlanır, para anlamsızlaşır. Ekonomi hem **fiyatları** hem **giderleri** hareket ettirir ve DM ne olduğunu görür.

### Ana fikir
1. **Fiyat düzeyi.** Dünyanın bir fiyat düzeyi vardır (başlangıç 1,00). Oyuncular zenginleştikçe fiyatlar yavaşça yükselir, fakirleştikçe yumuşar. Kategori düzeyleri ayrı işler: yiyecek, konaklama, sarf, iksir, silah ve zırh, büyülü.
2. **Sepet ve endeksler.** Sabit bir referans sepeti ve ondan türeyen endeksler (aşağıda) enflasyonu ölçer, herkes görür.
3. **Sürekli ihtiyaç (gider kalemleri).** Altın çıkışı düzenli ve kaçınılmaz olur, böylece birikim sınırsız büyümez.
4. **DM paneli.** Kaynak ve gider dengesi, olay düğmeleri, parametreler.

### Referans sepeti (baz fiyatlar SRD/PHB'den, doğrulanacak)
Ekmek somunu (yaklaşık 2 bakır) · bira, kupa (yaklaşık 4 bakır) · sıcak yemek (yaklaşık 3 gümüş) · ortak oda, gece (yaklaşık 5 gümüş) · meşale (1 bakır) · ip 15 m (1 altın) · iyileştirme iksiri (50 altın). Sepet ağırlıkları: yiyecek %30, konaklama %30, sarf %15, iksir %15, teçhizat %10.

### Fiyat düzeyi hesabı (haftada bir, Haftalık Pazar'da)
```
L      = (M / M_ref) ^ α          M: kişi başı ortalama altın, M_ref: DM'in referans serveti
P_kat  ← clamp( P_kat + λ·(L − P_kat) + şok_kat , haftalık ±%5 )
görünen fiyat = taban fiyat × P_kat   (en yakın cp'ye yuvarlanır)
```
Başlangıç öneri: α = 0,4, λ = 0,3. `şok_kat` DM olaylarından gelir (Kıtlık yiyeceğe +%20, Savaş silaha +%30, Bolluk −%10, Vergi). Fiyatlar **haftada bir** değişir, böylece teklifler ve pazarlıklar hafta içinde kararlıdır. Pazarlıkta X güncel fiyattır, Hard Gamble güncel fiyatın %50'si, teklif alt sınırı güncel fiyatın %25'i. Anlaşılan teklifler anlaşma anındaki fiyattan teslim edilir.

### Endeksler
| Endeks | Anlamı |
|---|---|
| **Ekmek Endeksi** | Somun ekmek şu an kaç bakır (baz 100). Herkesin anlayacağı ölçü |
| **Sepet Endeksi (SE)** | Ağırlıklı sepet fiyatı, baz 100. Haftalık değişimi **enflasyon oranı** |
| **Altın Alım Gücü** | 1 gp kaç somun ekmek ya da kaç gece konaklama alır |
| **Dayanma Süresi** | Oyuncunun altını ÷ günlük gideri (gün). **Anti-sweetroll ölçütü** |
| **Akış Oranı** | Haftalık gider ÷ kaynak. Hedef 0,9–1,1 |

Hedef bantlar (DM ayarlar, öneri): Dayanma Süresi 20–60 gün. 10 günün altı sıkıntı, 120 günün üstü "para değersizleşiyor" uyarısı. Haftalık enflasyon 0–4% normal, %8 üstü aşırı enflasyon, −%3 altı deflasyon uyarısı.

### Sürekli ihtiyaç: gider kalemleri (para çıkışı)
| Kalem | Nasıl |
|---|---|
| **Geçim gideri** | Her oyun günü ya da hafta yaşam tarzına göre ödenir (5e yaşam tarzı harcamaları: yaklaşık sefil 0, sefalet 1 sp, yoksul 2 sp, mütevazı 1 gp, rahat 2 gp, zengin 4 gp, aristokrat en az 10 gp günlük, doğrulanacak). Ödenemezse borç ve sonuç (yorgunluk, itibar kaybı, DM kuralı) |
| **Bakım ve aşınma** | Silah ve zırh aşınır. Haftalık bakım değerin yaklaşık %2'si. Ödenmezse aşınma (küçük dezavantaj) |
| **Sarf malzemeleri** | İksir, cephane, meşale, erzak: sürekli tüketilir |
| **Pazar ücreti ve vergi** | Oyuncu tezgâhı satışında %5 (K13), tüccar vergisi |
| **Hizmetler** | Şifa, diriltme, büyü hizmeti, ulak, bilgi ve rüşvet |
| **Kusurlu eşya** | Hard Gamble'ın kalıcı değer kaybı (satılamaz) |
| **İsteğe bağlı** | Borç ve faiz (tefeci), lonca aidatı, itibar satın alma |

**Kaynaklar (para girişi):** DM ödülleri (defterde `dm`). Oyuncular arası satış nötr (altın el değiştirir, ücret dışında çıkmaz). **Kural:** DM verdiği altını gider kalemleriyle dengeler, panel farkı gösterir.

### Görünüm
- **Oyuncu:** eşya fiyatının yanında haftalık değişim (yazıyla, örn. "+3%"), üstte "Ekmek: 2 bakır" gibi tek satır. DM açar/kapatır (K15).
- **DM "Ekonomi" sekmesi:** endeksler, hafta bazlı çizgi grafik, kaynak/gider dağılımı, olay düğmeleri (Kıtlık, Savaş, Bolluk, Vergi), fiyat düzeyini elle ayarlama, parametreler (α, λ, M_ref, bantlar).
- **Simülatör:** 12–20 haftalık senaryoyu çalıştırıp parametreleri ayarlamak için betik. Amaç Dayanma Süresi'ni hedef bantta tutmak.

### Veri
`economy = { P: {kategori: değer}, M_ref, α, λ, bantlar }` ve haftalık `economyHistory[]` (hafta, P, endeksler, kaynak, gider). Kaynak: **alışveriş defteri** (bugün var).

### Bitiş ölçütleri
- Endeks ve fiyat düzeyi hesabı birim testli. Haftalık ±%5 sınırı uygulanır. Sabit servet altında P, 1'e yakınsar.
- Defter toplamları ile akış oranı tutarlı.
- 12 haftalık simülasyonda Dayanma Süresi hedef bantta kalır (parametre ayarı sonrası).
- Fiyat değişimi hafta içinde teklifleri ve pazarlıkları bozmaz.

### Aşamalar (v2.1)
V13 Ekonomi motoru (P, kategoriler, haftalık güncelleme) · V14 Endeks ekranı ve grafik · V15 Geçim gideri ve bakım · V16 DM olayları ve simülatör. Karar gerekir: K15 (yaşam tarzı ücretleri kullanılsın mı, enflasyon oyunculara açık mı, α, λ, M_ref, aşınma sistemi var mı).

---

## 7. Sonraki özellikler

**Çerçeve:** yerel çalışır, ticari değil, oyuncular aynı odada olmak zorunda değil, Crooked Moon lisanslı, gerçekçi fantazi stili.

### A. Konuşan portre (5 ağız karesi)
Kareler: 0 kapalı (m/b/p, sessizlik) · 1 hafif aralık (e, i, s, t, d, n, k) · 2 orta (ç, ş, j, y, g, ğ) · 3 geniş (a) · 4 yuvarlak (o, ö, u, ü).
**Kaynak resim (DM verir):** önden bakan, omuz üstü, **ağız kapalı ve nötr**, yüz net, ≥ 768 px.
**Yöntem, gerçekçi yüz için yüz işareti + ağ deformasyonu:** (1) MediaPipe Face Landmarker (WASM) dudak ve çene noktalarını bulur. (2) Dudak ve çene çevresi üçgen ağ olarak her kare için esnetilir, yanaklar hafif oynar. (3) Açılan boşluk resimden örneklenen renklerle koyu gradyan, üst diş şeridi ve dille doldurulur (dokular bizim, telifsiz). (4) Yüz bulunamazsa (ork, tiefling, hayvansı) **yedek: DM ağız merkezini ve genişliğini 2 dokunuşla işaretler**, tusk gibi öğeler çene ile hareket eden katman olur. (5) Önizleme ve ince ayar, kötü portrede "animasyonu kapat". (6) Yerel GPU varsa açık kaynak yüz canlandırma modeli isteğe bağlı deney (çekirdek plana girmez).
**Oynatma:** replik baloncukta yazılırken harfe göre kare değişir (~12 kare/sn), bitince kapalıya döner. Ses gerekmez, ileride TTS aynı tabloya bağlanır. Sinirli satıcıda hafif titreme. Alıcı (oyuncu) da portre yükler, DM ekranında not yazınca konuşur.
**Bitiş:** insan/elf/cüce portrelerde ağız otomatik bulunur ve dikiş ya da kayan yüz görünmez, ork/hayvansı portrelerde yedek yolla kabul edilebilir kare çıkar, üretim < 5 sn, resim en çok 8 MB ve sunucuda yeniden kodlanır (EXIF silinir).

### B. Eşya kütüphanesi
**Model:** `{ id, name, aliases[], type, rarity, valueGp, magical, source, license, image, thumb }`. Fiyat yoksa DMG rarite aralığı önerilir (common 100, uncommon 400, rare 4.000 …). Kaynak ve lisans her kayıtta, bir kaynağı toplu kaldırmak tek komut.
**Bağdaştırıcılar (hepsi yerel dosya okur):** `open` (Open5e/SRD verisi + game-icons.net CC BY 3.0 ikonları + tür ikonları, kutudan çıkınca çalışır) · `local-5etools` (DM'in yerel `items.json`/`items-base.json`, **5e.tools eşya adları ve verisi vazgeçilmez**, alan adları doğrulanacak) · `foundry-package` (kurulu The Crooked Moon paketi, yapı doğrulanacak) · `local-folder` (serbest klasör/zip) · `manual`.
**İçe aktarma hattı (`tools/import-items`):** girdi → 512 PNG + 128 küçük resim (`sharp`, saydam, kırp-ortala-eşit boşluk) → slug (Türkçe dahil) → ada göre eşleştirme (tam ad, takma ad, bulanık, belirsiz olan DM onayına) → görselsiz eşya tür ikonuna düşer → kapsam raporu → `app/media/items/`. Tekrar çalıştırmak aynı sonucu verir. Rarite rengi çerçevesi arayüzde uygulanır (görsele gömülmez).
**DM seçicisi:** Pazar → + Eşya aranabilir ızgara açar, süzgeç (tür, nadirlik, büyülü, kaynak), seçince ad/fiyat/büyülü/görsel dolar. **Dükkân şablonu** (Demirci, Simyacı, Gezgin Tüccar) rarite tablosuna göre rastgele N eşya doldurur.
**Bitiş:** 1.000+ eşya telefonda 200 ms'de aranır, kapsam raporu var, depoda telifli dosya yok, her kayıtta kaynak+lisans.

### C. Satıcı kendi eşyasını üretip satar
Eşya editörü (ad, açıklama, tür, nadirlik, büyülü, fiyat, stok, **görsel**): telefondan kamera/galeri, kare kırpma, isteğe bağlı arka plan silme, 512 PNG. Görsel yoksa yazı kutusu. **Varyant üret** (kopyala ve değiştir, örn. "+1 Uzun Kılıç → Don Kılıcı"). Üretilen eşya doğrudan satıcının rafına düşer. `owner: { type: merchant|player, id }`.

### D. Görsel bulucu otomasyonu (Claude Code subagent'ları)
**Amaç:** her eşya adı için gerçekçi fantazi bir görsel bulmak ya da üretmek ve PNG'ye çevirmek. DM'in işi yalnızca onay.
**Kaynak sırası:** (1) `local-folder`/`foundry-package` (2) `generate-local` (3) `openverse`, `wikimedia` (4) `google-cse` (yalnızca zaten motoru olanlar, çekirdek plana girmez).
**RTX 2060:** 6 GB ise SD 1.5 tabanlı gerçekçi model, 512×512, sabit komut şablonu (*"realistic fantasy <ad>, isolated object, studio lighting, no text"*, negatif: yazı, filigran, çerçeve, el), sabit stil eki (LoRA), tek GPU işçisi. 12 GB ise SDXL Turbo/Lightning de denenir. Süre kaba tahmin: SD 1.5'te eşya başı birkaç saniye, 2.000 eşya birkaç saat (gece). **İlk iş 20 eşyalık kıyas denemesi.** Model ve LoRA lisansı kayda yazılır. Dürüst beklenti: web kaynaklarının fantazi eşyada isabeti düşük, ana yol yerel üretim, web sıradan eşyalar (ip, meşale, kılıç, zırh) için yardımcı.
**Kurulum (V7'nin ilk adımı, ComfyUI kurulu değil, kart 6 GB):** (1) NVIDIA sürücüsünü güncelle. (2) ComfyUI'nin Windows NVIDIA taşınabilir paketini indir (kurulum gerektirmez, doğrulanacak), ya da Automatic1111. (3) SD 1.5 tabanlı gerçekçi bir model indir, lisansını oku, `models/checkpoints/` içine koy. (4) API açık başlat (yalnızca `127.0.0.1`, dışarı açma). (5) 20 eşyalık deneme partisi: hız ve kalite ölç. (6) 6 GB için SD 1.5 fp16, 512×512 rahat, SDXL için düşük bellek modu gerekir ve yavaştır. (7) Arka plan silme `rembg` CPU'da. Kurulum adımlarında takılırsanız birlikte ilerleriz.
**Hat (`/item-images run`):** (1) **İsim kuyruğu** yerel 5e.tools/SRD'den, `queue.json`, kaldığı yerden devam. (2) **`item-image-finder`**: 20'lik gruplarla adayları toplar, `staging/`'e koyar (≤4 aday), kaynak URL/lisans/sorgu manifeste. (3) **`item-image-judge`**: adayları görerek değerlendirir (doğru eşya mı, tek nesne mi, gerçekçi fantazi mi, yazı/filigran/çerçeve yok mu, ≥512 px), seçer ya da reddeder, reddedilen üretime gider (≤2 deneme). (4) **`item-image-processor`**: 512 PNG + 128 küçük resim, arka plan silme (`rembg` benzeri), kırp-ortala, kayıt. (5) **DM onay ekranı**: seçilen ve alternatifler yan yana, onayla / başkasını seç / kendi görselini yükle / yeniden üret. Onaysız görsel oyunculara görünmez. (6) Rapor.
**Yerel ve özel:** görseller `app/media/`'da, `.gitignore`'da, `purge --source` ile toplu silinir, APK görsel paketlemez.
**Bitiş:** 50 adlık partide her ad için görsel ya da tür ikonu, judge kötü adayları (filigranlı, çok nesneli, yazılı) reddeder, kuyruk kesilip yeniden başlayınca sürer, depoda görsel/veri/manifest yok.

### E. Oyuncu tezgâhları
Oyuncu **Tezgâhım**'da çantasından eşya listeler (listelenince rezerve, çift satış olmaz). Alıcı tam fiyata alır (Pazar gününde teslim) ya da teklif verir, teklifi **tezgâh sahibi** cevaplar, aynı CRM hattı. Haftalık Pazar oyuncu anlaşmalarını da teslim eder (altın alıcıdan satıcıya, ücret düşülür; altın yetmezse ya da eşya rezervede değilse "Teslim olmadı").
| Konu | Kural | Durum |
|---|---|---|
| Zar | Yok, sadece teklif hattı | ✅ öneri |
| Pazar ücreti | Varsayılan %5 DM kasasına, DM ayarlar (0–20). **0 yaparsa hiç alınmaz** | ✅ DM ayarı |
| Büyülü eşya | DM oyuncu başına açar/kapatır, varsayılan kapalı | ✅ DM ayarı |
| Kusurlu eşya | Satılamaz | ✅ |
| Oyuncu üretimi | Yayın öncesi DM onayı (DM kapatabilir), haftada N sınırı | ✅ DM ayarı |
| Fiyat sınırı | Katalog eşyada etiketin %25–%400'ü (DM aşar ya da kapatır) | ✅ DM ayarı |
| Kendine satış / çete | Kendi tezgâhından alamaz, iki oyuncu arası haftalık sınır, DM denetim günlüğü | ✅ öneri |
| DM yetkisi | Tezgâhı kapatır, anlaşmayı iptal eder, tüm listeleri görür | ✅ |
**Bitiş:** iki oyuncu arası listele → teklif → kabul → Haftalık Pazar doğru el değiştirir, toplam altın (oyuncular + ücret) korunur (birim testi), eşya iki kez satılamaz, yetkisiz kişi başkasının tezgâhını değiştiremez, DM günlükte her el değişimini görür.

### F. Dış D&D oyuncu uygulaması entegrasyonu (ertelendi)
Ayrı, yerel (Electron) bir D&D oyuncu uygulaması var. **Şimdilik geçildi** (K12, K14). Beklemedeki işler: `/api/v1` ve OpenAPI, oyuncu kaydında `externalId`, imzalı webhook'lar (`purchase.settled`, `offer.updated`, `stall.updated`, `gold.changed`), gömülü mod (`?embed=1`), API anahtarı/JWT, altın/çanta için tek doğruluk kaynağı kararı. **Bugünden kalan tek hazırlık:** tüm altın ve eşya değişimleri **defterden** geçer (var), böylece sonradan bağlamak kolay. Uygulama belli olunca V12 olarak yeniden açılır.

### Erişim: Tailscale, PC ve mobil (V1) — yapıldı (0.10)
**Durum:** `npm run tailscale` (kontrol, `serve`, adres yazma, eski/yeni CLI sözdizimi, `--funnel` için ≥ 8 karakter PIN, `--stop`), DM "Kişi" sekmesinde davet adresi (kopyala/paylaş), PIN hız sınırı, `npm run backup`, `start.sh`/`start.bat` hazır ve **sahte `tailscale` komutuyla testli**. Gerçek Tailscale'de henüz denenmedi (bu ortamda yok). **QR kodu ertelendi** (bağımlılıksız QR üretici ayrı iş).
- **Kim nerede:** Sunucu DM'in PC'sinde ya da hep-açık bir cihazda çalışır ve Tailscale'e bağlıdır. Oyuncular PC ve telefonlarına Tailscale kurar (Windows, macOS, Linux, Android, iOS) ve DM'in ağına girer.
- **Paylaşım:** DM oyuncuları kendi tailnet'ine davet eder ya da sunucu cihazını **paylaşır** (oyuncu kendi Tailscale hesabıyla girer). Ücretsiz planın kullanıcı sayısı ve paylaşım sınırları güncel koşullardan **doğrulanacak**, kalabalık gruplarda paylaşım ya da Funnel gerekebilir.
- **HTTPS:** `tailscale serve --bg --https=443 http://localhost:3000` (Tailscale yönetim panelinde HTTPS açık olmalı). Adres `https://<cihaz>.<tailnet>.ts.net`. HTTPS, PWA kurulumu, service worker ve APK'nın `https://` ayarı için gerekli. Trafik zaten WireGuard ile şifreli.
- **`npm run tailscale`:** `tailscale` kurulu mu ve bağlı mı kontrol eder, `serve`'ü başlatır, adresi ve QR kodu yazar. Adres MagicDNS ile **kalıcıdır** (tünellerdeki gibi her açılışta değişmez).
- **PC ve mobil aynı adrese** girer. APK'da adres bir kez girilir, PC'de tarayıcıdan açılır ya da PWA olarak kurulur.
- **Funnel (isteğe bağlı, varsayılan kapalı):** Tailscale kurmayacak oyuncu için genel HTTPS. Herkese açık olduğu için **güçlü PIN ve yanlış denemeye hız sınırı** zorunlu.
- Teklifler DM çevrimdışıyken bırakılabilir, ama **sunucu cihazı açık olmalı**. Kalıcı çözüm hep-açık cihaz (aşağıda).
- Yedek: `npm run backup` (`app/data/` + `app/media/` zip). Başlatma: `npm start`, `start.bat`, `start.sh`. Bildirimler ertelendi (V11).

### Sunucu donanımı ve ESP
| Cihaz | Uygun mu | Not |
|---|---|---|
| DM'in PC'si | Evet (varsayılan) | Kapalıyken kimse bağlanamaz |
| Raspberry Pi 3/4/5, Zero 2 W (64-bit) | **Evet, hep-açık için öneri** | Node 18+ ve Tailscale çalışır, düşük güç. Medya ve durum için iyi bir kart ya da SSD |
| Mini PC, NAS, eski dizüstü | Evet | Docker ile de çalışır |
| Eski Android telefon (Termux) | Denenebilir | Kararsız olabilir |
| **ESP32-S3** (PSRAM'li) | **Mümkün ama yeniden yazım ister** (DM tercihi) | Node çalışmaz. Tailscale istemcisi var (MicroLink, doğrulandı). Ayrıntı ve kanıt planı aşağıda |
| ESP32 (PSRAM'siz), ESP8266 | Hayır | RAM yetmez |

**ESP'nin yardımcı rolleri** (ana sunucu olmasa da): yeni teklif gelince ışık, fiziksel "Yeni Gün" düğmesi, PC'yi Wake-on-LAN ile uyandırma.

### ESP32 üzerinde çalıştırma (K20, DM kararı)
**Karar:** sunucu DM'in PC'sinde çalışmayacak. Hep-açık cihaz **ESP32** olacak, **Tailscale**'e bağlı olacak, DM ve tüm oyuncular pazara ESP üzerinden bağlanacak.

**Doğrulanan bilgi (önceki "topluluk kütüphaneleri var, doğrulanmadı" notunun düzeltmesi):** ESP32 için Tailscale uyumlu bir istemci var: **MicroLink** (ts2021 protokolü, WireGuard, DERP, DISCO, STUN, yaklaşık 100 KB SRAM, ESP-IDF, Wi-Fi ve 4G) [github.com/CamM2325/microlink](https://github.com/CamM2325/microlink). README'si "çift yönlü **UDP**" diyor: ESP'nin tailnet içinden **TCP/HTTP** sunabildiği **doğrulanmadı**. Spike 1 bunu test eder.

**Asıl iş:** Node.js ESP'de çalışmaz, pazar sunucusu **yeniden yazılmalı**:
| Parça | Node'da (bugün) | ESP32'de |
|---|---|---|
| Tailscale | `tailscale` CLI, `serve` | MicroLink (ESP-IDF bileşeni) |
| HTTP sunucu | `http` modülü | `esp_http_server` (HTTP, TLS yok) |
| Canlı güncelleme | SSE | soket sınırı nedeniyle **kısa aralıklı sorgu**: `GET /api/state?rev=N`, değişmediyse 304 |
| Durum | bellek + `data.json` | LittleFS'te JSON, yazımlar 5–10 sn'de bir birleştirilir, defter son ~300 kayıt |
| PWA dosyaları | `public/` | LittleFS (gzip) |
| Görseller | disk | **microSD** (FAT) |
| Kural motoru | `engine.js` | C++ port, **uyumluluk vektörleriyle** doğrulanır (üretildi: `app/conformance/haggle-vectors.json`, 688 vaka) |
| Görsel işleme | tarayıcıda (canvas) | aynı: ESP görüntü işlemez (V2 zaten böyle tasarlandı) |
| Arama/filtre | istemci | istemci (ESP sadece sayfalı liste verir) |
| Zaman | `Date` | SNTP (Wi-Fi üzerinden) |
| Yedek | `npm run backup` | DM ekranından indirme, SD kart yedeği |
| Güncelleme | `git pull` | OTA firmware |

**Donanım şartı (öneri):** ESP32-S3 (çift çekirdek), **PSRAM ≥ 8 MB**, **flash ≥ 16 MB**, **microSD yuvası**. PSRAM'siz ESP32 ve ESP8266 uygun değil. Kartın tam modelini bilmiyorum.

**Kabul edilmesi gereken sınırlar:**
- **HTTPS yok** (`tailscale serve` ESP'de olmaz). Adres `http://<ad>.<tailnet>.ts.net:3000`, trafik WireGuard ile şifreli. Tarayıcıda "Ana ekrana ekle" ve service worker (güvenli bağlam ister) çalışmaz, **oyuncular APK kullanır** (APK bugün yalnızca `*.ts.net` için HTTP'ye izinli). Tarayıcı sayfası yine açılır.
- Eşzamanlı bağlantı sınırlı: hedef **≤ 8 oyuncu + DM**, sorgu modu, izleyici (watchdog) ve otomatik yeniden bağlanma.
- Flash aşınması ve SD bozulması: yazma seyreltme, atomik yazma (geçici dosya + yeniden adlandırma), düzenli yedek indirme.
- İki sunucu (Node referans + ESP) uyumlu tutulmalı.

**Plan (önce kanıtla):**
1. **Spike 1 (S):** MicroLink ile ESP tailnet'e girer, telefon `ping` atar, ardından **TCP üzerinden basit bir HTTP sayfası** telefondan tarayıcı ve APK ile açılır. Boş bellek (heap/PSRAM) ölçülür. **Geçemezse ESP yolu kapanır.**
2. **Spike 2 (S):** LittleFS'ten PWA dosyalarını sunar, 5 istemciyle sorgu yapılır, bellek ve tepki süresi ölçülür, SD'den 300 KB'lık görsel sunulur.
3. **V-POLL (S):** Node sunucusuna da sorgu modu eklenir (`?rev=`), istemci SSE koparsa ya da ESP'de sorguya döner.
4. **Port (XL):** kural motoru C++ (vektörlerle), tüm API, durum saklama, medya. `api.test.js` aynı HTTP testleri **ESP adresine karşı** çalışacak şekilde `TEST_BASE_URL` ile genişletilir (deterministik zar için test derlemesi).
5. Node sunucusu referans ve test yolu olarak kalır.

**Dürüst tavsiye:** Spike 1 geçse bile tam port büyük iş. Aynı işi gören **Raspberry Pi Zero 2 W** (benzer fiyat ve güç) Node kodunu **değiştirmeden** çalıştırır ve resmî Tailscale ile `tailscale serve` HTTPS/PWA verir. ESP yolu tamamen olanaklı, ama bedeli yeniden yazım ve HTTP/soket sınırları. Karar sizin: spike'lar ucuz, önce onları yapmayı öneririm. Başarısız ya da yorucu olursa Pi'ye dönüş kolay, çünkü Node sunucusu duruyor. Ben ESP-IDF taslak proje ve adım adım yönerge yazabilirim, **donanımı burada test edemem**: sonuçları siz paylaşırsınız.

### Masaüstü düzeni (V1b) — yapıldı (0.10)
Uygulama PC'de de kullanılacak (K17). ≥ 900 px genişlikte Darkest Dungeon referansındaki gibi **iki bölme**: solda satıcı portresi, sabır çubuğu ve pazarlık paneli, sağda raf, çanta ve teklifler. DM paneli geniş: canlı pazarlıklar, teklifler ve defter yan yana. Mobil düzen aynı kalır (tek sütun, alt sekme). Klavye: Enter ile pazarlık, ok tuşlarıyla teklif. PWA olarak PC'ye kurulabilir (HTTPS ile). **Bitiş:** 360, 768, 1280 ve 1920 px'te düzen bozulmaz (tarayıcı testi 3–4 genişlikte), dokunma ve fare ile aynı işlevler.

---

## 8. Aşamalar

| Hedef sürüm | Aşama | İş | Boyut | Durum |
|---|---|---|---|---|
| 0.1–0.9 | Kural motoru, sunucu, arayüz, teklifler, Haftalık Pazar, APK kabuğu, tema, defter | Bölüm 12 | — | ✅ |
| 0.9.1 | Plan güncellemesi (Tailscale, ESP cevabı, masaüstü, sürüm günlüğü) | Bölüm 12 | S | ✅ |
| 0.10 | Yakınlık sistemi, Tailscale aracı, masaüstü düzeni, defter CSV | Bölüm 3, 7, 12 | L | ✅ |
| v1.0 | **V0** Karar kilidi | Kalan sorular (Bölüm 10) | S | ⬜ |
| 0.10 | **V1** Erişim: Tailscale | `npm run tailscale` (serve, adres), PIN hız sınırı, Funnel seçeneği, yedek, başlatma betikleri. QR ertelendi | M | ✅ |
| 0.10 | **V1b** Masaüstü düzeni | iki bölmeli PC düzeni, DM geniş panel, klavye, 4 genişlikte test | M | ✅ |
| 0.11 | **V2** Medya katmanı | tarayıcıda yeniden boyutlandırma, sunucuda sihirli bayt doğrulama, `/api/media`, `/media`, eşya görseli + küçük resim, satıcı portresi | M | ✅ |
| v1.0 | **V-ESP0** ESP32 kanıt çalışması | Spike 1 (MicroLink + TCP/HTTP tailnet içinden, bellek) ve Spike 2 (LittleFS, 5 istemci, SD görseli) | S | ⬜ donanım |
| v1.0 | **V-POLL** Sorgu modu | `GET /api/state?rev=N`, istemci yedek modu, Node'a da | S | ⬜ |
| v1.0 | **V-ESP1** ESP32 portu | C++ motor + API + durum + medya, vektör ve HTTP testleri (`TEST_BASE_URL`) | XL | ⬜ kanıt sonrası |
| 0.10 | **V2b** Defter genişletme | oyuncu/tür süzgeci, CSV dışa aktarma (tüm kayıtlar) | S | ✅ |
| v1.0 | **V3** Satıcı eşya üretimi | editör, kendi görseli, varyant, `owner` | M | ⬜ |
| v1.0 | **V3b** Oyuncu tezgâhı | rezerve, oyuncu teklif hattı, teslim, ücret (DM ayarı, 0 olabilir), denetim günlüğü, onay kuyruğu | L | ⬜ |
| v1.1 | **V4** Portre + ağız kareleri | yükleme, yüz işareti + ağ deformasyonu, yedek yol, önizleme | L | ⬜ |
| v1.1 | **V5** Konuşma animasyonu | metin → kare, satıcı/alıcı portreleri, avatar | M | ⬜ |
| v1.2 | **V6** Kütüphane çekirdeği ve 5e.tools verisi | model, `open` kaynağı, `local-5etools`, eşleştirme, "Hakkında" | L | ⬜ |
| v1.2 | **V7** ComfyUI kurulumu + görsel otomasyonu | **önce kurulum ve 20 eşyalık kıyas (6 GB, SD 1.5)**, sonra kuyruk, finder/judge/processor, Openverse/Wikimedia | L | ⬜ |
| v1.2 | **V8** DM seçici, onay ekranı, şablonlar | ızgara, süzgeç, otomatik doldurma, görsel onay kuyruğu | L | ⬜ |
| v2.0 | **V9** Crooked Moon | 26 eşya içe aktarım ya da elle | S | ⬜ |
| v2.0 | **V10** APK v2 | `versionCode 2`, Tailscale HTTPS adresi, görsel önbelleği, cihazda test | M | ⬜ |
| v2.1 | **V13–V16** Ekonomi (isteğe bağlı modül) | motor, endeks ekranı, geçim gideri/bakım, olaylar ve simülatör (Bölüm 6) | L | ⬜ |
| — | **V11** Bildirimler | cevap gelince bildirim | M | ⏸ ertelendi |
| — | **V12** Dış uygulama entegrasyonu | `/api/v1`, webhook, `externalId`, gömülü mod (K12/K14) | L | ⏸ ertelendi |

**Sıra:** V1–V1b, V2 ve V2b yapıldı. Sıradaki **V-ESP0** (donanımla, sizin testinizle) ve paralelde Node referansında **V3/V3b**. V-ESP1 ancak kanıt başarılıysa. V3 ve V3b medyadan hemen sonra (kütüphane olmadan da işe yarar). Portre (V4–V5) ve kütüphane (V6–V8) bağımsız ilerler. Ekonomi (V13+) defterin genişlemesine dayanır, istenmezse hiç yapılmaz.

**Genel testler:** birim (viseme, slug, eşleştirme, rarite fiyatı, medya, ekonomi formülleri), API (sınırlar, yetki, yeniden kodlama, defter tutarlılığı), tarayıcı Playwright (portre yükle → kare değişti; kütüphaneden seç → pazarda görsel; iki oyuncu arası satış; 4 genişlikte düzen). Bütçe: ilk yükleme < 500 KB (görsel hariç), portre sprite < 1 MB, eşya küçük resmi < 15 KB.

---

## 9. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Telifli dosyanın depoya girmesi | Takedown | `.gitignore`, `git ls-files` denetim testi, kaynak+lisans kaydı |
| Ağ deformasyonu bazı resimlerde kötü (saç, sakal, profil, maske, tusk) | Kötü kare | İnce ayar, 2 dokunuş yolu, "animasyonu kapat" |
| Web görsellerinde düşük isabet (fantazi eşyalar) | Yanlış görsel | Judge, DM onayı, üretime düşme |
| **Kart 6 GB, ComfyUI kurulu değil** | SDXL yavaş, kurulum yükü | SD 1.5, 20 eşyalık kıyas, gece çalıştırma, adım adım kurulum |
| Google Görseller'e bağımlılık | Şart ihlali, kapanan API | Kurulmaz |
| Subagent hatalı görsel seçer | Yanlış eşya | Ret nedeni, onay kuyruğu, onaysız görünmez |
| Kullanıcı görseli zararlı dosya olabilir | Güvenlik | Yeniden kodlama, boyut/tür sınırı, yalnız DM yükler (tezgâhta DM onayı) |
| Oyuncular arası altın aktarımıyla sömürü | Denge bozulur | DM ayarlı ücret/fiyat sınırı, çift sınırı, denetim günlüğü, DM iptali |
| Rezerve/teslim yarışması, eşya iki kez satılır | Kayıp eşya/altın | Rezerve, tek defter, teslimde yeniden doğrulama, testler |
| **Tailscale kurulum ve kullanıcı sınırı** | Bazı oyuncular bağlanamaz | Paylaşım (node sharing), Funnel (isteğe bağlı), kurulum rehberi, güncel plan sınırlarını doğrula |
| **Funnel herkese açık** | Yetkisiz DM denemesi | Varsayılan kapalı, güçlü PIN, hız sınırı |
| **DM'in cihazı kapalı** | Teklif bırakılamaz | Hep-açık Raspberry Pi sınıfı cihaz |
| **ESP32'de TCP/HTTP tailnet içinden çalışmayabilir** (MicroLink README'si UDP diyor) | ESP yolu kapanır | Spike 1 önce, yedek yol Raspberry Pi |
| **ESP portu büyük iş; iki sunucu uyumsuzlaşır** | Zaman, tutarsızlık | Uyumluluk vektörleri, aynı HTTP testleri (`TEST_BASE_URL`), Node referans |
| **ESP yalnız HTTP: PWA ve service worker yok** | Kurulum deneyimi | APK (`*.ts.net` için HTTP izni), tarayıcıda düz sayfa |
| **ESP RAM/soket sınırı, SSE yok** | Gecikmeli güncelleme, bağlantı reddi | Sorgu modu, ≤ 8 oyuncu, watchdog |
| **SD bozulması / flash aşınması** | Veri kaybı | Yazma seyreltme, atomik yazma, düzenli yedek indirme |
| Yüklenen görsel sunucuda işlenmiyor | Kötü niyetli dosya | Sihirli bayt (yalnız PNG/JPEG), boyut ve piksel sınırı, yalnız DM yükler, tarayıcıda yeniden kodlama |
| Pazar barı satıcı tipini sızdırır | Sez zayıflar | Oran gösterimi, kabul edilen ödün (K16) |
| Yakınlık sömürülür (aynı şeyi tekrar tekrar alıp yükseltme) | Denge bozulur | Haftalık kazanç tavanı (+10), kayıplar sınırsız, DM ±ayar |
| Yakınlık DC indirimi pazarlığı fazla kolaylaştırır | Zorluk düşer | En çok −3, oyuncuya gösterilmez, değerler masa testinde ayarlanır |
| Ekonomi modülü kötü ayarlı ya da bunaltıcı | Para değersiz/imkânsız pahalı, sıkıcı muhasebe | Varsayılan kapalı, alt özellikler tek tek açılır, ±%5 haftalık sınır, simülatör, DM elle ayar |
| PC düzeni mobili bozar | Kullanılamaz ekran | 4 genişlikte tarayıcı testi, tek CSS |
| Foundry paket yapısı beklenenden farklı | İçe aktarma çalışmaz | `local-folder` ve `manual` yedekleri, V0'da doğrulama |

---

## 10. Açık sorular (DM)

Cevaplananlar: ekran kartı ve ComfyUI (6 GB, kurulu değil), tezgâh kuralları (DM ayarı), dış uygulama (ertelendi), erişim (Tailscale, PC + mobil), iki ayrı bar (Pazar + Yakınlık, teyit edildi), ekonomi (evet), medya katmanı (evet), **sunucu PC'de değil, ESP32'de** (K20).

1. **ESP kartı tam olarak hangisi?** Model, PSRAM (MB), flash (MB), microSD yuvası var mı? ESP32-S3 (PSRAM ≥ 8 MB, flash ≥ 16 MB, microSD) önerilir, PSRAM'siz ESP32 ve ESP8266 uygun değil.
2. **Spike 1'i yapmak ister misiniz?** Ben ESP-IDF taslak projesi ve adım adım yönerge yazarım (MicroLink ile tailnet'e girmek, telefondan `http://…ts.net` sayfasını açmak, boş belleği ölçmek). Donanımı burada test edemem, sonucu siz paylaşırsınız. Geçemezse ESP yolu kapanır.
3. **Yedek yol:** Spike başarısız olursa ya da tam port yorucu bulunursa Raspberry Pi Zero 2 W'ye (Node kodu değişmeden, resmî Tailscale, HTTPS) dönmeye razı mısınız?
4. **Oyuncu sayısı:** ESP için hedef ≤ 8 oyuncu + DM yeterli mi?
5. **Yakınlık değerleri** hâlâ onay bekliyor: başlangıç 20, kazanç/kayıp, haftalık tavan +10, DC indirimi en çok −3, Dost'ta +1 sabır. Kilitli eşya kullanacak mısınız?
6. **5e.tools** yerel kopyası, **Crooked Moon** kaynağı (Foundry paketi mi PDF mi), hazır **portreler**, **QR kodu** isteği.
7. **Sıradaki adım hangisi?** (a) Spike 1 yönergesi ve firmware taslağı, (b) V3 satıcı eşya editörü (Node referansında), (c) V-POLL sorgu modu.

---

## 11. Ekler

### 11.1 Olasılık bazlı playtest (özet)
Kesin beklenen değerler (d20'nin 20 yüzü tek tek). X=100, Y=60, DC 12/15/18, `f = X − a·u/2`.

| u | Bonus | Kritik / Başarı / Başarısız | Tek atış | Temkinli (Rep 3) | Sonuna kadar (Rep 3) | Sinirlenme (Rep 3) |
|---|---|---|---|---|---|---|
| 0,5 | +0 | 20% / 25% / 55% | 80,5 | 72,5 | 70,6 | 16,6% |
| 0,5 | +5 | 45% / 25% / 30% | 71,8 | 64,8 | 63,1 | 2,7% |
| 1,0 | +0 | 5% / 25% / 70% | 83,5 | 78,9 | 82,6 | 34,3% |
| 1,0 | +5 | 30% / 25% / 45% | 76,0 | 69,7 | 68,7 | 9,1% |
| 1,5 | +0 | 5% / 10% / 85% | **82,8** | 80,8 | 94,6 | 61,4% |
| 1,5 | +5 | 15% / 25% / 60% | 78,8 | 75,0 | 78,2 | 21,6% |

Rep 4/3/2 ile "sonuna kadar" deneme: cömert +0 → 67,1 gp (%9,2 sinir), nötr +0 → 82,6 (%34,3), açgözlü +0 → 98,9 (%72,2 sinir). Bulgular: (1) **tersliği doğruladı**: +0 tek atışta açgözlü 82,8, nötr 83,5 gp (başarısızlık fiyatı u ile düşüyor, 85 < 90). Alternatif `f = X − a/(2u)` (80/90/93,3) sıralamayı düzeltir, ama DM `X − a·u/2`'yi seçti. (2) Açgözlü satıcıda "sonuna kadar" denemek cezalandırıcı (%61–72 sinirlenme). (3) Başarı olasılığı her DC'de %25 sabit. (4) Hedef: nötr satıcıda +5 bonusla sinirlenme %15'in altı (şu an %9,1, tamam).

### 11.2 Yapay zekâ DM yardımcısı (ajan talimatı)
Rol: hesapla, sonucu DM'e ver, satıcının repliğini öner. Kuralları kendin değiştirme, kararlar Bölüm 2–3. **Gizlilik:** u ve DC oyunculara söylenmez, satıcı tipini yalnızca başarılı Sez verir, Rep sayısı gösterilmez (çubuk oranı gösterir). Çıktıyı **[DM'e]** (sayılar, DC, Rep) ve **[Masaya]** (oyunculara okunacak anlatım) diye ikiye ayır, Türkçe ve kısa yaz.
Oturum başlangıcı: X, u (ya da d6), DC (12/15/18), Rep (4/3/2). Her teklifte: Y kontrolü (X/4, düşük Y cezası) → G, a → d20 + bonus (zarı sadece istenirse at) → sonuç → Rep 0 ise 1,1×X ve gün yasağı → "zar toplamı vs DC, sonuç, f, kalan Rep" tek satır. Hard Gamble her an, büyülüde yasak, kusurlu kuralları. Zar sonucunu değiştirme, u ve Rep'i söyleme, Rep 0 sonrası aynı gün pazarlığa izin verme.
```
[DM'e]  X 100, Y 60 → G 40, a 20 · u 1.0, DC 15, Rep 3
        d20 11 + 5 = 16 ≥ 15 → Başarı · f = 70 gp · Rep 3
[Masaya] Tüccar dişlerinin arasından bir şey mırıldanıp ellerini açıyor:
        "Yetmiş. Daha aşağısı yok."
```

### 11.3 Masa testi kaydı (şablon)
Hedef: 3 oturum, her satıcı tipiyle en az 3 pazarlık (toplam ≥ 9), en az bir Rep 0 ve bir Hard Gamble.
| # | Satıcı (u) | X | Y | Bonus | d20 | Toplam vs DC | Sonuç (K/B/BS/Ret/HG) | f | Rep sonrası | Oyuncu tepkisi |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
Özet: satıcı tipi başına pazarlık sayısı, ortalama f/X, Rep 0 sayısı, Hard Gamble sayısı.
Gözlem soruları: açgözlü satıcı nötrden zor hissettirdi mi? Oyuncular başarısızlıktan sonra tekrar denedi mi? Hard Gamble ne zaman seçildi? Gün yasağı oyunu tıkadı mı? Sabır çubuğu pazarlığı nasıl etkiledi? Teklif hattı ve Haftalık Pazar anlaşılır mıydı? Ekonomi devredeyse: Dayanma Süresi hedef bandda mı, oyuncular para sıkıntısı çekti mi ya da para değersizleşti mi?

---

## 12. Sürüm günlüğü

Kural: her commit'te ilgili girdi eklenir. Numara: **0.x** geliştirme sürümleri, **v1.0** ilk kararlı hedef. Saatler UTC, tarih 29 Eylül 2026. **En yeni en üstte.**

### 0.11 · medya katmanı ve ESP32 planı (bu commit)
- **Kod:** **V2 medya katmanı:** DM eşya görseli (512 PNG + 128 küçük resim) ve satıcı portresi (768×512 JPEG) yükler, tarayıcıda kırpma ve yeniden kodlama, sunucuda sihirli bayt doğrulaması (yalnız PNG/JPEG, SVG reddedilir), boyut ve piksel sınırı, `/media` sunumu (yol atlatma engelli, `nosniff`), temizleme ve silmede dosya temizliği, oyuncu ekranında görsel/yazı kutusu. **Uyumluluk vektörleri** (`npm run vectors`, 688 vaka, `conformance/haggle-vectors.json`) olası bir ESP32 C++ portunu doğrulamak için. APK: yalnızca `*.ts.net` için HTTP izni (ağ güvenlik yapılandırması). Testler: 40 birim/API/araç + 5 senaryolu tarayıcı testi (görsel yükleme, doğru boyut, kaldırma dahil).
- **Plan:** DM kararı: **sunucu PC'de değil, ESP32 üzerinde** (K20) ve iki ayrı bar teyit edildi. **Düzeltme:** önceki sürümlerde "ESP32'de Tailscale istemcisi doğrulanmadı" yazılmıştı, MicroLink (Tailscale uyumlu ESP32 istemcisi) doğrulandı, ama TCP/HTTP desteği doğrulanmadı. ESP yolu **kanıt çalışmasıyla** başlar (V-ESP0), Node sunucusu referans ve yedek kalır, Raspberry Pi alternatifi açık tutulur. Yeni aşamalar: V-ESP0, V-POLL, V-ESP1. Görsel yükleme kararı: sunucu görüntü işlemez (ESP'ye taşınabilir).

### 0.10 · yakınlık, Tailscale erişimi, masaüstü düzeni (797b3b3)
- **Kod:** **Yakınlık sistemi**: oyuncu × satıcı 0–100, 5 seviye, kazanç/kayıp ve haftalık tavan, DC indirimi (kritik eşiğiyle birlikte), Dost'ta +1 başlangıç sabrı, **kilitli eşya** (ad ve fiyat sızmaz, işlem reddedilir), DM ±ayar ve eşya başına gereken yakınlık. **İki ayrı bar** pazarlıkta yapışkan (Pazar + Yakınlık), satıcı listesinde ve portrede yakınlık. **`npm run tailscale`** (serve, adres, `--funnel`, `--stop`), **`npm run backup`**, `start.sh`/`start.bat`, **PIN hız sınırı** (5 yanlışta 10 dk; sayaç hatası testle yakalanıp düzeltildi), DM **davet adresi** kartı (kopyala/paylaş). **Masaüstü düzeni** (≥ 900 px iki bölme, klavye). Defter: oyuncu/tür süzgeci ve **CSV** (`/api/ledger.csv`). Varsayılan veri yolu `app/data/data.json`. Testler: 33 birim/API/araç (sahte `tailscale` komutu dahil) + 4 senaryolu tarayıcı testi (4 genişlikte taşma yok, iki sütun, iki bar, klavye).
- **Plan:** cevaplar işlendi: iki ayrı bar (anlık Pazar + uzun vadeli Yakınlık), ekonomi için önerilen varsayılanlar onaylandı (K15), kodlamaya başlama onayı. V1, V1b, V2b tamamlandı, **V2 sıradaki**. QR kodu ertelendi. Gerçek Tailscale'de denenmedi.

### 0.9.1 · plan güncellemesi (yalnızca doküman, 471c2c3)
- **Plan:** erişim **Tailscale** (PC ve mobil, `tailscale serve` ile HTTPS, MagicDNS kalıcı adres) kararlaştı, Cloudflare Tunnel ve Render gereksiz. **ESP32 sunucu olamaz**, hep-açık için Raspberry Pi sınıfı cihaz. **Masaüstü düzeni** (V1b) eklendi. ComfyUI kurulu değil, kart 6 GB: kurulum V7'nin ilk adımı, SD 1.5 ile başlanır. Tezgâh kuralları DM'in ayarı, ücret istenirse hiç alınmaz. Dış oyuncu uygulaması (Electron) ve `/api/v1`, webhook, bildirimler **ertelendi**. Ekonomi **isteğe bağlı modül**, varsayılan kapalı. Sürümleme: hedef sürümler v1.0/v1.1/v1.2/v2.0/v2.1 olarak yeniden düzenlendi. Sürüm günlüğü eklendi.
- **Kod:** yok.

### 0.9 · tema, defter, tek doküman (91ea907, 12:06)
- **Kod:** tema daha karanlık, eşya görsel alanı büyük (raf 2 sütun, pazarlıkta 210 px, çanta 3 sütun), **sabır çubuğu** pazarlık ekranında yapışkan ve DM canlı ekranında, **emoji kaldırıldı** (görsel alanları yazı kutusu), **alışveriş defteri** (oyuncu "Harcama kaydı", DM "Defter" sekmesi, DM altın ayarları da kayıtlı). Sunucu sabır bilgisini (rep, maxRep) oyuncuya gönderir, DC ve tip gitmez. 19 test.
- **Plan:** tüm `.md` dosyaları **PROJE.md** altında birleşti. **Ekonomi ve endeksler** eklendi (fiyat düzeyi, ekmek/sepet endeksi, dayanma süresi, gider kalemleri). Sabır çubuğunun tip sızdırma ödünü kabul edildi (K16).

### 0.8.1 · tema ilk geçiş ve genişleyen kapsam (1b879cf 11:53, b890a16 11:55)
- **Kod:** karanlık tema ilk geçiş (portre penceresi, künye plakası, raf, filtreler, çanta ızgarası, simgeli çubuk).
- **Plan:** uzaktan/eşzamansız oyun (CRM gibi), **RTX 2060** ile yerel üretim, **oyuncu tezgâhları**, dış uygulamayla ileride entegrasyon için hazırlık (defter).

### 0.8 · v2 planı (eefd62f 11:39, d45acca 11:45, 5f0f1a2 11:48)
- **Plan:** konuşan portre (5 ağız karesi), eşya kütüphanesi, telif çerçevesi. Yerel çalışma, ticari değil, **Crooked Moon lisanslı**, gerçekçi fantazi stili. Satıcının kendi eşyası ve görseli. Görsel otomasyonu (subagent'lar). **Google Görseller kazıma reddedildi** (şartlara aykırı, resmî API yeni müşteriye kapalı), yerine yerel üretim ve lisanslı kaynaklar. Depo herkese açık olduğu için telifli dosya depoya girmez.
- **Kod:** yok.

### 0.7 · Android kabuğu (a6550c3 11:16, 650a328 11:22)
- **Kod:** `android/` WebView kabuğu (adres sorar, JS `prompt/confirm` köprüsü, "Sunucu adresi" düğmesi), GitHub Actions APK derlemesi (başarılı), Render notları.
- **Plan:** Android araçları `dl.google.com` üzerinde, ağ politikası engelliyor: derleme CI'da. Depo herkese açık olduğu için APK herkese açık Release yapılmadı, artifact olarak kaldı.

### 0.6 · Render hazırlığı (e18e384, 11:14)
- **Kod:** sertleştirilmiş Dockerfile (non-root, sağlık kontrolü, `/data`), `render.yaml`, üretimde `DM_PIN` zorunlu, PIN log'a yazılmaz.
- **Plan:** Render ücretsiz planda kalıcı disk yok notu. (Sonra Tailscale kararıyla gereksiz oldu.)

### 0.5 · teklifler ve Haftalık Pazar (00d2444, 11:11)
- **Kod:** CRM tarzı teklif hattı (Yeni → Karşı teklif → Anlaşıldı → Teslim), özel istek, DM'in oyuncuya teklif göndermesi, Haftalık Pazar (toplu teslim, hafta ilerler), 5 API testi.
- **Plan:** "haftalık pazar" ve teklif hattı kapsama girdi.

### 0.4 · canlı telefon uygulaması (cff56ee, 11:06)
- **Kod:** Node sunucusu (SSE, kalıcı durum, sunucu zarı), kural motoru JS'e taşındı (12 test), PWA istemci, 6 karakter, pazarlık, DM canlı ekranı ve yönetimi, iki telefonlu tarayıcı testi.
- **Plan:** **yön değişikliği**: Python komut satırı yerine çok oyunculu, DM'li mobil uygulama.

### 0.3 · plan ve kararlar (8bb166e 10:45, 3f93e70 11:00)
- **Plan:** aşamalı plan. Kararlar: başarısızlık `f = X − a·u/2`, DC 12/15/18, Rep 4/3/2, Y < X/4 zarsız ret, aynı/yüksek Y ile tekrar, düşük Y Rep −1, Rep 0 gün yasağı, Hard Gamble her an (büyülüde yasak).
- **Kod:** doküman güncellemeleri, referans kartı, ajan talimatı, masa testi şablonu.

### 0.2 · DM paketi ve playtest (f8dd2f8 10:06, fb4072c 10:07)
- **Plan:** DM paketi (kurallar + soru listesi), referans kartı, olasılık playtest'i, ajan talimatı. **Bulgu:** orijinal başarısızlık formülü u=0,5'te f=Y verir (terslik), alternatifler çıkarıldı.
- **Kod:** Python kodu silindi (kullanıcının açık onayıyla), yalnızca doküman kaldı.

### 0.1 · ilk motor (4a83e28, 09:36)
- **Kod:** Python kural motoru, komut satırı arayüzü, 17 test. Kaynak: kullanıcının verdiği "D&D 5e Dynamic Haggle & Bargain System" belgesi.

