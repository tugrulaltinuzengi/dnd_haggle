import unittest

from dnd_haggle import (
    GENEROUS, GREEDY, NEUTRAL, HaggleError, HaggleSession, Outcome,
    format_coins, resistance_for,
)
from dnd_haggle.cli import main


def session(x=100, u=NEUTRAL, **kw):
    return HaggleSession(x, u=u, **kw)


class DCTests(unittest.TestCase):
    def test_dc_per_attitude(self):
        self.assertEqual(session(u=GENEROUS).dc, 10)
        self.assertEqual(session(u=NEUTRAL).dc, 15)
        self.assertEqual(session(u=GREEDY).dc, 20)

    def test_resistance_override(self):
        self.assertEqual(session(resistance=3).dc, 13)
        self.assertEqual(resistance_for(1.0), 5)


class OfferTests(unittest.TestCase):
    # X = 100, Y = 60 -> G = 40, a = 20
    def test_natural_20_is_critical(self):
        s = session()
        r = s.offer(60, modifier=-5, roll=20)
        self.assertIs(r.outcome, Outcome.CRITICAL)
        self.assertEqual(r.price, 60)

    def test_dc_plus_5_is_critical(self):
        r = session().offer(60, modifier=10, roll=10)  # 20 >= 15 + 5
        self.assertIs(r.outcome, Outcome.CRITICAL)
        self.assertEqual(r.price, 60)

    def test_success_formula(self):
        for u, expected in ((GENEROUS, 65), (NEUTRAL, 70), (GREEDY, 75)):
            s = session(u=u)
            r = s.offer(60, roll=s.dc - 1, modifier=1)  # total == DC
            self.assertIs(r.outcome, Outcome.SUCCESS)
            self.assertAlmostEqual(r.price, expected)  # Y + a * u / 2
            self.assertEqual(r.reputation, 3)

    def test_failure_formula_and_rep_loss(self):
        for u, expected in ((GENEROUS, 60), (NEUTRAL, 80), (GREEDY, 86.67)):
            r = session(u=u).offer(60, roll=1)
            self.assertIs(r.outcome, Outcome.FAILURE)
            self.assertAlmostEqual(r.price, expected)  # X - a / u
            self.assertEqual(r.reputation, 2)

    def test_offer_bounds(self):
        s = session()
        with self.assertRaises(HaggleError):
            s.offer(100, roll=10)
        with self.assertRaises(HaggleError):
            s.offer(50, roll=21)
        r = s.offer(24.99)
        self.assertIs(r.outcome, Outcome.REJECTED)
        self.assertIsNone(r.roll)
        self.assertEqual(s.reputation, 2)
        self.assertIs(s.offer(25, roll=20).outcome, Outcome.CRITICAL)

    def test_rng_used_when_no_roll(self):
        s = session(rng=lambda lo, hi: 20)
        self.assertIs(s.offer(50).outcome, Outcome.CRITICAL)


class AngerTests(unittest.TestCase):
    def test_rep_zero_ends_haggle_with_markup(self):
        s = session()
        s.offer(60, roll=1)
        s.offer(60, roll=1)
        r = s.offer(60, roll=1)
        self.assertIs(r.outcome, Outcome.ANGERED)
        self.assertAlmostEqual(r.price, 110)
        self.assertFalse(s.can_haggle)
        with self.assertRaises(HaggleError):
            s.offer(60, roll=20)
        self.assertAlmostEqual(s.accept().price, 110)

    def test_lowball_can_anger(self):
        s = session(reputation=1)
        self.assertIs(s.offer(10).outcome, Outcome.ANGERED)
        self.assertAlmostEqual(s.current_price, 110)


class HardGambleTests(unittest.TestCase):
    def test_before_haggling(self):
        s = session(x=250)
        p = s.hard_gamble()
        self.assertEqual(p.price, 125)
        self.assertTrue(p.damaged)
        self.assertEqual(p.resale_value, 0)

    def test_blocked_mid_haggle(self):
        s = session()
        s.offer(60, roll=1)
        self.assertFalse(s.can_hard_gamble)
        with self.assertRaises(HaggleError):
            s.hard_gamble()

    def test_allowed_after_anger(self):
        s = session(reputation=1)
        s.offer(60, roll=1)
        self.assertEqual(s.hard_gamble().price, 50)

    def test_normal_purchase_keeps_resale(self):
        s = session()
        s.offer(60, roll=20)
        p = s.accept()
        self.assertFalse(p.damaged)
        self.assertIsNone(p.resale_value)
        with self.assertRaises(HaggleError):
            s.hard_gamble()


class FormatTests(unittest.TestCase):
    def test_coins(self):
        self.assertEqual(format_coins(86.67), "86 gp 6 sp 7 cp")
        self.assertEqual(format_coins(110), "110 gp")
        self.assertEqual(format_coins(0), "0 gp")


class CLITests(unittest.TestCase):
    def run_cli(self, argv, answers):
        out, it = [], iter(answers)
        code = main(argv, ask=lambda _: next(it), say=out.append)
        return code, "\n".join(out)

    def test_haggle_then_accept(self):
        code, out = self.run_cli(["100", "--manual-roll"],
                                 ["t", "60", "0", "15", "k"])
        self.assertEqual(code, 0)
        self.assertIn("Başarı", out)
        self.assertIn("Satın alındı: 70 gp", out)

    def test_hard_gamble(self):
        code, out = self.run_cli(["100", "-u", "acgozlu"], ["h"])
        self.assertIn("DC = 20", out)
        self.assertIn("Ödenen: 50 gp", out)


if __name__ == "__main__":
    unittest.main()
