# Pazar — D&D Pazarlık ve Ekonomi Uygulaması

**Tek doküman.** Bundan sonra kurallar, kararlar, plan, kullanım ve test notları yalnızca burada tutulur. Ayrı `.md` dosyası açılmaz.
Eski dosyalar (DM_PAKETI, REFERANS_KARTI, OYUN_TESTI, DM_AGENT, TEST_KAYDI, PLAN, PLAN_V2, app/README) bu dosyada birleştirildi, git geçmişinde durur.

İçindekiler: 1 Durum · 2 Kararlar · 3 Oyun kuralları · 4 Uygulama (kullanım, yayın, APK) · 5 Tema · 6 Ekonomi ve endeksler · 7 v2 özellikleri · 8 Aşamalar · 9 Riskler · 10 Açık sorular · 11 Ekler (playtest, ajan talimatı, masa testi kaydı)

---

## 1. Durum

**Çalışan (v1):** kural motoru, canlı sunucu (DM + oyuncular, SSE), 6 karakter, pazarlık (zar, sabır, Hard Gamble, Sez), teklifler (CRM hattı) ve Haftalık Pazar, **alışveriş defteri**, karanlık tema, Android WebView kabuğu, Render dosyaları. 19 birim/API testi ve 3 senaryolu tarayıcı testi geçiyor. Kod: [app/](app/), [android/](android/).

**Bu turda yapılanlar:** tema daha karanlık, **eşya görselleri büyük** (rafta 2 sütun), **sabır çubuğu her zaman görünür** (pazarlık ekranında yapışkan), **emoji kaldırıldı** (görsel alanları yazı kutusu), **alışveriş defteri** (oyuncu "Harcama kaydı", DM "Defter" sekmesi).

**Sıradaki:** V1 (uzaktan erişim, tünel) → V2/V2b (medya, defter genişletme, `/api/v1`) → V3/V3b (satıcı ve oyuncu eşya üretimi, oyuncu tezgâhı) → ekonomi motoru (Bölüm 6). Ayrıntı Bölüm 8.

**Bilinen davranış (DM kabul etti):** başarısızlık fiyatı u arttıkça düşer (95/90/85 gp, X=100 Y=60); açgözlü satıcı ortalamada nötrden ucuz satabilir. Masa testinde izlenecek.

---

## 2. Kararlar

