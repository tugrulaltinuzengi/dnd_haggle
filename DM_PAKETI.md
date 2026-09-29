# D&D 5e Dinamik Pazarlık Sistemi — DM Paketi

Bu doküman pazarlık sisteminin kurallarını ve DM'in doldurması gereken kararları içerir. Tüm karar alanları doldurulmuştur (Aşama 2). ✅ işareti DM'in onayladığı, *(varsayılan)* işareti planın önerisiyle bırakılan ve DM'in dilediği zaman değiştirebileceği kararlardır.

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
| **Rep** | Satıcının sabrı | DM (u'ya göre 4 / 3 / 2) |

### u ön ayarları

| u | Satıcı tipi |
|---|---|
| 0.5 | Cömert / Çaresiz (Rep 4, DC 12) |
| 1.0 | Nötr / Standart tüccar (Rep 3, DC 15) |
| 1.5 | Açgözlü / İnatçı (Rep 2, DC 18) |

DM ara değerler de kullanabilir (ör. 0.8, 1.2).

---

## 2. Akış

1. DM satıcının **X**, **u** ve **Rep** değerlerini belirler.
2. Oyuncu teklifini (**Y**) söyler.
3. Oyuncu **d20 + Persuasion** atar. DC = **12 / 15 / 18** (u = 0.5 / 1.0 / 1.5).
4. Sonuca göre fiyat (**f**) hesaplanır.
5. Başarısızlıkta Rep 1 düşer. Rep 0 olursa ceza uygulanır.

---

## 3. Zar sonuçları

| Sonuç | Koşul | Fiyat (f) |
|---|---|---|
| **Kritik başarı** | d20 = 20 veya DC + 5 ve üzeri | f = Y |
| **Başarı** | DC tutturuldu | f = Y + a · (u / 2) |
| **Başarısızlık** | DC altı, Rep −1 | f = X − a · (u / 2) |

### Başarısızlık formülü (DM kararı ✅)

Orijinal formül **f = X − a · (1/u)** idi. u = 0.5 için X − 2a = **Y** sonucunu veriyordu, yani zarı tutturamayan cömert satıcı müşteriyi istediği fiyata bırakıyordu. Bu yüzden düzeltildi:

- [x] **f = X − a · (u / 2)** *(seçildi)*
- [ ] Başarısızlıkta fiyat X'te kalsın (indirim yok)
- [ ] f = X − a / (2u) (80 / 90 / 93.3 gp)

**Bilinen davranış:** Seçilen formülde başarısızlık fiyatı u arttıkça *düşer* (95 → 90 → 85 gp). +0 bonuslu tek atışta açgözlü satıcı ortalama 82.8 gp'ye, nötr satıcı 83.5 gp'ye satar ([OYUN_TESTI.md](OYUN_TESTI.md)). DM bunu bilerek kabul etti. Açgözlü satıcının asıl zorluğu DC 18 ve Rep 2'dir. Masa testinde (Aşama 3) gözlenecek, gerekirse Aşama 4'te yeniden bakılır.

---

## 4. Rep = 0 cezası

- Pazarlık derhal biter.
- Satıcı zam yapar: **f = 1.1 × X**
- **Yasak:** Satıcı o oyun günü bu oyuncu grubuyla **hiçbir alışverişte** pazarlık yapmaz (fiyatlar etikette kalır). Ertesi gün sıfırlanır. Zam olan 1.1 × X fiyatı sadece o anlaşma için geçerlidir. *(Soru 12 ✅)*

---

## 5. Hard Gamble (Çaresiz Hamle)

- **Etki:** f = 0.5 × X
- **Bedel:** Eşya *Kusurlu / Damgalı* statüsü kazanır.
  - Hiçbir tüccara satılamaz (0 gp).
  - Sadece kullanılabilir, parçalanabilir (salvage) veya yok edilebilir.
- **Ne zaman kullanılabilir:** **Her an** (pazarlıktan önce, pazarlığın ortasında ya da Rep = 0 iken). Fiyat her zaman 0.5 × X etiket fiyatıdır, pazarlıkta ulaşılan fiyat hesaba katılmaz. Satıcının gerekçesi: stoktaki kusurlu ya da damgalı parça. *(Soru 13 ✅)*

---

## 6. Örnek hesaplar

X = 100 gp, Y = 60 gp, G = 40, a = 20

| u | Başarı (Y + a·u/2) | Başarısızlık (X − a·u/2) |
|---|---|---|
| 0.5 | 65 gp | 95 gp |
| 1.0 | 70 gp | 90 gp |
| 1.5 | 75 gp | 85 gp |

Kritik başarı: 60 gp · Rep = 0 cezası: 110 gp · Hard Gamble: 50 gp (kusurlu)

> Not: Açgözlü satıcıda (u = 1.5) başarısızlık fiyatı cömert satıcıdakinden düşüktür. Bu bilinen ve kabul edilmiş bir davranıştır (bkz. bölüm 3).

---

## 7. DM soru listesi

### Fiyatlandırma (X)
1. X her zaman kitap fiyatı mı olacak, yoksa satıcı bazında mı belirlenecek?
   X kitap fiyatıdır. DM bölge ve nadirlikle ±%20 oynatabilir. *(varsayılan)*
2. Fiyatlar tam gp'ye mi yuvarlansın, sp/cp kullanılsın mı?
   Sp ve cp kullanılır, en yakın cp'ye yuvarlanır. *(varsayılan)*

### Teklif (Y)
3. %25 alt sınır sabit mi, yoksa satıcıya göre mi değişir?
   %25 alt sınır sabittir. *(varsayılan)*
4. Absürt düşük bir teklif (ör. alt sınırın hemen üstü) otomatik olarak Rep düşürsün mü?
   **Y < X/4:** zarsız ret, **Rep −1**. Alt sınırın (X/4) hemen üstündeki teklifler normal zarla çözülür. ✅

### Satıcı tutumu (u)
5. u önceden mi belirlenecek, yoksa satıcıyla tanışınca zarla mı? (Öneri: d6 → 1–2: 0.5, 3–4: 1.0, 5–6: 1.5)
   Satıcıyla tanışınca d6 ile belirlenir (1–2: 0.5, 3–4: 1.0, 5–6: 1.5). Önemli tüccarları DM seçer. *(varsayılan)*
6. Oyuncular Insight ile u'yu sezebilsin mi? DC kaç?
   Insight DC 15 ile satıcının tipini (cömert / nötr / açgözlü) sezer, sayıyı değil. *(varsayılan)*

### Zar ve DC
7. DC formülü ne olacak? (Öneri: DC = 10 + 5 × u → 12 / 15 / 18)
   **Sabit: 12 / 15 / 18.** ✅
8. Deception veya Intimidation da kullanılabilir mi? Farklı sonuçları olsun mu? (ör. Intimidation başarısızlığında Rep −2)
   Deception aynı tabloyu kullanır, yakalanırsa Rep −2. Intimidation başarısızlığında Rep −2. *(varsayılan)*
9. Advantage hangi durumlarda verilir? (ortak dil, önceki iyilik, rüşvet vb.)
   Ortak dil, önceki iyilik ve ölçülü rüşvet: her biri advantage verir, en fazla bir advantage sayılır. *(varsayılan)*

### Tur yapısı ve Rep
10. Başarısızlıktan sonra oyuncu yeni teklifle tekrar deneyebilir mi? Yeni teklif öncekinden düşük olabilir mi?
    **Evet.** Aynı ya da daha yüksek Y serbesttir. Önceki teklifin altında bir Y verilirse **Rep −1** (zar yine atılır). ✅
11. Rep başlangıç değeri herkes için 3 mü, yoksa u'ya göre mi? (Öneri: 0.5 → 4, 1.0 → 3, 1.5 → 2)
    **4 / 3 / 2** (u = 0.5 / 1.0 / 1.5). ✅
12. Rep = 0 yasağı sadece o eşya için mi, tüm alışverişler için mi? Süresi ne kadar?
    **Tüm alışverişler, bir oyun günü.** Ertesi gün sıfırlanır. ✅

### Hard Gamble
13. Pazarlık hiç yapılmadan Hard Gamble istenebilir mi? Satıcının kabul etme gerekçesi ne?
    **Her an** istenebilir. Satıcının gerekçesi: stoktaki kusurlu ya da damgalı parça. ✅
14. Kusurlu eşyanın mekanik dezavantajı olsun mu? (ör. silahta doğal 1'de kırılma, zırhta −1 AC)
    Kusurlu silah doğal 1'de kırılır. Kusurlu zırh −1 AC. Aletlerde ve araçlarda dezavantaj yok. *(varsayılan)*
15. Büyülü eşyalarda Hard Gamble yasak mı?
    Büyülü eşyada Hard Gamble yasak, sıradan eşyada serbest. *(varsayılan)*

---

## 8. Proje planı

Ayrıntılı aşamalar [PLAN.md](PLAN.md) dosyasındadır.

- [x] **Tasarım kilidi:** DM soruları yanıtlandı (bölüm 7).
- [x] **Formül düzeltmesi:** f = X − a · (u / 2) seçildi, örnek tablo güncel.
- [x] **Referans kartı:** [REFERANS_KARTI.md](REFERANS_KARTI.md)
- [ ] **Oyun testi:** Olasılık testi tamam ([OYUN_TESTI.md](OYUN_TESTI.md)). Masa testi bekliyor ([TEST_KAYDI.md](TEST_KAYDI.md)).
- [ ] **Revizyon:** DC ve Rep değerleri test sonuçlarına göre ayarlanır.
