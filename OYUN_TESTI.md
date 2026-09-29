# Oyun Testi — Olasılık Bazlı Deneme

Bu test masa başı testin yerini tutmaz, ondan önce yapılan bir ön kontrol. Her satıcı tipi için d20'nin 20 sonucunun tamamı tek tek hesaplandı. Bu yüzden değerler rastgele simülasyon değil, **kesin beklenen değerlerdir**.

## Kurulum
- X = 100 gp, Y = 60 gp (G = 40, a = 20)
- DC = 10 + 5u → 12 / 15 / 18 (DM Paketi, Soru 7 önerisi)
- Kritik: doğal 20 veya DC + 5 ve üzeri
- Persuasion bonusu: +0, +3, +5, +8
- Oyuncu stratejileri:
  - **Tek atış:** Bir kez atar, sonucu kabul eder.
  - **Temkinli:** Başarısız olunca aynı teklifle tekrar dener. Bir başarısızlık daha satıcıyı sinirlendirecekse durur ve başarısızlık fiyatını kabul eder.
  - **Sonuna kadar:** Başarılı olana ya da satıcı sinirlenene (1.1X) kadar dener.

## Sonuçlar — önerilen düzeltme: f = X − a·u/2 (95 / 90 / 85)

| u | DC | Bonus | Kritik / Başarı / Başarısız | Tek atış | Temkinli (Rep 3) | Sonuna kadar (Rep 3) | Sinirlenme olasılığı (Rep 3) |
|---|---|---|---|---|---|---|---|
| 0.5 | 12 | +0 | 20% / 25% / 55% | 80.5 | 72.5 | 70.6 | 16.6% |
| 0.5 | 12 | +3 | 35% / 25% / 40% | 75.2 | 67.3 | 65.2 | 6.4% |
| 0.5 | 12 | +5 | 45% / 25% / 30% | 71.8 | 64.8 | 63.1 | 2.7% |
| 0.5 | 12 | +8 | 60% / 25% / 15% | 66.5 | 62.2 | 61.6 | 0.3% |
| 1.0 | 15 | +0 | 5% / 25% / 70% | 83.5 | 78.9 | 82.6 | 34.3% |
| 1.0 | 15 | +3 | 20% / 25% / 55% | 79.0 | 73.0 | 73.0 | 16.6% |
| 1.0 | 15 | +5 | 30% / 25% / 45% | 76.0 | 69.7 | 68.7 | 9.1% |
| 1.0 | 15 | +8 | 45% / 25% / 30% | 71.5 | 66.0 | 64.8 | 2.7% |
| 1.5 | 18 | +0 | 5% / 10% / 85% | **82.8** | 80.8 | 94.6 | 61.4% |
| 1.5 | 18 | +3 | 5% / 25% / 70% | 81.2 | 78.6 | 85.4 | 34.3% |
| 1.5 | 18 | +5 | 15% / 25% / 60% | 78.8 | 75.0 | 78.2 | 21.6% |
| 1.5 | 18 | +8 | 30% / 25% / 45% | 75.0 | 70.5 | 70.8 | 9.1% |

## Sonuçlar — alternatif: f = X − a/(2u) (80 / 90 / 93.3)

Sadece başarısızlık fiyatı değiştiği için yalnızca tek atış ve temkinli sütunları farklı çıkıyor. "Sonuna kadar" stratejisinde başarısızlık fiyatı hiç ödenmiyor.

| u | Bonus | Tek atış | Temkinli (Rep 3) |
|---|---|---|---|
| 0.5 | +0 / +3 / +5 / +8 | 72.2 / 69.2 / 67.2 / 64.2 | 68.0 / 65.0 / 63.4 / 61.9 |
| 1.0 | +0 / +3 / +5 / +8 | 83.5 / 79.0 / 76.0 / 71.5 | 78.9 / 73.0 / 69.7 / 66.0 |
| 1.5 | +0 / +3 / +5 / +8 | 89.8 / 87.1 / 83.8 / 78.8 | 86.9 / 82.7 / 78.0 / 72.2 |

## Rep'i u'ya bağlamak (Soru 11: 4 / 3 / 2), "sonuna kadar" stratejisi

| u | +0 | +3 | +5 | +8 |
|---|---|---|---|---|
| 0.5 (Rep 4) | 67.1 · %9.2 sinir | 63.3 · %2.6 | 62.2 · %0.8 | 61.5 · %0.1 |
| 1.0 (Rep 3) | 82.6 · %34.3 | 73.0 · %16.6 | 68.7 · %9.1 | 64.8 · %2.7 |
| 1.5 (Rep 2) | 98.9 · %72.2 | 90.9 · %49.0 | 84.0 · %36.0 | 75.6 · %20.2 |

## Bulgular

1. **Terslik doğrulandı.** Önerilen düzeltmede +0 bonuslu tek atışta açgözlü satıcı ortalama **82.8 gp**'ye, nötr satıcı ise **83.5 gp**'ye satıyor. Açgözlü satıcının daha ucuza satmasının sebebi, başarısızlık fiyatının u arttıkça düşmesi (85 < 90).
2. **Alternatif formül tersliği gideriyor.** f = X − a/(2u) ile her bonus seviyesinde sıralama cömert < nötr < açgözlü şeklinde oluyor. Ayrıca DM Paketi'ndeki iki şartı da sağlıyor: 1/u ile ölçekleniyor ve u = 0.5'te tam olarak (X + Y)/2 = 80 veriyor. Başarı fiyatı her u değerinde başarısızlık fiyatının altında kalıyor.
3. **Açgözlü satıcıda "sonuna kadar" denemek cezalandırıcı.** +0 ile sinirlenme olasılığı %61, Rep 2 ile %72. Beklenen fiyat liste fiyatına yaklaşıyor. Bu istenen bir risk olabilir ama Soru 11'deki Rep 2 önerisiyle birlikte düşük bonuslu karakterler için neredeyse hiç kazanç bırakmıyor.
4. **Başarı olasılığı her DC'de sabit %25.** DC ile DC + 4 arası her zaman 5 yüz ediyor. Kritik ile başarısızlık arasındaki denge tamamen DC'ye bağlı.
5. **DC yuvarlaması:** 10 + 5u formülü 12.5 ve 17.5 veriyor. Paketteki 12 / 18 değerleri bunları farklı yönlere yuvarlıyor. Kartta 12 / 15 / 18 sabit değer olarak yazılabilir.

## Revizyon için öneriler (DM kararı)
- Başarısızlık formülü olarak **f = X − a/(2u)** seçilebilir.
- Açgözlü satıcıda Rep 2 yerine **Rep 3** kullanılabilir. Ya da u'ya bağlı Rep yalnızca cömert satıcıya +1 olarak uygulanabilir (4 / 3 / 3).
- Masa başı testte, sayılarla birlikte oyuncuların "tekrar deneme" kararlarını da gözlemleyin.
