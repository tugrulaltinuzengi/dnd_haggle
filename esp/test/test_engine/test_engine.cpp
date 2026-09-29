#include <unity.h>
#include <cstdio>
#include <string>
#include "../../lib/engine/engine.h"
#include "../../lib/engine/engine.cpp"

struct VCase { double X; const char* type; int bonusRep; int rep, maxRep; double price; const char* status; int first, n; };
struct VStep {
  double Y; const char* approach; int bonus; int rolls[2]; int nrolls; int dcMod;
  int isError; const char* error;
  const char* outcome; int hasRoll; int roll; int hasTotal; int total; int repLoss; double price;
  const char* status; int rep; int hasLastY; double lastY;
};
#include "vectors.inc"

void setUp() {}
void tearDown() {}

void test_all_vectors() {
  int steps = 0;
  for (int ci = 0; ci < NCASES; ci++) {
    const VCase& c = VCASES[ci];
    eng::Neg neg = eng::newNegotiation(c.X, c.type, c.bonusRep);
    char msg[96];
    snprintf(msg, sizeof msg, "case %d start", ci);
    TEST_ASSERT_EQUAL_INT_MESSAGE(c.rep, neg.rep, msg);
    TEST_ASSERT_EQUAL_INT_MESSAGE(c.maxRep, neg.maxRep, msg);
    TEST_ASSERT_DOUBLE_WITHIN_MESSAGE(0.005, c.price, neg.price, msg);
    for (int k = 0; k < c.n; k++) {
      const VStep& s = VSTEPS[c.first + k];
      snprintf(msg, sizeof msg, "case %d step %d", ci, k);
      eng::HaggleIn in; in.X = c.X; in.type = c.type; in.Y = s.Y; in.approach = s.approach; in.bonus = s.bonus; in.dcMod = s.dcMod;
      for (int r = 0; r < s.nrolls; r++) in.rolls.push_back(s.rolls[r]);
      if (s.isError) {
        bool threw = false; std::string what;
        try { eng::haggle(neg, in); } catch (const std::runtime_error& e) { threw = true; what = e.what(); }
        TEST_ASSERT_TRUE_MESSAGE(threw, msg);
        TEST_ASSERT_EQUAL_STRING_MESSAGE(s.error, what.c_str(), msg);
      } else {
        eng::Entry e = eng::haggle(neg, in);
        TEST_ASSERT_EQUAL_STRING_MESSAGE(s.outcome, e.outcome.c_str(), msg);
        TEST_ASSERT_EQUAL_INT_MESSAGE(s.hasRoll, e.hasRoll, msg);
        if (s.hasRoll) TEST_ASSERT_EQUAL_INT_MESSAGE(s.roll, e.roll, msg);
        TEST_ASSERT_EQUAL_INT_MESSAGE(s.hasTotal, e.hasTotal, msg);
        if (s.hasTotal) TEST_ASSERT_EQUAL_INT_MESSAGE(s.total, e.total, msg);
        TEST_ASSERT_EQUAL_INT_MESSAGE(s.repLoss, e.repLoss, msg);
        TEST_ASSERT_DOUBLE_WITHIN_MESSAGE(0.0001, s.price, e.price, msg);
        TEST_ASSERT_EQUAL_INT_MESSAGE(s.rep, neg.rep, msg);
        TEST_ASSERT_EQUAL_STRING_MESSAGE(s.status, neg.status.c_str(), msg);
        TEST_ASSERT_EQUAL_INT_MESSAGE(s.hasLastY, neg.hasLastY, msg);
        if (s.hasLastY) TEST_ASSERT_DOUBLE_WITHIN_MESSAGE(0.0001, s.lastY, neg.lastY, msg);
      }
      steps++;
    }
  }
  printf("replayed %d cases, %d steps\n", NCASES, steps);
}
int main() { UNITY_BEGIN(); RUN_TEST(test_all_vectors); return UNITY_END(); }
