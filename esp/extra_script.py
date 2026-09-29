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
