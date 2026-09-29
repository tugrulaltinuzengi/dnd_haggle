# D&D 5e Dinamik Pazarlık Sistemi — DM Paketi

Bu doküman pazarlık sisteminin kurallarını ve DM'in doldurması gereken kararları içerir. `____` ile işaretli alanları doldurduktan sonra sistem masada kullanıma hazırdır.

İlgili dosyalar:
- [REFERANS_KARTI.md](REFERANS_KARTI.md) — masada kullanılacak tek sayfalık DM kartı
- [OYUN_TESTI.md](OYUN_TESTI.md) — üç satıcı tipiyle olasılık bazlı deneme sonuçları

---

## 1. Değişkenler

| Sembol | Anlamı | Kim belirler? |
|---|---|---|
| **X** | Satıcının etiket fiyatı | DM |
| **Y** | Oyuncunun teklifi | Oyuncu (alt sınırı DM onaylar) |
| **G = X − Y** | Pazarlık payı | Hesaplanır |
| **a = G / 2** | Yarı yol payı (doğal orta nokta) | Hesaplanır |
| **u** | Satıcının tutumu / zorluk faktörü | DM (gizli) |
| **Rep** | Satıcının sabrı | DM (varsayılan 3) |

### u ön ayarları

| u | Satıcı tipi |
|---|---|
| 0.5 | Cömert / Çaresiz |
| 1.0 | Nötr / Standart tüccar |
| 1.5 | Açgözlü / İnatçı |

DM ara değerler de kullanabilir (ör. 0.8, 1.2).

---

## 2. Akış

1. DM satıcının **X**, **u** ve **Rep** değerlerini belirler.
2. Oyuncu teklifini (**Y**) söyler.
3. Oyuncu **d20 + Persuasion** atar. DC = `____` (bkz. Soru 7).
4. Sonuca göre fiyat (**f**) hesaplanır.
5. Başarısızlıkta Rep 1 düşer. Rep 0 olursa ceza uygulanır.

---

## 3. Zar sonuçları

| Sonuç | Koşul | Fiyat (f) |
|---|---|---|
| **Kritik başarı** | d20 = 20 veya DC + 5 ve üzeri | f = Y |
| **Başarı** | DC tutturuldu | f = Y + a · (u / 2) |
| **Başarısızlık** | DC altı, Rep −1 | f = X − a · (u / 2) *(önerilen düzeltme)* |

### ⚠️ Orijinal formüldeki hata

Orijinal başarısızlık formülü **f = X − a · (1/u)** idi. u = 0.5 için bu formül X − 2a = **Y** sonucunu verir. Yani cömert satıcıda zarı tutturamayan oyuncu tam istediği fiyatı alır ve başarısızlık başarıdan daha iyi bir sonuç olur.

**DM kararı:**
- [ ] Önerilen düzeltme: f = X − a · (u / 2)
- [ ] Başarısızlıkta fiyat X'te kalsın (indirim yok)
- [ ] Başka: `____`

> Oyun testi notu: Önerilen düzeltmede başarısızlık fiyatı satıcı açgözlüleştikçe **düşüyor** (95 → 90 → 85 gp). Testte bu durum ölçülebilir bir terslik yarattı. Bölüm 6'daki nottaki yöne uyan bir alternatif, **f = X − a / (2u)** formülüdür: 80 → 90 → 93.3 gp. Ayrıntılar [OYUN_TESTI.md](OYUN_TESTI.md) dosyasında.

---

## 4. Rep = 0 cezası

- Pazarlık derhal biter.
- Satıcı zam yapar: **f = 1.1 × X**
- Yasağın kapsamı ve süresi Soru 12'de belirlenir.

---

## 5. Hard Gamble (Çaresiz Hamle)

- **Etki:** f = 0.5 × X
- **Bedel:** Eşya *Kusurlu / Damgalı* statüsü kazanır.
  - Hiçbir tüccara satılamaz (0 gp).
  - Sadece kullanılabilir, parçalanabilir (salvage) veya yok edilebilir.
- **Ne zaman kullanılabilir:** Pazarlıktan önce veya Rep = 0 olduğunda (bkz. Soru 13).

---

## 6. Örnek hesaplar

X = 100 gp, Y = 60 gp, G = 40, a = 20

