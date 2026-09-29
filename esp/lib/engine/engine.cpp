#include "engine.h"
#include <cmath>
#include <algorithm>

namespace eng {

static const Type T_COMERT{0.5, 12, 4, "C\xC3\xB6mert"};
static const Type T_NOTR{1.0, 15, 3, "N\xC3\xB6tr"};
static const Type T_ACGOZLU{1.5, 18, 2, "A\xC3\xA7g\xC3\xB6zl\xC3\xBC"};

const Type* typeOf(const std::string& id) {
  if (id == "comert") return &T_COMERT;
  if (id == "notr") return &T_NOTR;
  if (id == "acgozlu") return &T_ACGOZLU;
  return nullptr;
}
bool validApproach(const std::string& a) { return a == "persuasion" || a == "deception" || a == "intimidation"; }

double round2(double v) { return std::floor(v * 100.0 + 0.5) / 100.0; }  // JS Math.round: half up

Neg newNegotiation(double itemPrice, const std::string& type, int bonusRep) {
  Neg n;
  n.rep = typeOf(type)->rep + bonusRep;
  n.maxRep = n.rep;
  n.price = itemPrice;
  return n;
}

Entry haggle(Neg& neg, const HaggleIn& in) {
  const Type* T = typeOf(in.type);
  if (!T) throw std::runtime_error("Bilinmeyen sat\xC4\xB1" "c\xC4\xB1 tipi");
  const int dc = T->dc + in.dcMod;
  if (!validApproach(in.approach)) throw std::runtime_error("Bilinmeyen yakla\xC5\x9F\xC4\xB1m");
  if (neg.status != "open") throw std::runtime_error("Bu pazarl\xC4\xB1k bitti.");
  if (!(in.Y > 0) || in.Y >= in.X) throw std::runtime_error("Teklif etiket fiyat\xC4\xB1n\xC4\xB1n alt\xC4\xB1nda olmal\xC4\xB1.");

  const double X = in.X, Y = in.Y;
  Entry e;
  e.y = Y; e.approach = in.approach; e.bonus = in.bonus;
  int loss = 0;

  if (Y < X * MIN_RATIO) {
    e.outcome = "ret";
    loss = 1;
  } else {
    if (neg.hasLastY && Y < neg.lastY) loss += 1;
    neg.hasLastY = true; neg.lastY = Y;
    if (neg.rep - loss > 0) {
      const double a = (X - Y) / 2;
      e.rolls = in.rolls;
      e.hasRoll = true; e.roll = *std::max_element(in.rolls.begin(), in.rolls.end());
      e.hasTotal = true; e.total = e.roll + in.bonus;
      if (e.roll == 20 || e.total >= dc + 5) {
        e.outcome = "crit"; neg.price = round2(Y); neg.status = "deal";
      } else if (e.total >= dc) {
        e.outcome = "success"; neg.price = round2(Y + a * (T->u / 2)); neg.status = "deal";
      } else {
        e.outcome = "fail"; neg.price = round2(X - a * (T->u / 2));
        loss += in.approach == "persuasion" ? 1 : 2;
      }
    }
  }

  neg.rep = std::max(0, neg.rep - loss);
  e.repLoss = loss;
  if (neg.rep == 0) {
    e.outcome = "angered"; neg.status = "angered"; neg.price = round2(X * ANGER_MARKUP);
  }
  e.price = neg.price;
  neg.history.push_back(e);
  return e;
}

const char* moodOf(const Neg* neg, const std::string& type) {
  if (!neg) return "\xF0\x9F\x98\x8A";
  if (neg->rep <= 0) return "\xF0\x9F\x98\xA1";
  const double r = (double)neg->rep / typeOf(type)->rep;
  return r >= 0.75 ? "\xF0\x9F\x98\x8A" : r >= 0.5 ? "\xF0\x9F\x98\x90" : "\xF0\x9F\x98\xA0";
}

}  // namespace eng