| # | Karar | Durum |
|---|---|---|
| — | Başarısızlık formülü `f = X − a·u/2`, DC 12/15/18, Rep 4/3/2 | ✅ |
| — | Y < X/4 zarsız ret, Rep −1. Önceki tekliften düşük Y Rep −1. Aynı ya da yüksek Y serbest | ✅ |
| — | Rep 0: 1,1×X, satıcı o gün o oyuncuyla hiçbir alışverişte pazarlık yapmaz | ✅ |
| — | Hard Gamble her an (büyülüde yasak), f = 0,5×X, eşya kusurlu ve satılamaz | ✅ |
| K1 | Sunucu DM'in bilgisayarında. Oyuncular uzaktan (eşzamansız, CRM gibi). Erişim: Cloudflare Tunnel (öneri) ya da Tailscale, LAN yedek | ✅ |
| K2 | Depolama yerel disk: `app/media/`, `app/data/`. Bulut gerekmez | ✅ |
| K3–K4 | Portre ve eşya stili gerçekçi fantazi | ✅ |
| K5 | Eşya PNG 512 + 128 küçük resim (saydam). Portre PNG sprite (5 kare) | ✅ |
| K6 | Tünel HTTPS verdiği için APK `https://` ile çalışır. LAN `http://` için cleartext izni ayrı seçenek | ✅ |
| K7 | Kaynak dosyalar (Crooked Moon paketi, 5e.tools kopyası) nerede | ⬜ DM |
| K8 | Satıcı kendi eşyasını üretir, kendi görselini yükler. `owner` = satıcı ya da oyuncu | ✅ |
| K9 | RTX 2060 ile yerel üretim (6 GB ise SD 1.5, 12 GB ise SDXL Turbo da olur). Yardımcı: Openverse/Wikimedia, DM'in kendi görselleri | ✅ (bellek ⬜) |
| K10 | Görsel otomasyonu Claude Code subagent'larıyla, DM onayından geçer | ✅ |
| K11 | Tema: çok karanlık, Darkest Dungeon ağırlıklı, mobil, emoji yok | ✅ |
| K12 | Ayrı bir D&D oyuncu uygulamasıyla ileride entegrasyon | ✅ (ayrıntı ⬜) |
| K13 | Oyuncular da tezgâh açar. Ücret, büyülü eşya, onay kuralları | ⬜ DM |
| K14 | Altın ve çantanın esas kaynağı (dış uygulama mı, Pazar mı, eşitleme mi) | ⬜ |
| K15 | Ekonomi: fiyat düzeyi, endeksler, gider kalemleri (Bölüm 6) | ⬜ DM parametreleri |
| K16 | Sabır çubuğu oyuncuya oran olarak gösterilir. DC ve satıcı tipi gizli kalır | ✅ |

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
DM_PIN=1234 node server.js        # http://localhost:3000, bağımlılık yok (Node 18+)
npm test                          # 19 birim/API testi
npm run e2e                       # iki telefonlu tarayıcı testi (playwright gerekir)
```
DM için giriş ekranında **Ben DM'im** + PIN. Üretimde (`NODE_ENV=production`) `DM_PIN` zorunlu, yoksa sunucu başlamaz.

### Nasıl çalışır
Sunucu her zarı atar (oyuncu sayı görmez). Durum `app/data.json`'da tutulur. Canlı güncelleme SSE ile. Oyuncu kendi adıyla girer (aynı ad aynı oyuncuya bağlanır, masa içi kolaylık, güvenlik değil).

**Oyuncu:** karakter seç → satıcı → raf → eşya → teklif kaydırıcısı ve yaklaşım (İkna/Blöf/Gözdağı) → **Pazarlık Et**. Pazarlık ekranında üstte **sabır çubuğu** (Sakin / Huzursuz / Sinirli / Bitti, oran gösterir). Sonrasında Satın Al, tekrar dene, Sez, Hard Gamble. Çantada 18 slot ve **harcama kaydı**.
**DM:** Canlı (pazarlıklar, sabır, hızlı replik, fiyat sabitleme), Teklif (CRM panosu), Pazar (satıcı ve eşya yönetimi), Kişi (altın, avantaj, teklif gönder), **Defter** (tüm altın hareketleri, toplamlar), Yeni Gün.

### Teklifler (CRM) ve Haftalık Pazar
Aşamalar: Yeni (DM bekleniyor) → Karşı teklif (cevap oyuncuda) → Anlaşıldı (Pazar gününde teslim) → Teslim edildi. Kapananlar: Reddedildi, Geri çekildi, Teslim olmadı. Oyuncu teklif bırakır (katalog ya da özel istek), DM kabul / karşı teklif (kural önerisiyle: Y + a·u/2) / reddet, ya da oyuncuya teklif gönderir. Teklifte zar yok. Katalog eşyasında teklif etiketin altında ve en az %25'i, oyuncunun en çok 10 açık teklifi olur.
**Haftalık Pazar** (DM): anlaşılanları teslim eder (altın düşer, eşya çantaya girer, stok azalır; altın yetmezse ya da eşya tükenmişse "Teslim olmadı"), hafta ve gün ilerler, pazarlıklar ve yasaklar sıfırlanır, cevap bekleyen teklifler kalır.

### Alışveriş defteri (yapıldı)
Her altın hareketi kaydedilir: `{ t, hafta, gün, tür (alım, hard gamble, teklif teslimi, DM), oyuncu, satıcı, eşya, tutar (− harcama, + gelir), etiket }`. Oyuncu kendi kayıtlarını, DM hepsini ve toplamları görür. DM'in altın ayarları da deftere yazılır (ekonomideki "kaynak" tarafı). Ekonomi motorunun (Bölüm 6) veri kaynağı budur.

### Render'a yayın
`render.yaml` ve `app/Dockerfile` hazır: Render → **New → Blueprint** → repo. Panelde **`DM_PIN`** gir. Kalıcı disk ücretli plan ister (starter), ücretsiz planda uyanınca pazar sıfırlanır. Sağlık kontrolü `/api/chars`. Docker imajı bu ortamda derlenemedi, aynı ortam değişkenleriyle `node server.js` doğrulandı. Kendi sunucunda: `docker build -t pazar app && docker run -p 3000:3000 -e NODE_ENV=production -e DM_PIN=xxxx -e PORT=3000 -v pazar-data:/data pazar`. Yerel çalışma tercih edildiği için Render şu an beklemede.

### Android APK
`android/` ince bir WebView kabuğu (oyun mantığı sunucuda). GitHub Actions derler (`.github/workflows/apk.yml`, derleme başarılı). **İndir:** GitHub → Actions → APK → son çalışma → Artifacts → `pazar-apk` (giriş gerekir, 90 gün). **Yeniden derle:** Run workflow, Render adresini kutuya yazarsan APK'ya gömülür. Kur: bilinmeyen kaynaklara izin ver, debug imzalıdır. İlk açılışta adresi sorar, giriş ekranındaki **Sunucu adresi** düğmesiyle değişir. Yalnızca `https://` (`usesCleartextTraffic=false`). DM'in `prompt/confirm` pencereleri köprülü. **Cihazda henüz denenmedi.** Android araçları `dl.google.com` üzerinde, bu ortamın ağ politikası engelliyor, o yüzden derleme CI'da.

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