| u | Başarı (Y + a·u/2) | Başarısızlık (X − a·u/2) |
|---|---|---|
| 0.5 | 65 gp | 95 gp |
| 1.0 | 70 gp | 90 gp |
| 1.5 | 75 gp | 85 gp |

Kritik başarı: 60 gp · Rep = 0 cezası: 110 gp · Hard Gamble: 50 gp (kusurlu)

> Not: Açgözlü satıcıda (u = 1.5) başarısızlık fiyatı cömert satıcıdakinden **düşük** çıkıyor. Bu istenen bir davranış değilse başarısızlık formülü u yerine 1/u ile ölçeklenmeli ve u = 0.5'te f ≥ X/2 + Y/2 olacak şekilde sınırlanmalı. Oyun testinde kontrol edilecek.
>
> **Kontrol edildi:** Terslik testte doğrulandı (bkz. [OYUN_TESTI.md](OYUN_TESTI.md)). f = X − a / (2u) formülü iki şartı da sağlıyor: 1/u ile ölçekleniyor ve u = 0.5'te tam olarak X/2 + Y/2 = 80 gp veriyor.

---

## 7. DM soru listesi

### Fiyatlandırma (X)
1. X her zaman kitap fiyatı mı olacak, yoksa satıcı bazında mı belirlenecek?
   `____`
2. Fiyatlar tam gp'ye mi yuvarlansın, sp/cp kullanılsın mı?
   `____`

### Teklif (Y)
3. %25 alt sınır sabit mi, yoksa satıcıya göre mi değişir?
   `____`
4. Absürt düşük bir teklif (ör. alt sınırın hemen üstü) otomatik olarak Rep düşürsün mü?
   `____`

### Satıcı tutumu (u)
5. u önceden mi belirlenecek, yoksa satıcıyla tanışınca zarla mı? (Öneri: d6 → 1–2: 0.5, 3–4: 1.0, 5–6: 1.5)
   `____`
6. Oyuncular Insight ile u'yu sezebilsin mi? DC kaç?
   `____`

### Zar ve DC
7. DC formülü ne olacak? (Öneri: DC = 10 + 5 × u → 12 / 15 / 18)
   `____`
8. Deception veya Intimidation da kullanılabilir mi? Farklı sonuçları olsun mu? (ör. Intimidation başarısızlığında Rep −2)
   `____`
9. Advantage hangi durumlarda verilir? (ortak dil, önceki iyilik, rüşvet vb.)
   `____`

### Tur yapısı ve Rep
10. Başarısızlıktan sonra oyuncu yeni teklifle tekrar deneyebilir mi? Yeni teklif öncekinden düşük olabilir mi?
    `____`
11. Rep başlangıç değeri herkes için 3 mü, yoksa u'ya göre mi? (Öneri: 0.5 → 4, 1.0 → 3, 1.5 → 2)
    `____`
12. Rep = 0 yasağı sadece o eşya için mi, tüm alışverişler için mi? Süresi ne kadar?
    `____`

### Hard Gamble
13. Pazarlık hiç yapılmadan Hard Gamble istenebilir mi? Satıcının kabul etme gerekçesi ne?
    `____`
14. Kusurlu eşyanın mekanik dezavantajı olsun mu? (ör. silahta doğal 1'de kırılma, zırhta −1 AC)
    `____`
15. Büyülü eşyalarda Hard Gamble yasak mı?
    `____`

---

## 8. Proje planı

- [ ] **Tasarım kilidi:** DM soruları yanıtlar.
- [ ] **Formül düzeltmesi:** Başarısızlık formülü seçilir, örnek tablo güncellenir. *(Seçenekler ve test verisi hazır. Seçim DM'de.)*
- [x] **Referans kartı:** Masada kullanılacak tek sayfalık DM kartı hazırlanır. → [REFERANS_KARTI.md](REFERANS_KARTI.md)
- [ ] **Oyun testi:** Üç satıcı tipiyle (0.5 / 1.0 / 1.5) deneme pazarlıkları yapılır. *(Olasılık bazlı test tamamlandı → [OYUN_TESTI.md](OYUN_TESTI.md). Masada oyuncularla test bekliyor.)*
- [ ] **Revizyon:** DC ve Rep değerleri test sonuçlarına göre ayarlanır.
