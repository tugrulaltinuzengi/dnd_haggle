#pragma once
// 1:1 port of app/engine.js (pazarlik kurallari). No Arduino deps.
#include <string>
#include <vector>
#include <stdexcept>

namespace eng {

struct Type { double u; int dc; int rep; const char* name; };
const Type* typeOf(const std::string& id);  // nullptr if unknown
bool validApproach(const std::string& a);

constexpr double MIN_RATIO = 0.25, ANGER_MARKUP = 1.1, GAMBLE_RATIO = 0.5;

double round2(double v);  // Math.round(v*100)/100

struct Entry {
  double y = 0; std::string approach;
  std::vector<int> rolls;
  bool hasRoll = false; int roll = 0;
  int bonus = 0;
  bool hasTotal = false; int total = 0;
  std::string outcome;  // ret | crit | success | fail | angered
  int repLoss = 0; double price = 0;
};

struct Neg {
  int rep = 0, maxRep = 0;
  bool hasLastY = false; double lastY = 0;
  double price = 0;
  std::string status = "open";  // open | deal | angered
  std::vector<Entry> history;
  std::string line;
};

struct HaggleIn {
  double X = 0; std::string type; double Y = 0; std::string approach;
  int bonus = 0; std::vector<int> rolls; int dcMod = 0;
};

Neg newNegotiation(double itemPrice, const std::string& type, int bonusRep = 0);
// Throws std::runtime_error with the same Turkish messages as engine.js.
Entry haggle(Neg& neg, const HaggleIn& in);
// Returns a UTF-8 emoji (smile / neutral / frown / angry). neg may be null.
const char* moodOf(const Neg* neg, const std::string& type);

}  // namespace eng
