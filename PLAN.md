# Aşamalı Plan

Durum: **Aşama 1 devam ediyor.**

| Aşama | Ad | Durum | Çıktı |
|---|---|---|---|
| 0 | Taslak paket | ✅ Bitti | `DM_PAKETI.md`, `REFERANS_KARTI.md`, `OYUN_TESTI.md`, `DM_AGENT.md` |
| 1 | Tasarım kilidi | 🔄 Başladı | Karar çizelgesi (aşağıda), DM'in onayı |
| 2 | Kararları uygulama | ⏳ | Güncel paket, kart ve ajan dosyası, yeniden çalıştırılmış olasılık testi |
| 3 | Masa testi | ⏳ | 3 oturumun kayıtları |
| 4 | Revizyon | ⏳ | DC ve Rep ayarı, v1.0 |

---

## Aşama 1 — Tasarım kilidi

**Amaç:** `DM_PAKETI.md` içindeki tüm `____` alanları ve formül kutusu kapanır.
**Bitiş ölçütü:** Aşağıdaki tabloda her satırda bir karar var. Öneri kabul edilmişse "Onay" sütunu ✅ olur.

### Engelleyici kararlar (Aşama 2 bunlara bağlı)

| # | Karar | Öneri | Gerekçe (`OYUN_TESTI.md`) | Onay |
|---|---|---|---|---|
| F | Başarısızlık formülü | **f = X − a/(2u)** (80 / 90 / 93.3 gp) | Sıralama her bonusta cömert < nötr < açgözlü. u = 0.5'te (X+Y)/2 verir. | ⬜ |
| 7 | DC | **12 / 15 / 18** sabit | 10 + 5u yarım sayı veriyor (12.5, 17.5). Sabit değer kartta daha hızlı. | ⬜ |
| 11 | Başlangıç Rep | **4 / 3 / 3** | Açgözlüde Rep 2 ile sinirlenme %72 (+0 bonus). Rep 3'te %61. | ⬜ |
| 4 | Ucuz teklifte Rep | Y < X/4 → zarsız ret, **Rep −1**. Alt sınırın hemen üstü normal zar | Ajan dosyası şu an bu karara bakıyor. | ⬜ |
| 10 | Tekrar deneme | **Evet**, aynı ya da daha yüksek Y ile. Daha düşük Y → Rep −1 | Aksi halde "sonuna kadar" stratejisi ucuz teklifle sömürülür. | ⬜ |
| 12 | Rep 0 yasağı | O eşya için **bir oyun günü** (ertesi gün sıfırlanır) | Tüm alışveriş yasağı çok sert, kalıcı yasak hikâyeyi bozar. | ⬜ |
| 13 | Hard Gamble zamanı | Pazarlıktan önce ya da Rep 0 iken. Satıcı gerekçesi: stoktaki kusurlu parti | Zaten kart ve ajan dosyasında böyle. | ⬜ |

### Ayrıntı kararları (DM sonra da doldurabilir)

| # | Öneri |
|---|---|
| 1 | X kitap fiyatıdır. DM bölge ve nadirlikle ±%20 oynatabilir. |
| 2 | Sp ve cp kullanılır, en yakın cp'ye yuvarlanır. |
| 3 | %25 alt sınır sabit. |
| 5 | Tanışınca d6 ile belirlenir (1–2: 0.5, 3–4: 1.0, 5–6: 1.5). Önemli tüccarlar DM seçer. |
| 6 | Insight DC 15 ile u'nun tipini (cömert / nötr / açgözlü) sezer, sayıyı değil. |
| 8 | Deception aynı tabloyu kullanır, ama yakalanırsa Rep −2. Intimidation başarısızlığında Rep −2. |
| 9 | Ortak dil, önceki iyilik, ölçülü rüşvet: her biri advantage. En fazla bir advantage sayılır. |
| 14 | Kusurlu silah doğal 1'de kırılır. Kusurlu zırh −1 AC. Aletler ve araçlarda dezavantaj yok. |
| 15 | Büyülü eşyada Hard Gamble yasak. Sıradan eşyada serbest. |

### Aşama 1 adımları
- [x] Öneri çizelgesi hazırlandı (bu dosya).
- [ ] DM engelleyici 7 kararı onaylar ya da değiştirir.
- [ ] DM ayrıntı kararlarını onaylar (ya da varsayılana bırakır).

---

## Aşama 2 — Kararları uygulama
- [ ] `DM_PAKETI.md`: `____` alanları doldur, formül kutusunu işaretle, örnek tabloyu ve bölüm 6 notunu güncelle.
- [ ] `REFERANS_KARTI.md`: ⚙️ işaretlerini kaldır, DC, Rep ve başarısızlık sütununu güncelle.
- [ ] `DM_AGENT.md`: "karar yoksa" dallarını kararla değiştir, Insight, Deception, advantage ve kusurlu eşya kurallarını ekle.
- [ ] `OYUN_TESTI.md`: seçilen formül, DC ve Rep ile olasılık testini yeniden çalıştır. Tekrar deneme ve Y düşürme kuralı da modellenir.
- **Bitiş ölçütü:** Dört dosya birbiriyle çelişmiyor, `____` ve ⚙️ kalmadı.

## Aşama 3 — Masa testi
- [ ] Test kayıt şablonu (`TEST_KAYDI.md`): satıcı tipi, X, Y, bonus, zar, sonuç, f, Rep, oyuncu tepkisi.
- [ ] 3 oturum, her satıcı tipiyle en az 3 pazarlık (toplam ≥ 9).
- [ ] En az bir Rep 0 ve bir Hard Gamble yaşanır (yaşanmazsa zorla denenir).
- **Bitiş ölçütü:** Her tip için kayıtlı pazarlıklar var, oyuncu geri bildirimi yazılı.

## Aşama 4 — Revizyon ve v1.0
Hedefler (masa verisiyle kontrol edilir):
- Nötr satıcı, +5 bonusla, sinirlenme oranı **%15'in altında**.
- Ortalama fiyat sıralaması her bonusta: cömert < nötr < açgözlü.
- Oyuncu Hard Gamble'ı ara sıra seçiyor. Hiç seçilmiyorsa çok pahalı, hep seçiliyorsa çok ucuz.
- [ ] DC ve Rep değerlerini verilere göre ayarla, dört dosyayı güncelle.
- [ ] Sürüm etiketi `v1.0`.
