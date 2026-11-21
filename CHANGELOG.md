# Changelog

All notable changes to Domaxing are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Every pull request adds its change under **Unreleased**. When a version is tagged, that section is renamed to the new version.

## [Unreleased]

### Added
- **Week as a time grid**: a new **Time** layout, now the default, shows the week with hours down the side. Tasks sit at their time, side by side when they overlap; tasks without a time sit in an **All day** row; a red line marks the current time. Click an empty slot to add a task at that day and time (to the half hour), or drag a task to another slot or to All day. On a phone it shows the picked day under the day strip. The column **Board** and one-day **List** layouts are still there ([#19](https://github.com/YanaAnnt/domaxing/pull/19)).
- A collapsible **Completed** section at the bottom of every list, category and the Inbox, with the most recently completed tasks first. It replaces the old "Show completed" menu option, which mixed done tasks in with open ones. The setting in Settings → Preferences now decides whether the section starts open ([#18](https://github.com/YanaAnnt/domaxing/pull/18)).
- Unit tests with Vitest for the planner, time zones and the ICS parser, and a CI workflow that type-checks, tests and builds every pull request ([#1](https://github.com/YanaAnnt/domaxing/pull/1)).
- CodeQL security scanning of the code and the workflows, and weekly Dependabot updates for npm packages and GitHub Actions ([#2](https://github.com/YanaAnnt/domaxing/pull/2)).
- A phased roadmap in the README, this changelog, and a pull request template ([#6](https://github.com/YanaAnnt/domaxing/pull/6)).
- **AI settings** for bringing your own Anthropic API key: paste the key, choose Claude Opus 5.5 (recommended), Sonnet 5.5 or Haiku 5.5, and test the connection without spending tokens. The key is stored only on the device and is never synced or exported ([#8](https://github.com/YanaAnnt/domaxing/pull/8)).
- **Chat with the assistant** in the Assistant view, using your own key: replies stream in as they are written and show lists and bold text, right-to-left languages line up correctly, and you can stop a reply or start a new chat. The history is kept on the device only and is never synced or exported ([#10](https://github.com/YanaAnnt/domaxing/pull/10)).
- The chat assistant can **look at your tasks, lists, today's plan and calendar** through four read-only tools (`get_today`, `list_tasks`, `list_lists`, `get_calendar`) that run in the browser on your local data. Each reply shows what it looked at ([#11](https://github.com/YanaAnnt/domaxing/pull/11)).
- The assistant is now **Max**, with a clean welcome screen and a **Brief me** button: a short brief of today, the load on the days ahead and what to prepare for in the next three months. The calendar tool now covers up to 120 days ([#12](https://github.com/YanaAnnt/domaxing/pull/12)).
- **Task suggestions with approval**: Max can draft tasks (date, time, list, priority, weekly repeats) with a new `propose_tasks` tool. Each one appears as a card with **Add** and **Skip**, plus **Add all** and **Undo**; nothing is added until you tap Add. The brief drafts preparation for upcoming exams, races and deadlines this way, and Max remembers what you added or skipped ([#13](https://github.com/YanaAnnt/domaxing/pull/13)).
- **Full-screen chat**: the Assistant opens as a clean, full-screen chat with Max, with a greeting in the style of the opening screen, a slim top bar (Brief, New chat, model) and the message box pinned to the bottom. The calendar Planner (briefing, suggestions, next two weeks) moved behind a **Chat / Planner** switch, and the floating + button is hidden on this screen on phones ([#15](https://github.com/YanaAnnt/domaxing/pull/15)).

### Changed
- The chat greeting ("Hey, I'm Max. Let's max your day.") comes in more slowly and smoothly: each line fades and rises over 1.4 s with a gentler curve, one after another, settling after about 3 seconds ([#17](https://github.com/YanaAnnt/domaxing/pull/17)).
- On phones, the active tab in the bottom bar is marked by a **glass bubble** that glides to the tab you tap, stretching a little on the way, in light and dark mode ([#16](https://github.com/YanaAnnt/domaxing/pull/16)).
- The roadmap is organised by version (v1.1.0 to v2.0.0), with Projects, a daily brief, a Completed section and a Week time grid added to the plan ([#9](https://github.com/YanaAnnt/domaxing/pull/9)).
- The deploy workflow runs `npm test` before publishing the site ([#1](https://github.com/YanaAnnt/domaxing/pull/1)).
- Next.js 15 → 16, with `tsconfig.json` updated for the new JSX transform ([#4](https://github.com/YanaAnnt/domaxing/pull/4)).
- GitHub Actions updated to their current major versions: checkout, setup-node, upload-pages-artifact and deploy-pages ([#3](https://github.com/YanaAnnt/domaxing/pull/3)).

### Fixed
- The development server failed to start on Next.js 16 because of a CSS selector in the Week view. Task titles in the week columns are now targeted with a `data-task-title` attribute ([#7](https://github.com/YanaAnnt/domaxing/pull/7)).
- The opening phrase appeared fully drawn and then faded in a second time when the app loaded. The page and the app now play one entrance animation, and the app continues it from where the page got to ([#14](https://github.com/YanaAnnt/domaxing/pull/14)).

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
