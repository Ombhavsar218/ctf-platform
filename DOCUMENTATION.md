# CTF Platform — Documentation

This document describes every section of the CTF platform: how the app is structured, what each page contains, and what the different roles can do.

---

## 1. Overview

A full-featured Capture The Flag (CTF) competition platform built as a **React single-page application** (React 18 + Vite) with:

- **React Router v6** for navigation and route protection
- **Bootstrap 5** grid/utilities for layout
- **lucide-react** for icons
- **framer-motion** for animations
- **three / @react-three/fiber / @react-three/drei** for the 3D hero scene
- **CSS variables** (single dark theme defined in `src/styles/global.css`)

**Route structure** (`src/App.jsx`):

| Route | Page | Layout |
|---|---|---|
| `/` | Landing | Public (no sidebar) |
| `/about` | About | Public (no sidebar) |
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/onboarding` | Onboarding | Onboarding |
| `/dashboard` | Dashboard | User panel (sidebar) |
| `/challenges` | Challenges | User panel (sidebar) |
| `/challenges/:id` | Challenge Details | User panel (sidebar) |
| `/leaderboard` | Leaderboard | User panel (sidebar) |
| `/achievements` | Achievements | User panel (sidebar) |
| `/events` | Events | User panel (sidebar) |
| `/profile` | Profile | User panel (sidebar) |
| `/history` | History | User panel (sidebar) |
| `/settings` | Settings | User panel (sidebar) |
| `/admin` | Admin Dashboard | Admin panel |
| `/admin/challenges` | Manage Challenges | Admin panel |
| `/admin/challenges/new` | Create Challenge | Admin panel |
| `/admin/challenges/:id/edit` | Edit Challenge | Admin panel |
| `/admin/categories` | Manage Categories | Admin panel |
| `/admin/users` | Manage Users | Admin panel |
| `/admin/analytics` | Analytics | Admin panel |
| `/admin/announcements` | Announcements | Admin panel |
| `/admin/achievements` | Achievements | Admin panel |
| `/admin/audit-logs` | Audit Logs | Admin panel |
| `/admin/settings` | Admin Settings | Admin panel |
| `/admin/events` | Events (placeholder/scaffolded) | Admin panel |

---

## 2. Access & Roles

### Public visitors (no account / not signed in)
- See the Landing page (`/`) and About page (`/about`).
- Can `/login` or `/register`.

### Student / Competitor (signed-in participants)
- Complete the **onboarding flow** after registering.
- Get the **user panel** (top navbar + left sidebar) with access to Dashboard, Challenges, Leaderboard, Achievements, Events, Profile, History, and Settings.

### Admin
- Same user-panel experience, **plus** `/admin/*` sections for managing challenges, categories, users, analytics, announcements, achievements, and the read-only audit trail.
- Admin sidebar is shown through `AdminLayout.jsx` (rendered inside `.admin-panel` wrapper).

### Sign-in types (same entry point)
- **Username or email & password** — the only working sign-in method.
- **Google** — the button exists but OAuth is not implemented; it reports
  "Google sign-in is not available yet."
- **Demo buttons** — local development shortcuts for the seeded
  `admin` / `h4ck3r_x` accounts.

---

## 3. Onboarding Flow

After registering, new users are forced into `/onboarding`, a **6-step wizard** with a progress tracker and next/back controls:

1. **Welcome** — intro, username + display name, avatar selection (emoji + generated avatar).
2. **Skill** — experience level radio cards (Beginner, Intermediate, Advanced, Professional).
3. **Team** — create a team, join a team via code, or skip for now.
4. **Focus** — pick focus areas from a responsive grid (`col-12 col-sm-6`): Web Exploitation, Forensics, Binary Exploitation (Pwn), Reverse Engineering, OSINT, Cryptography, Steganography, Networking, Mobile, Misc.
5. **Purpose** — tell why you're here (Learn, Compete, Teach, etc.).
6. **Experience** — things you'd like to explore and how you found the platform.

On completing the final step the user is redirected to the Dashboard.

---

## 4. Public Pages

### 4.1 Landing (`/`)
Marketing / landing page with several sections:

- **Hero** — a **3D animated scene** (`HeroScene`) with rings/sphere particles, headline, CTA buttons (Get Started / View Challenges), and a terminal-style mock output.
- **Stats bar** — typewriter-style rotating stats (participants, challenges, countries, prizes).
- **Student / Competitor selector** — lets a visitor choose their role before continuing (routes to `/register` with the selected role).
- **"What is a CTF?"** — explanation cards.
- **Categories** — grid of challenge categories, each using the shared shield-and-clock `CategoryIcon.jsx` tinted with that category's own colour.
- **Featured challenges** — 3 preview challenge cards.
- **Top hackers** — leaderboard preview (top 5 players with scores).
- **Final CTA** — "Ready to hack?" call to action + footer.

### 4.2 About (`/about`)
- Intro block describing the platform.
- **4 feature cards** (e.g. learn by doing, real-world scenarios, community, etc.).
- **Ready to start** CTA block + footer.

### 4.3 Login / Register
- **Login** (`/login`): email/password form, Google/GitHub buttons, "forgot password" link, link to Register.
- **Register** (`/register`): full name, email, username, password, confirm password, role selection (Student/Competitor), terms checkbox; "Sign in" link if you already have an account.

---

## 5. User Panel (signed-in area)

### 5.1 Top navbar (all user-panel pages)
- **Brand/logo** → links home.
- **Search bar** — universal challenge search (hidden on the landing and about pages).
- **Home** and **About Us** links on the right side.
- **Auth area**: bell/notifications icon, user avatar dropdown (Profile / Settings / Logout), and a **PowerShell console** launcher.

### 5.2 PowerShell console (every page)
A dockable terminal exposed by the navbar button. Provides a simulated PowerShell/shell:

- Input box styled like a terminal prompt (`C:\Users\...>`) with command history.
- Pressing **Enter** runs the command, echoes it to the log, and clears the input.
- Example commands: `help`, `whoami`, `ls`, `dir`, `cat flag.txt`, etc. It is a
  decorative simulation: challenge titles come from the static seed data, not
  from the API, and the output has no effect on the platform.
- A "system message" banner effect when opened.

### 5.3 Sidebar (left nav)
- **Dashboard** (LayoutDashboard)
- **Challenges** (Target)
- **Leaderboard** (Trophy)
- **Achievements** (Award)
- — *Account* section —
- **Profile** (User)
- **History**
- **Settings** (Settings)

### 5.4 Dashboard (`/dashboard`)
- **Welcome hero** — greets the user, "Resume Learning" prompt.
- **Stat cards** — Solved, Rank, Streak, Points.
- **Recommended for you** — challenge cards ("unlocked", point values, categories).
- **Ring gauge** — overall completion progress.
- **Category points** — breakdown per category.
- **Completed challenges** — recent completions list.
- **Terminal status** — docker/lab container status boxes.
- **Recent activity** — feed of latest events (solved challenges, joined events, etc.).

### 5.5 Challenges (`/challenges`)
- Mode toggle: **Attack / Defend**.
- **ChallengeFilter** bar with custom `ThemedSelect` dropdowns (category, difficulty) and a search input.
- **ChallengeCards** grid — each card shows category, title, tags, difficulty/points, and a "View" button.
- Buttons: "Create Challenge" (admin) and responsive cards.

### 5.6 Challenge Details (`/challenges/:id`)
- Challenge metadata (category, points, difficulty, attempts / solo-completion status).
- **Description tab** in a terminal panel.
- **Hints** — expandable HintCards (up to 3 hints).
- **Cheatsheet tab** — quick reference content.
- **Flag submit box** — enter flag, gets "correct"/"incorrect" feedback.
- **Instance spawning** — the instance panel is scaffolded; starting/stopping
  an instance has no backend yet (Docker challenge containers are deferred).
- **Files & downloads** — attachable challenge files.

### 5.7 Leaderboard (`/leaderboard`)
- **Tabs**: Global / Weekly / Country / Category.
- **Podium** — top 3 players with medals and animated positioning; country flag chips.
- **Top-N graph** (`LeaderboardGraph.jsx`) — transparent SVG line chart, X = rank, Y = points. One coloured line segment per player (medal colours for the top 3, then theme violets/cyans), glowing area fill, node dots labelled with the handle, tooltips with points/solved/accuracy. Respects the active tab, filter and search.
- **Your Rank strip** — the signed-in player's rank, points, solved and accuracy; medal badge for a top-3 rank, `#N` otherwise. Hidden when not logged in.
- **Ranking table** — rows with rank, player, country, points, activities; me/highlight row if present.

### 5.8 Achievements (`/achievements`)
- **Summary** — total badges earned, points, best streak.
- **Badge grid** — unlocked badges; **locked badges** shown with a lock icon and description of how to unlock.

### 5.9 Events (`/events`)
- **Countdown** card to the next event.
- **Event list** — expandable event cards with date, location/online, details, and "Register" action.
- **Deferred feature:** events are mock data (`src/data/events.js`) and
  registrations are stored in the browser's `localStorage`. There is no Events
  model or API in the backend yet.

### 5.10 Profile (`/profile`)
- **Profile card** — avatar, username, rank, bio.
- **Stats** — global rank, total points, challenges solved, current streak, completion.
- **Badges** — earned achievement badges.
- **Weekly / Monthly progress** — chart bars.
- **Category performance** — points per category, shown as its own card below the profile card.
- **Activity log** — recent actions. **View all** opens `/history`.

### 5.11 History (`/history`)
- Private, server-backed history for the signed-in account, linked from the
  sidebar and the Profile activity card.
- **Solves** tab — `GET /api/v1/solves/me/`; challenge, category, difficulty,
  historical points and timestamp.
- **Submissions** tab — `GET /api/v1/submissions/me/`; challenge, category,
  difficulty, correct/miss verdict and timestamp (flag values are never returned).
- Both tabs use server-side pagination. The backend derives the owner from the
  access token; no user id is accepted from the client.

### 5.12 Settings (`/settings`)
- **Tabs**: Profile, Privacy, Security, Notifications, Danger Zone.
- Edits profile info, privacy toggles, password change, notification preferences, and an **account deletion** section.

---

## 6. Admin Panel

Admin pages live under `/admin` with their own sidebar (`AdminLayout.jsx`) listing:

- **Dashboard**
- **Challenges**
- **Create Challenge**
- **Categories**
- **Users**
- **Analytics**
- **Announcements**
- **Audit Logs**
- **Settings**
- (Events — commented out / scaffolded)

The admin sidebar shows a bright "Admin Panel" header.

### 6.1 Admin Dashboard (`/admin`)
- **Stat cards** — derived server-side from real records (users, challenges,
  solves, submissions); a failed request hides the cards instead of showing
  zeros.
- **Charts** — solve activity, category distribution and leaderboard data from
  `GET /api/v1/admin/analytics/`.
- **Quick actions** — "Create Challenge", "Manage Challenges", "View Users",
  "View Platform".
- **Recent Admin Activity** — the five newest rows from the server-side audit
  trail, with a **View all** link. If the audit request fails, the panel shows an
  unavailable message without breaking the rest of the dashboard.

### 6.2 Manage Challenges (`/admin/challenges`)
- **Table** of challenges: category, title, difficulty, points, status (Draft/Published), solves; striped rows.
- **Row actions**: Edit, Preview, Duplicate, Publish/Unpublish toggle, Delete.
- **Filter chips** (All / Published / Draft) + Create Challenge button.

### 6.3 Create / Edit Challenge (`/admin/challenges/new`, `/admin/challenges/:id/edit`)
Multi-tab form:

- **Overview** — title, category, difficulty, points, description, scenario,
  objectives, instructions, author and tags.
- **Files** — drag-and-drop upload zone (ZIP, TXT, PDF, PNG, JPG, PCAP, PY, C,
  EXE, APK). Files are uploaded through the real attachments endpoint after
  the challenge is saved.
- **Deployment** — captures optional connection details (target type, URL/host,
  port) shown to players. Docker deployment, health checks and auto-restart are
  handled by infrastructure that does not exist in this project yet.
- Sticky action bar: **Save Draft**, **Publish Challenge** (or Update & Publish
  when editing), and **Cancel**.

### 6.4 Categories (`/admin/categories`)
- **Table** of the real categories from `GET /api/v1/categories/`, with name,
  glyph, description and challenge count. Counts include drafts/scheduled
  challenges when the admin list is readable, otherwise the public published
  counts are shown.
- **Create / edit** opens a modal prefilled from the selected row. Writable
  fields are name, description, icon, color and order; the backend derives and
  keeps the slug. Field errors appear beside the controls, API errors inside the
  modal, and successful saves show a toast and reload the list.
- **Delete** asks for confirmation. A category still used by a challenge or an
  achievement rule is **refused**: the modal shows the backend explanation, the
  row stays visible and nothing is cascaded or reassigned. Only an unused
  category is removed.
- Successful mutations are written to the server-side audit trail as
  `category.create`, `category.update` (changed field names only) and
  `category.delete`. The endpoints require `challenges.add_category`,
  `challenges.change_category` and `challenges.delete_category`; reads remain
  the public category endpoint.

### 6.5 Users (`/admin/users`)
- **Stats bar** — totals supplied by the admin user API.
- **Tabs** — Active and Deleted (soft-deleted accounts), plus username/email
  search and server-side pagination.
- Row actions: create a user, change status (active/suspended/banned) with a
  reason, edit profile fields, move to Deleted, and restore. Superusers are
  protected from deletion/restore.
- **User detail drawer** — profile, points, join/last-login dates, status note,
  and group membership editing. Per-user solve/submission history is not exposed
  to administrators; players can view their own at `/history`.

### 6.6 Audit Logs (`/admin/audit-logs`)
- **Authoritative, read-only feed** from `GET /api/v1/admin/audit-logs/`
  (requires `audit.view_auditlog`).
- **Server-side filters** — search, exact actor, action, target type and
  inclusive date-from/date-to; server-side pagination (20 per page).
- Columns: actor, action badge, target, safe details (changed field names,
  old/new status, group changes, attachment id) and timestamp. No IP addresses
  are displayed or stored.
- **Export page** downloads the current page as CSV.
- The trail is written transactionally by the backend for successful admin
  mutations only. Failed attempts, reads and deferred features produce no entry.
  The browser never writes audit rows.

### 6.7 Admin Settings (`/admin/settings`)
- Loads from `GET /api/v1/admin/settings/` and saves through a partial
  `PATCH /api/v1/admin/settings/`. Both require the `Admin` group's
  `platform_settings` model permissions.
- **Runtime-persistent:** allow new registrations, public leaderboard access and
  hint unlocks. These are enforced by the corresponding backend endpoints.
- After PATCH, the page re-reads the settings and shows success only when the
  stored values match. Errors and field validation failures stay visible.
- **Disabled and documented, not persisted:** platform name/tagline (hardcoded
  branding), domain (deployment environment), account approval (no approval
  workflow), global hint percentage (costs are per challenge), email
  notifications (no email subsystem) and maintenance mode (operational concern).
- There is no localStorage fallback for platform settings.

### 6.8 Placeholder sections
Unfinished/scaffolded admin sections (`/admin/events` etc.) render `AdminPlaceholder` with an "under construction" message.

---

## 7. Styling & Theming

- All colors, fonts, spacing come from **CSS variables** in `src/styles/global.css` (dark theme: `--bg-primary`, `--accent-green`, `--accent-cyan`, `--accent-purple`, `--border-bright`, etc.).
- Reusable class names: `.page-header`, `.card`, `.stat-card`, `.btn-*`, `.themed-select` (custom dropdown styling), `.console-*` (terminal styles), `.section-block`.
- Motion: `framer-motion` fade/slide-in wrappers and keyframe animations (`animate-fade-in`, `spin`, typewriter, `slide-in` for modals).

---

## 8. Current implementation status

The application is no longer a frontend-only demo. Authentication, the public
challenge flow, the player dashboard/leaderboard/achievements/settings, and the
admin challenge/user/analytics/announcement/achievement surfaces all call the
Django REST API at `/api/v1/`.

**API-backed:** registration, login/refresh/logout, password change,
preferences, onboarding, dashboard statistics and streaks, challenges,
flag submission, hint reveal, attachments, leaderboard, achievements,
notifications, announcements banner, profile, account settings, private
submission/solve history, admin challenges (CRUD/publish/attachments), admin
users (status/groups/restore/soft delete), admin analytics, admin
announcements, admin achievements, admin categories (list/create/edit/delete
with non-cascading delete protection), the three runtime admin settings, and
the read-only server-side audit trail.

**Intentionally deferred:**

| Area | Current behaviour |
| --- | --- |
| Events (`/events`) | Mock events from `src/data/events.js`; registration stored in `localStorage` |
| Admin → Events | `AdminPlaceholder` |
| Challenge instances | `startInstance` / `stopInstance` are no-ops; no container backend |
| Admin → Settings | Registration, leaderboard and hint toggles persist. Branding, domain, approval, global hint pricing, email and maintenance controls are disabled/documented |
| Google sign-in | Not implemented; reports "not available yet" |
| Landing page counters | Static marketing numbers |
| PowerShell console | Decorative simulated terminal using static seed challenges |

`src/data/notifications.js` is an unused leftover that no page imports. The old
browser-local audit log and its `adminService` mock methods have been removed;
there is no client-side audit fallback.

### Development data

`ctf-platform-be/db.sqlite3` already contains development data: users,
challenges, categories, solves, submissions, notifications, achievements and
awards. Do not reset or recreate it. The seeded demo accounts are `admin` /
`admin123` (platform admin) and `h4ck3r_x` / `password123` (player); these are
development-only values.

Do not re-run `create_demo_users` on a populated database: it rewrites the demo
accounts' points/email/role. The other seed commands are idempotent but are not
part of normal startup.

### Checks

```powershell
cd E:\Flag-hunt\ctf-platform-be
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\venv\Scripts\python.exe manage.py test

cd E:\Flag-hunt\ctf-platform
node scripts/admin-users-harness/run.mjs
node scripts/challenges-harness/run.mjs
node scripts/settings-harness/run.mjs
node scripts/history-harness/run.mjs
npm run build
```

There is no automated browser/E2E suite configured.

### Further reading

- Repository setup, environment variables, Docker/Celery and troubleshooting:
  [`../README.md`](../README.md)
- Backend runbook: [`../ctf-platform-be/README.md`](../ctf-platform-be/README.md)
