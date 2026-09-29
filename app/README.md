# Pazar — DM ile karşılıklı pazarlık uygulaması

Telefonda kurulabilen (PWA) canlı pazar. **DM** pazarı ve satıcıları yönetir, **oyuncular** 6 karakterden birini seçip pazarlık eder. Sunucu sürekli açık kalır, herkes aynı anda bağlanır. Bağımlılık yok (sadece Node 18+).

Kurallar: [../DM_PAKETI.md](../DM_PAKETI.md). Kod bu kurallara göre `engine.js` içinde.

## Çalıştır
```bash
cd app
DM_PIN=1234 node server.js        # http://localhost:3000
npm test                          # kural testleri
npm run e2e                       # iki telefonlu tarayıcı testi (playwright gerekir)
```
Telefonda aç, "Ana ekrana ekle" ile uygulama gibi kur. DM için giriş ekranında **Ben DM'im** + PIN.

## Render'a yayınla
Repo kökündeki `render.yaml` ve `app/Dockerfile` hazır.
1. Render → **New → Blueprint** → bu repoyu ve `ccr-7ab72bbd-hctq3y` dalını (ya da birleştirdiğin dalı) seç.
2. **DM_PIN** ortam değişkenini panelde gir (`sync: false`, repoda saklanmaz). PIN yoksa sunucu üretimde bilerek başlamaz.
3. Deploy bitince adres `https://pazar-xxxx.onrender.com` olur. Oyuncular bunu telefonda açıp "Ana ekrana ekle" yapar.

Notlar:
- **Kalıcı disk** (`/data`, pazarın kaydı) Render'da ücretli plan ister (`starter`). Ücretsiz planda disk yoktur: uygulama uyur, uyanınca pazar seed'e döner. Ücretsiz denemek için `render.yaml` içinde `plan: free` yap ve `disk:` bloğunu sil.
- Sağlık kontrolü `/api/chars`. Canlı bağlantılar (SSE) Render'da çalışır.
- Kendi sunucunda: `docker build -t pazar app && docker run -p 3000:3000 -e NODE_ENV=production -e DM_PIN=xxxx -e PORT=3000 -v pazar-data:/data pazar`

## Android APK
`android/` klasörü sunucuyu tam ekran gösteren ince bir WebView kabuğudur (oyun mantığı sunucuda). GitHub Actions derler ([.github/workflows/apk.yml](../.github/workflows/apk.yml)).

**İndir:** GitHub → **Actions → APK →** son çalışma → **Artifacts → pazar-apk** (giriş gerekir, 90 gün saklanır). Zip'in içinden `pazar.apk` çıkar.
**Yeniden derle:** Actions → APK → **Run workflow**. Render adresini kutuya yazarsan APK'ya gömülür, yazmazsan uygulama ilk açılışta sorar.
**Kur:** Telefona at, aç, "bilinmeyen kaynaklardan kurmaya izin ver". Debug imzalıdır, Play Store için değildir.
**Adres değiştir:** Giriş ekranındaki **⚙️ Sunucu adresi** düğmesi. Bağlantı hatasında da sorar.
Yalnızca `https://` adreslerine bağlanır (`usesCleartextTraffic=false`).

## Oyuncu
1. 6 karakterden birini seç (🗣️ İkna · 🎭 Blöf · 💢 Gözdağı bonusları, başlangıç altını). Adını yaz.
2. Satıcı → eşya → teklifini kaydırıcıyla ayarla → yaklaşımı seç → **Pazarlık Et 🎲**.
3. Sonuçtan sonra: **Satın Al**, tekrar dene, 🔍 **Sez** (satıcının tipi), 🃏 **Hard Gamble** (%50, eşya kusurlu ve satılamaz, büyülüde yok).

Oyuncu sayı görmez: satıcının sabrı sadece 😊 😐 😠 😡, DC hiç gösterilmez. Zarı sunucu atar.

## DM
- **⚔️ Canlı:** aktif pazarlıklar (sabır ❤️, teklif, zar, fiyat). Satıcıya hızlı replik ("Olmaz!", "Son fiyat.", serbest metin) ya da **Fiyat** ile anlaşma sabitle.
- **🏪 Pazar:** satıcı ekle/düzenle (Cömert / Nötr / Açgözlü), eşya ekle (fiyat, büyülü, stok).
- **👥 Oyuncular:** altın ver/al, ⭐ avantaj ver (bir sonraki zar iki kez atılır, yükseği sayılır).
- **Yeni Gün 🌅:** pazarlıkları ve Rep 0 yasaklarını sıfırlar.

## Teklifler — haftalık pazar (CRM gibi)
Pazarlık anlık zarla, teklif ise **hafta boyunca bırakılan yazılı iş**. Her teklifin bir aşaması ve geçmişi var.

**Aşamalar:** ⏳ Yeni (DM bekleniyor) → ↩️ Karşı teklif (cevap oyuncuda) → ✅ Anlaşıldı (Pazar gününde teslim) → 📦 Teslim edildi. Kapananlar: 🚫 Reddedildi, ↩ Geri çekildi, ⚠️ Teslim olmadı.

- **Oyuncu** (📨 Teklif sekmesi): satıcı + eşya (ya da ✍️ *özel istek*, katalogda olmayan) + fiyat + not. DM karşı teklif verirse Kabul, Karşı ya da Geri çek.
- **DM** (📨 Teklif sekmesi): Yeni / Karşı / Anlaşıldı / Kapalı filtreleri. **Kabul**, **Karşı teklif** (kural önerisiyle: Y + a·u/2), **Reddet**, hepsine not yazılabilir. 👥 Kişi ekranındaki **📨 Teklif** düğmesiyle DM de oyuncuya teklif gönderir.
- **Haftalık Pazar 🎪** (DM): anlaşılan tüm teklifleri teslim eder (altın düşer, eşya çantaya girer, stok azalır). Altın yetmezse ya da eşya tükenmişse ⚠️ *Teslim olmadı* olur. Hafta ve gün ilerler, pazarlıklar ve Rep 0 yasakları sıfırlanır. Cevap bekleyen açık teklifler bir sonraki haftaya kalır.
- Katalog eşyasında teklif etiketin altında ve en az %25'i olmalı. Bir oyuncunun en fazla 10 açık teklifi olabilir. Teklifte zar yok, kararı DM verir.

## Kurallar (DM Paketi'nden)
| | Cömert | Nötr | Açgözlü |
|---|---|---|---|
| DC | 12 | 15 | 18 |
| Sabır (Rep) | 4 | 3 | 2 |

Kritik f = Y · başarı f = Y + a·u/2 · başarısız f = X − a·u/2 ve Rep −1 (Blöf/Gözdağı −2) · Y < X/4 zarsız ret Rep −1 · önceki tekliften düşük Y Rep −1 · Rep 0: 1.1 × X ve satıcı o gün o oyuncuyla pazarlık yapmaz.

## Bilinen sınırlar
- Oyuncu girişi sadece ad ile (aynı adla giren aynı oyuncuya bağlanır). Güvenlik değil, masa içi kolaylık.
- Tek pazar, tek DM PIN'i.
