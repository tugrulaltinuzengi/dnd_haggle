# D&D 5e Dynamic Haggle & Bargain System

Satıcı ($X$) ile alıcı ($Y$) arasındaki fiyat farkı, satıcının sabrı ($Rep$) ve
yüksek riskli **Hard Gamble** mekaniği üzerine kurulu bir pazarlık sistemi.
Bu repo kuralları bir Python motoru ve DM için masa başı bir CLI olarak uygular.

## Hızlı Başlangıç

```bash
python3 -m dnd_haggle 100                  # X = 100 gp, nötr tüccar, zar otomatik
python3 -m dnd_haggle 250 -u acgozlu       # açgözlü tüccar (u = 1.5)
python3 -m dnd_haggle 80 -u 0.5 --manual-roll   # d20'yi masada atın, sonucu girin
python3 -m unittest                        # testler
```

Kod içinden:

```python
from dnd_haggle import HaggleSession, GREEDY

s = HaggleSession(100, u=GREEDY)
r = s.offer(60, modifier=5)       # d20 + Persuasion; roll=... ile zar elle verilebilir
print(r.outcome, r.price, s.reputation)
s.accept()                        # ya da s.hard_gamble()
```

## Kurallar

### 1. Temel Değişkenler
| Sembol | Anlamı |
|---|---|
| $X$ | Satıcının etiket fiyatı |
| $Y$ | Oyuncunun teklifi ($Y \ge 0.25X$ ve $Y < X$) |
| $G = X - Y$ | Pazarlık payı |
| $a = G / 2$ | Yarı pay (doğal orta nokta) |
| $u$ | DM zorluk faktörü: `0.5` cömert/çaresiz, `1.0` nötr, `1.5` açgözlü/inatçı |
| $Rep$ | Satıcı sabrı, varsayılan 3; her başarısız/kötü teklifte 1 düşer |

### 2. Persuasion Check
**DC = 10 + Satıcı İkna Direnci.** Direnç $u$'dan türetilir:

| $u$ | Direnç | DC | Kritik eşiği (DC + 5) |
|---|---|---|---|
| 0.5 | +0 | 10 | 15 |
| 1.0 | +5 | 15 | 20 |
| 1.5 | +10 | 20 | 25 |

(Formül: `direnç = 10 × (u − 0.5)`; `--resistance` ile elle verilebilir.)

| Sonuç | Koşul | Fiyat $f$ | $Rep$ |
|---|---|---|---|
| Kritik | d20 = 20 veya toplam ≥ DC + 5 | $f = Y$ | — |
| Başarı | toplam ≥ DC | $f = Y + a \cdot (u/2)$ | — |
| Başarısızlık | toplam < DC | $f = X - a \cdot (1/u)$ | −1 |
| Kötü teklif | $Y < 0.25X$ (zar atılmaz) | değişmez | −1 |

Oyuncu her sonuçtan sonra güncel fiyatı kabul edebilir ya da yeni bir teklif verebilir.
Fiyatlar en yakın bakıra (0.01 gp) yuvarlanır.

### 3. $Rep = 0$ Cezası
Pazarlık derhal biter, satıcı **%10 zam** yapar: $f = 1.1X$. Bu eşya için bu
satıcıyla bir daha pazarlık yapılamaz.

### 4. Hard Gamble ("Çaresiz Hamle")
Yalnızca **pazarlığa hiç girmeden** veya **$Rep = 0$** olduğunda kullanılabilir.
* $f = 0.5X$ (%50 indirim)
* Eşya **Kusurlu / Damgalı / İkinci El** olur, hiçbir tüccara satılamaz (**0 gp**);
  yalnızca kullanılabilir, parçalanabilir (salvage) veya yok edilebilir.

## Örnek (X = 100, Y = 60 → G = 40, a = 20)
| $u$ | Başarı | Başarısızlık |
|---|---|---|
| 0.5 | 65 gp | 60 gp |
| 1.0 | 70 gp | 80 gp |
| 1.5 | 75 gp | 86 gp 6 sp 7 cp |