**Sabır çubuğu:** pazarlık ekranında **yapışkan**, en üstte, Sakin (altın) → Huzursuz (kehribar) → Sinirli (kırmızı, titrek) → Bitti. Sayı ve segment göstermez, oran gösterir. **Not:** düşüş adımından satıcı tipi tahmin edilebilir (Rep 2'de ilk düşüş yarım çubuk, Rep 4'te dörtte bir). Sez mekaniği tipi *adıyla* verdiği için değerini korur, ama çubuk onu zayıflatır. Kabul edilen bir ödün (K16).

**Bitiş ölçütleri:** 360–430 px genişlikte yatay kaydırma yok, dokunma hedefleri ≥ 44 px, metin kontrastı okunaklı. Tema tek CSS dosyasında değişkenlerle.
**Cila (sonra):** rarite çerçevesi, konuşan portre, piksel sayaç yazı tipi, ses ve titreşim (isteğe bağlı).

---

## 6. Ekonomi ve endeksler (Özellik G)

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

### Aşamalar
V13 Ekonomi motoru (P, kategoriler, haftalık güncelleme) · V14 Endeks ekranı ve grafik · V15 Geçim gideri ve bakım · V16 DM olayları ve simülatör. Karar gerekir: K15 (yaşam tarzı ücretleri kullanılsın mı, enflasyon oyunculara açık mı, α, λ, M_ref, aşınma sistemi var mı).

---

## 7. v2 özellikleri

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
**Hat (`/item-images run`):** (1) **İsim kuyruğu** yerel 5e.tools/SRD'den, `queue.json`, kaldığı yerden devam. (2) **`item-image-finder`**: 20'lik gruplarla adayları toplar, `staging/`'e koyar (≤4 aday), kaynak URL/lisans/sorgu manifeste. (3) **`item-image-judge`**: adayları görerek değerlendirir (doğru eşya mı, tek nesne mi, gerçekçi fantazi mi, yazı/filigran/çerçeve yok mu, ≥512 px), seçer ya da reddeder, reddedilen üretime gider (≤2 deneme). (4) **`item-image-processor`**: 512 PNG + 128 küçük resim, arka plan silme (`rembg` benzeri), kırp-ortala, kayıt. (5) **DM onay ekranı**: seçilen ve alternatifler yan yana, onayla / başkasını seç / kendi görselini yükle / yeniden üret. Onaysız görsel oyunculara görünmez. (6) Rapor.
**Yerel ve özel:** görseller `app/media/`'da, `.gitignore`'da, `purge --source` ile toplu silinir, APK görsel paketlemez.
**Bitiş:** 50 adlık partide her ad için görsel ya da tür ikonu, judge kötü adayları (filigranlı, çok nesneli, yazılı) reddeder, kuyruk kesilip yeniden başlayınca sürer, depoda görsel/veri/manifest yok.

