Import("env")
import configparser, os
here = env.subst("$PROJECT_DIR")
cp = configparser.ConfigParser()
src = os.path.join(here, "secrets.ini")
if not os.path.exists(src):
    print("WARNING: secrets.ini missing, using secrets.ini.example")
    src = os.path.join(here, "secrets.ini.example")
cp.read(src)
s = cp["secrets"]
assert len(s["AP_PASS"]) >= 8, "AP_PASS must be >= 8 chars (WPA2)"
for k in ("AP_PASS", "DM_PIN", "STA_SSID", "STA_PASS"):
    env.Append(CPPDEFINES=[(k, env.StringifyMacro(s[k]))])
# Optional relay settings (remote access). RELAY_HOST empty = relay disabled.
host = s.get("RELAY_HOST", "").strip()
env.Append(CPPDEFINES=[("RELAY_HOST", env.StringifyMacro(host)),
                       ("RELAY_KEY", env.StringifyMacro(s.get("RELAY_KEY", "").strip())),
                       ("RELAY_PORT", s.get("RELAY_PORT", "443").strip() or "443"),
                       ("RELAY_TLS", s.get("RELAY_TLS", "1").strip() or "1")])
if host and s.get("RELAY_TLS", "1").strip() != "0":
    assert len(s.get("RELAY_KEY", "").strip()) >= 24, "RELAY_KEY must be at least 24 characters"
