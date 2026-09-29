"""D&D 5e Dynamic Haggle & Bargain System - core rules engine.

Variables (see README.md):
    X   seller's list price
    Y   buyer's offer (must be >= 25% of X and < X)
    G   haggle gap, X - Y
    a   half gap, G / 2
    u   DM difficulty factor (0.5 generous, 1.0 neutral, 1.5 greedy)
    Rep seller's patience, starts at 3, -1 per failed/bad offer

The engine is pure: dice are passed in (or drawn from an injectable RNG),
so every rule is deterministic and testable.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, List, Optional

GENEROUS = 0.5
NEUTRAL = 1.0
GREEDY = 1.5

DEFAULT_REPUTATION = 3
MIN_OFFER_RATIO = 0.25
CRIT_MARGIN = 5
ANGER_MARKUP = 1.10
HARD_GAMBLE_RATIO = 0.50


def round_gp(value: float) -> float:
    """Round to the nearest copper piece (0.01 gp)."""
    return round(value, 2)


def format_coins(gp: float) -> str:
    """Render a gold amount as 'N gp N sp N cp' (zero parts omitted)."""
    total_cp = int(round(gp * 100))
    g, rest = divmod(total_cp, 100)
    s, c = divmod(rest, 10)
    parts = [f"{n} {unit}" for n, unit in ((g, "gp"), (s, "sp"), (c, "cp")) if n]
    return " ".join(parts) or "0 gp"


def resistance_for(u: float) -> int:
    """Seller persuasion resistance derived from the DM factor u.

    Maps 0.5 / 1.0 / 1.5 to +0 / +5 / +10, giving DC 10 / 15 / 20, i.e.
    D&D's easy / medium / hard DCs. Intermediate u values interpolate.
    """
    return round(10 * (u - 0.5))


class Outcome(Enum):
    CRITICAL = "critical"      # total >= DC + 5 or natural 20: f = Y
    SUCCESS = "success"        # total >= DC: f = Y + a * (u / 2)
    FAILURE = "failure"        # total < DC: f = X - a / u, Rep -1
    REJECTED = "rejected"      # offer below 25% of X: no roll, Rep -1
    ANGERED = "angered"        # Rep hit 0: f = 1.1 * X, haggling over


class HaggleError(ValueError):
    """Raised for an illegal action (bad input or wrong session state)."""


@dataclass(frozen=True)
class OfferResult:
    outcome: Outcome
    price: float
    reputation: int
    offer: float = 0.0
    roll: Optional[int] = None
    modifier: int = 0
    dc: Optional[int] = None
    gap: float = 0.0
    half_gap: float = 0.0

    @property
    def total(self) -> Optional[int]:
        return None if self.roll is None else self.roll + self.modifier


@dataclass(frozen=True)
class Purchase:
    price: float
    damaged: bool = False

    @property
    def resale_value(self) -> Optional[float]:
        """0 gp for Hard Gamble goods; None means normal resale rules apply."""
        return 0.0 if self.damaged else None


@dataclass
class HaggleSession:
    list_price: float
    u: float = NEUTRAL
    reputation: int = DEFAULT_REPUTATION
    resistance: Optional[int] = None
    rng: Callable[[int, int], int] = field(default=random.randint, repr=False)
    history: List[OfferResult] = field(default_factory=list)
    current_price: Optional[float] = None
    purchase: Optional[Purchase] = None

    def __post_init__(self) -> None:
        if self.list_price <= 0:
            raise HaggleError("Satıcı fiyatı (X) pozitif olmalı.")
        if self.u <= 0:
            raise HaggleError("DM zorluk faktörü (u) pozitif olmalı.")
        if self.reputation < 1:
            raise HaggleError("Başlangıç sabrı (Rep) en az 1 olmalı.")
        if self.resistance is None:
            self.resistance = resistance_for(self.u)
        if self.current_price is None:
            self.current_price = round_gp(self.list_price)

    # --- state -----------------------------------------------------------

    @property
    def dc(self) -> int:
        return 10 + self.resistance

    @property
    def min_offer(self) -> float:
        return round_gp(MIN_OFFER_RATIO * self.list_price)

    @property
    def angered(self) -> bool:
        return self.reputation <= 0

    @property
    def closed(self) -> bool:
        return self.purchase is not None

    @property
    def can_haggle(self) -> bool:
        return not self.closed and not self.angered

    @property
    def can_hard_gamble(self) -> bool:
        """Only before any haggling, or once the seller is angered (Rep 0)."""
        return not self.closed and (not self.history or self.angered)

    # --- actions ---------------------------------------------------------

    def offer(self, y: float, modifier: int = 0,
              roll: Optional[int] = None) -> OfferResult:
        """Make an offer Y and resolve the d20 + Persuasion check."""
        if not self.can_haggle:
            raise HaggleError("Bu satıcıyla bu eşya için artık pazarlık yapılamaz.")
        x = self.list_price
        if y >= x:
            raise HaggleError("Teklif (Y) satıcı fiyatından (X) düşük olmalı.")
        if y <= 0:
            raise HaggleError("Teklif (Y) pozitif olmalı.")

        if y < self.min_offer:
            # Insulting lowball: no roll, the seller just loses patience.
            return self._record(Outcome.REJECTED, offer=y)

        if roll is None:
            roll = self.rng(1, 20)
        if not 1 <= roll <= 20:
            raise HaggleError("d20 sonucu 1 ile 20 arasında olmalı.")

        g = x - y
        a = g / 2
        total = roll + modifier
        if roll == 20 or total >= self.dc + CRIT_MARGIN:
            outcome, price = Outcome.CRITICAL, y
        elif total >= self.dc:
            outcome, price = Outcome.SUCCESS, y + a * (self.u / 2)
        else:
            outcome, price = Outcome.FAILURE, x - a * (1 / self.u)
        self.current_price = round_gp(price)
        return self._record(outcome, offer=y, roll=roll, modifier=modifier,
                            dc=self.dc, gap=round_gp(g), half_gap=round_gp(a))

    def accept(self) -> Purchase:
        """Buy at the current price (list, negotiated, or angered markup)."""
        if self.closed:
            raise HaggleError("Satın alma zaten tamamlandı.")
        self.purchase = Purchase(self.current_price)
        return self.purchase

    def hard_gamble(self) -> Purchase:
        """50% off, but the item becomes damaged and unsellable (0 gp)."""
        if not self.can_hard_gamble:
            raise HaggleError(
                "Hard Gamble yalnızca pazarlığa girmeden veya Rep = 0 iken kullanılabilir.")
        self.current_price = round_gp(HARD_GAMBLE_RATIO * self.list_price)
        self.purchase = Purchase(self.current_price, damaged=True)
        return self.purchase

    # --- internals -------------------------------------------------------

    def _record(self, outcome: Outcome, **details) -> OfferResult:
        if outcome in (Outcome.FAILURE, Outcome.REJECTED):
            self.reputation -= 1
            if self.angered:
                # Patience gone: haggling ends, the seller adds a 10% markup.
                outcome = Outcome.ANGERED
                self.current_price = round_gp(ANGER_MARKUP * self.list_price)
        result = OfferResult(outcome, price=self.current_price,
                             reputation=self.reputation, **details)
        self.history.append(result)
        return result