### E. Oyuncu tezgâhları
Oyuncu **Tezgâhım**'da çantasından eşya listeler (listelenince rezerve, çift satış olmaz). Alıcı tam fiyata alır (Pazar gününde teslim) ya da teklif verir, teklifi **tezgâh sahibi** cevaplar, aynı CRM hattı. Haftalık Pazar oyuncu anlaşmalarını da teslim eder (altın alıcıdan satıcıya, ücret düşülür; altın yetmezse ya da eşya rezervede değilse "Teslim olmadı").
| Konu | Kural | Durum |
|---|---|---|
| Zar | Yok, sadece teklif hattı | ✅ öneri |
| Pazar ücreti | Satıştan %5 DM kasasına (ayarlanır 0–20) | ⬜ |
| Büyülü eşya | DM oyuncu başına açar/kapatır, varsayılan kapalı, tek tek onay | ⬜ |
| Kusurlu eşya | Satılamaz | ✅ |
| Oyuncu üretimi | Yayın öncesi DM onayı, haftada N sınırı | ⬜ |
| Fiyat sınırı | Katalog eşyada etiketin %25–%400'ü (DM aşabilir) | ⬜ |
| Kendine satış / çete | Kendi tezgâhından alamaz, iki oyuncu arası haftalık sınır, DM denetim günlüğü | ✅ öneri |
| DM yetkisi | Tezgâhı kapatır, anlaşmayı iptal eder, tüm listeleri görür | ✅ |
**Bitiş:** iki oyuncu arası listele → teklif → kabul → Haftalık Pazar doğru el değiştirir, toplam altın (oyuncular + ücret) korunur (birim testi), eşya iki kez satılamaz, yetkisiz kişi başkasının tezgâhını değiştiremez, DM günlükte her el değişimini görür.

### F. Dış D&D oyuncu uygulamasıyla entegrasyon (ileride)
Bugünden alınacak kararlar: **`/api/v1` ve OpenAPI dosyası** baştan · oyuncu kaydında **`externalId`** · **tek defter** (tüm altın/eşya değişimleri buradan geçer, bugün var) · imzalı **webhook**'lar (`purchase.settled`, `offer.updated`, `stall.updated`, `gold.changed`) · **gömülü mod** (`?embed=1`, `postMessage`) · dış çağrılar için API anahtarı/JWT. Tek doğruluk kaynağı seçenekleri: dış uygulama esas, Pazar esas, ya da olay tabanlı eşitleme (K14). Gerçek entegrasyon dış uygulama belli olunca ayrı aşama (V12).

### Uzaktan erişim (V1)
| Yol | Artı | Eksi |
|---|---|---|
| **Cloudflare Tunnel** (öneri) | Oyuncuya kurulum yok, HTTPS (PWA/APK sorunsuz), güvenlik duvarı yok | Hızlı tünelde adres her açılışta değişir |
| Tailscale | Kapalı ağ, kalıcı adres | Herkes kurar |
| LAN | Ek araç yok | Sadece aynı ağ, `http://` |
| Bulut | DM kapalıyken de açık | Ücret, yerel tercihle çelişir |
`npm run tunnel`: `cloudflared` kontrolü, tünel, davet bağlantısı ve QR. Tünel herkese açık adres olduğu için **güçlü PIN ve yanlış denemede hız sınırı** şart. Teklifler DM çevrimdışıyken bırakılabilir ama **DM'in bilgisayarı (sunucu) açık olmalı**, kapalıysa kimse bağlanamaz (kalıcı çözüm hep-açık mini PC ya da bulut). Bildirimler (Web Push / APK yerel) isteğe bağlı, V11.
Yedek: `npm run backup` (`app/data/` + `app/media/` zip). Başlatma: `npm start`, `start.bat`, `start.sh`.

---

## 8. Aşamalar

