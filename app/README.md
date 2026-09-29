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

## Sürekli açık yayın
Herhangi bir Node ya da Docker barındırıcısı yeter (Render, Fly.io, Railway, kendi sunucun).
- Ortam değişkenleri: `PORT`, `DM_PIN` (**değiştir**), `DATA_FILE` (kalıcı diske işaret etmeli, yoksa yeniden başlatınca pazar sıfırlanır).
- Docker: `docker build -t pazar app && docker run -p 3000:3000 -e DM_PIN=xxxx -v pazar-data:/data pazar`
- HTTPS gerekir (telefonda kurulum ve bağlantı için barındırıcılar bunu verir).

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

## Kurallar (DM Paketi'nden)
| | Cömert | Nötr | Açgözlü |
|---|---|---|---|
| DC | 12 | 15 | 18 |
| Sabır (Rep) | 4 | 3 | 2 |

Kritik f = Y · başarı f = Y + a·u/2 · başarısız f = X − a·u/2 ve Rep −1 (Blöf/Gözdağı −2) · Y < X/4 zarsız ret Rep −1 · önceki tekliften düşük Y Rep −1 · Rep 0: 1.1 × X ve satıcı o gün o oyuncuyla pazarlık yapmaz.

## Bilinen sınırlar
- Oyuncu girişi sadece ad ile (aynı adla giren aynı oyuncuya bağlanır). Güvenlik değil, masa içi kolaylık.
- Tek pazar, tek DM PIN'i.
