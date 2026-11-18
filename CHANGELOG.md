# Changelog

All notable changes to Domaxing are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Every pull request adds its change under **Unreleased**. When a version is tagged, that section is renamed to the new version.

## [Unreleased]

### Added
- Unit tests with Vitest for the planner, time zones and the ICS parser, and a CI workflow that type-checks, tests and builds every pull request ([#1](https://github.com/YanaAnnt/domaxing/pull/1)).
- CodeQL security scanning of the code and the workflows, and weekly Dependabot updates for npm packages and GitHub Actions ([#2](https://github.com/YanaAnnt/domaxing/pull/2)).
- A phased roadmap in the README, this changelog, and a pull request template ([#6](https://github.com/YanaAnnt/domaxing/pull/6)).
- **AI settings** for bringing your own Anthropic API key: paste the key, choose Claude Opus 5.5 (recommended), Sonnet 5.5 or Haiku 5.5, and test the connection without spending tokens. The key is stored only on the device and is never synced or exported ([#8](https://github.com/YanaAnnt/domaxing/pull/8)).

### Changed
- The deploy workflow runs `npm test` before publishing the site ([#1](https://github.com/YanaAnnt/domaxing/pull/1)).
- Next.js 15 → 16, with `tsconfig.json` updated for the new JSX transform ([#4](https://github.com/YanaAnnt/domaxing/pull/4)).
- GitHub Actions updated to their current major versions: checkout, setup-node, upload-pages-artifact and deploy-pages ([#3](https://github.com/YanaAnnt/domaxing/pull/3)).

### Removed
- `scripts/test-planner.ts`, replaced by the Vitest suites in `tests/` ([#1](https://github.com/YanaAnnt/domaxing/pull/1)).

## [1.0.0] - 2026-11-18

The first public release.

### Added
- A local-first to-do app: Today, Upcoming, Inbox, Week, lists, categories, priorities, subtasks, recurring tasks, reminders, drag and drop, natural-language Quick Add, a command menu and keyboard shortcuts.
- The Assistant: connect Google Calendar, Outlook, iCloud or any calendar link, and it drafts preparation plans for exams, trips, meetings, birthdays and deadlines, which you approve, edit or dismiss.
- AI planning with Claude and structured outputs, with a rule-based planner as a fallback, plus AI task breakdown and a daily briefing.
- Cloud sync with Supabase (Postgres with Row Level Security, Realtime, Vault), background jobs with `pg_cron`, and Web Push notifications with quiet hours.
- An installable, offline-capable PWA, deployed to GitHub Pages on every push to `main`.
- A Windows desktop app built with Electron, published as an installer on GitHub Releases.

[Unreleased]: https://github.com/YanaAnnt/domaxing/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/YanaAnnt/domaxing/releases/tag/v1.0.0