| Sürüm | Aşama | İş | Boyut | Durum |
|---|---|---|---|---|
| v1 | Kural motoru, sunucu, arayüz, teklifler, Haftalık Pazar, APK kabuğu | Bölüm 1 | — | ✅ |
| v1 | Tema (karanlık, büyük görsel alanı, sabır çubuğu, emoji yok) ve **temel alışveriş defteri** | Bölüm 4–5 | M | ✅ |
| — | **V0** Karar kilidi | K7, RTX 2060 belleği, tünel türü, K13, K14, K15 | S | ⬜ |
| v1.1 | **V1** Uzaktan erişim | `npm run tunnel`, davet+QR, PIN hız sınırı, yedek, başlatma betikleri | M | ⬜ |
| v1.1 | **V2** Medya katmanı | `/api/media` (boyut, tür, yeniden kodlama, kare kırpma), yerel disk, önbellek | M | ⬜ |
| v1.1 | **V2b** Defter genişletme ve `/api/v1` | defter tüm hareketler, OpenAPI, `externalId`, webhook | M | ⬜ |
| v1.1 | **V3** Satıcı eşya üretimi | editör, kendi görseli, varyant, `owner` | M | ⬜ |
| v1.1 | **V3b** Oyuncu tezgâhı | rezerve, oyuncu teklif hattı, teslim, ücret, denetim, onay kuyruğu | L | ⬜ |
| v1.1 | **V4** Portre + ağız kareleri | yükleme, yüz işareti + ağ deformasyonu, yedek yol, önizleme | L | ⬜ |
| v1.1 | **V5** Konuşma animasyonu | metin → kare, satıcı/alıcı portreleri, avatar | M | ⬜ |
| v1.2 | **V6** Kütüphane çekirdeği ve 5e.tools verisi | model, `open` kaynağı, `local-5etools`, eşleştirme, "Hakkında" | L | ⬜ |
| v1.2 | **V7** Görsel bulucu otomasyonu | kuyruk, finder/judge/processor, `generate-local` (20 eşyalık kıyas önce), Openverse/Wikimedia | L | ⬜ |
| v1.2 | **V8** DM seçici, onay ekranı, şablonlar | ızgara, süzgeç, otomatik doldurma, görsel onay kuyruğu | L | ⬜ |
| v2.0 | **V9** Crooked Moon | 26 eşya içe aktarım ya da elle | S | ⬜ |
| v2.0 | **V10** APK ve sürüm | `versionCode 2`, görsel önbelleği, cihazda test | M | ⬜ |
| v2.x | **V11** Bildirimler | cevap gelince bildirim | M | ⬜ |
| v2.x | **V12** Dış uygulama entegrasyonu | K12/K14 sonrası | L | ⬜ |
| v2.x | **V13–V16** Ekonomi | motor, endeks ekranı, geçim gideri/bakım, olaylar ve simülatör (Bölüm 6) | L | ⬜ |

**Sıra:** V1–V2b temel. V3 ve V3b medya ve defterden hemen sonra (kütüphane olmadan da işe yarar). Portre (V4–V5) ve kütüphane (V6–V8) bağımsız ilerler. Ekonomi (V13+) defterin genişlemesine dayanır, V2b'den sonra herhangi bir zamanda başlayabilir. V12 ancak K12/K14 netleşince.

**Genel testler:** birim (viseme, slug, eşleştirme, rarite fiyatı, medya, ekonomi formülleri), API (sınırlar, yetki, yeniden kodlama, defter tutarlılığı), tarayıcı Playwright (portre yükle → kare değişti; kütüphaneden seç → pazarda görsel; iki oyuncu arası satış). Bütçe: ilk yükleme < 500 KB (görsel hariç), portre sprite < 1 MB, eşya küçük resmi < 15 KB.

---

