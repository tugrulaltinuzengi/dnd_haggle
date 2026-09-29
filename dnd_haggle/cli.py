"""Interactive table-side helper for the DM: python -m dnd_haggle"""

from __future__ import annotations

import argparse
from typing import Callable, List, Optional

from .engine import GENEROUS, GREEDY, NEUTRAL, HaggleError, HaggleSession, Outcome, format_coins

ATTITUDES = {"comert": GENEROUS, "notr": NEUTRAL, "acgozlu": GREEDY}

OUTCOME_TEXT = {
    Outcome.CRITICAL: "KRİTİK! Satıcı pes etti, teklif aynen kabul.",
    Outcome.SUCCESS: "Başarı. Satıcı orta yolda buluşuyor.",
    Outcome.FAILURE: "Başarısız. Satıcı geri adım atmıyor, sabrı azaldı.",
    Outcome.REJECTED: "Hakaret gibi teklif (X'in %25'inden az)! Zar yok, sabrı azaldı.",
    Outcome.ANGERED: "Satıcı SİNİRLENDİ! Pazarlık bitti, fiyata %10 zam.",
}


def parse_u(value: str) -> float:
    return ATTITUDES.get(value.lower()) or float(value)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="dnd-haggle", description=__doc__)
    p.add_argument("price", type=float, help="Satıcı fiyatı X (gp)")
    p.add_argument("-u", type=parse_u, default=NEUTRAL,
                   help="DM zorluk faktörü: 0.5/1/1.5 veya comert/notr/acgozlu (varsayılan 1)")
    p.add_argument("--rep", type=int, default=3, help="Satıcı sabrı (varsayılan 3)")
    p.add_argument("--resistance", type=int, default=None,
                   help="İkna direncini elle ver (varsayılan u'dan türetilir)")
    p.add_argument("--manual-roll", action="store_true",
                   help="d20'yi masada at, sonucu elle gir")
    return p


def main(argv: Optional[List[str]] = None,
         ask: Callable[[str], str] = input,
         say: Callable[[str], None] = print) -> int:
    args = build_parser().parse_args(argv)
    try:
        s = HaggleSession(args.price, u=args.u, reputation=args.rep,
                          resistance=args.resistance)
    except HaggleError as e:
        say(f"Hata: {e}")
        return 2

    say(f"X = {format_coins(s.list_price)} | u = {s.u} | DC = {s.dc} | Rep = {s.reputation}")
    say(f"En düşük teklif: {format_coins(s.min_offer)}")

    while not s.closed:
        options = []
        if s.can_haggle:
            options.append("[t]eklif")
        options.append("[k]abul")
        if s.can_hard_gamble:
            options.append("[h]ard gamble")
        options.append("[ç]ık")
        say(f"\nGüncel fiyat: {format_coins(s.current_price)} | Rep: {s.reputation}")
        choice = ask(" / ".join(options) + " > ").strip().lower()[:1]
        try:
            if choice == "t" and s.can_haggle:
                y = float(ask("Teklif Y (gp): "))
                mod = int(ask("Persuasion bonusu: ") or 0)
                roll = int(ask("d20: ")) if args.manual_roll else None
                r = s.offer(y, modifier=mod, roll=roll)
                if r.roll is not None:
                    say(f"d20 {r.roll} + {r.modifier} = {r.total} vs DC {r.dc}"
                        f"  (G = {r.gap}, a = {r.half_gap})")
                say(OUTCOME_TEXT[r.outcome])
                say(f"Anlaşılan fiyat f = {format_coins(r.price)}")
            elif choice == "k":
                p = s.accept()
                say(f"Satın alındı: {format_coins(p.price)}")
            elif choice == "h" and s.can_hard_gamble:
                p = s.hard_gamble()
                say(f"Hard Gamble! Ödenen: {format_coins(p.price)}")
                say("Eşya KUSURLU / DAMGALI: hiçbir tüccara satılamaz (0 gp); "
                    "yalnızca kullanılabilir, parçalanabilir veya yok edilebilir.")
            elif choice == "ç" or choice == "c":
                say("Satın almadan ayrıldınız.")
                return 0
            else:
                say("Geçersiz seçim.")
        except (HaggleError, ValueError) as e:
            say(f"Hata: {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
