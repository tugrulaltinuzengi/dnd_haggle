# Changelog — pazar (dnd_haggle)

All notable changes to this app. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/).
History before 0.12.3: `PROJE.md` §12.

## [Unreleased]

## [0.12.3] - 2026-09-29
### Added
- **DM password change:** in the DM's **Ayar** tab ("DM şifresi"): current PIN/password, new password (6–64 characters, any text), and a repeat field.
  - The new password is stored as a salted scrypt hash in `data.json` (`settings.dmPass`) and is never kept in plain text or sent to clients.
  - Changing it signs out every other DM session and closes their live connections.
  - Until the first change, `DM_PIN` stays the login.
- **Forgotten password:** start the server once with `DM_PASSWORD_RESET=1`, and `DM_PIN` works again.
### Changed
- The DM login field accepts text (PIN or password), not just digits.