## 9. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Telifli dosyanın depoya girmesi | Takedown | `.gitignore`, `git ls-files` denetim testi, kaynak+lisans kaydı |
| Ağ deformasyonu bazı resimlerde kötü (saç, sakal, profil, maske, tusk) | Kötü kare | İnce ayar, 2 dokunuş yolu, "animasyonu kapat" |
| Web görsellerinde düşük isabet (fantazi eşyalar) | Yanlış görsel | Judge, DM onayı, üretime düşme |
| RTX 2060 6 GB ile SDXL yavaş | Süre uzar | SD 1.5, 20 eşyalık kıyas, gece çalıştırma |
| Google Görseller'e bağımlılık | Şart ihlali, kapanan API | Kurulmaz |
| Subagent hatalı görsel seçer | Yanlış eşya | Ret nedeni, onay kuyruğu, onaysız görünmez |
| Kullanıcı görseli zararlı dosya olabilir | Güvenlik | Yeniden kodlama, boyut/tür sınırı, yalnız DM yükler (tezgâhta DM onayı) |
| Oyuncular arası altın aktarımıyla sömürü | Denge bozulur | Ücret, fiyat sınırı, çift sınırı, denetim günlüğü, DM iptali |
| Rezerve/teslim yarışması, eşya iki kez satılır | Kayıp eşya/altın | Rezerve, tek defter, teslimde yeniden doğrulama, testler |
| Dış uygulamanın modeli bilinmiyor | Uyumsuzluk | Sürümlü API, defter, `externalId`, K14'ü erkene almak |
| Tünel adresi değişir, herkese açık | Bağlanamama, yetkisiz DM denemesi | Davet bağlantısı yenileme, güçlü PIN, hız sınırı, gerekirse adlandırılmış tünel |
| DM'in bilgisayarı kapalı | Teklif bırakılamaz | Bilinen sınır, hep-açık mini PC/bulut |
| Sabır çubuğu satıcı tipini sızdırır | Sez zayıflar | Oran gösterimi, kabul edilen ödün (K16) |
| Enflasyon parametreleri kötü ayarlı | Para ya değersiz ya da imkânsız pahalı | ±%5 haftalık sınır, simülatör, DM elle ayar, uyarı bantları |
| Gider kalemleri oyunu bunaltır | Sıkıcı muhasebe | Sadeleştirilmiş varsayılanlar, kalemleri DM açar/kapatır, tek "Yeni Hafta" özeti |
| `http://` LAN'da PWA çalışmaz | Kurulumsuz deneyim | Tünel HTTPS, oyuncular için APK |
| Foundry paket yapısı beklenenden farklı | İçe aktarma çalışmaz | `local-folder` ve `manual` yedekleri, V0'da doğrulama |

---

## 10. Açık sorular (DM)

1. **RTX 2060 kaç GB?** 6 mı 12 mi? ComfyUI/Automatic1111 kurulu mu?
2. **5e.tools:** yerelde `items.json` gibi bir kopya var mı, yoksa siteden kendiniz indirip klasöre koyabilir misiniz?
3. **Oyuncu tezgâhı kuralları:** %5 ücret, büyülü eşya varsayılan kapalı, üretimde DM onayı, fiyat sınırı %25–%400 uygun mu?
4. **Crooked Moon:** Foundry'de kurulu paket mi, PDF/D&D Beyond mi? (PDF ise 26 eşya için elle giriş en kısa yol.)
5. **Portreler:** hazır gerçekçi fantazi portreler var mı, kendiniz mi üreteceksiniz? Ağız kapalı, önden bakan çekim lazım.
6. **Erişim:** Cloudflare Tunnel mi, Tailscale mi? DM'in bilgisayarı oyun dışında açık kalabilir mi?
7. **Dış oyuncu uygulaması:** adı, web/mobil, kim geliştirdi, altın ve çantayı orada mı tutuyor, kimlik doğrulaması, API/dışa aktarım? (K14)
8. **Ekonomi (K15):** 5e yaşam tarzı giderleri kullanılsın mı? Enflasyon ve endeksler oyunculara açık mı? Silah/zırh aşınma sistemi olsun mu? Başlangıç parametreleri (α=0,4, λ=0,3, Dayanma Süresi bandı 20–60 gün) uygun mu, referans servet (M_ref) ne olsun?
9. **Sabır çubuğu:** amaç pazarlıktaki satıcı sabrı mıydı? Yoksa oyuncunun satıcılarla uzun vadeli **itibarı** (indirim/erişim) da istenir mi? Onu ayrı bir özellik olarak planlarım.
10. **Sıradaki adım:** V1–V2b'yi (uzaktan erişim, medya katmanı, defter ve `/api/v1`) kodlamaya başlayayım mı?

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
