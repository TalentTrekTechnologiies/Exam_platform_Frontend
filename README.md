# Examination Platform — Frontend

A multi-tenant platform for conducting EAMCET-, NEET- and TCS NQT-style mock
examinations. Any college registers, builds its own papers, and runs sittings for
its own candidates; institutions never see each other's data.

This repository is the React client. **The Spring Boot API lives in a separate
repository** — see [Backend](#backend) below.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

The dev server expects the API on `http://localhost:8080`. Start the backend
first, or every screen will show connection errors.

### Environment

Create `.env` (or `.env.local`) in the project root:

```bash
# Where the Spring Boot API is reachable. Defaults to http://localhost:8080.
VITE_API_URL=http://localhost:8080
```

Only `VITE_`-prefixed variables reach the browser — that is Vite's rule, and it
is why no secret ever belongs in this file. The API base is read once in
[`src/lib/api.js`](src/lib/api.js); nothing else should hardcode a URL.

### Build

```bash
npm run build        # emits dist/
npm run preview      # serve the production build locally
```

The build is split deliberately: the candidate's exam screens ship in the main
bundle (~230 kB), while the admin console, charts and spreadsheet export load on
demand. Candidates on exam-hall machines never download the admin app.

---

## Backend

The API is a separate Spring Boot project:

```
C:\Users\chand\eclipse-workspace\Exam_System
```

```bash
cd <backend>
JWT_SECRET=$(openssl rand -base64 48) ./mvnw spring-boot:run
```

It needs MySQL on `3306` with a database named `exam_system`. Deployment,
tuning and capacity notes live in that repo under `deploy/` and `scripts/`.

---

## How an exam runs

### The admin builds it

1. **Register** the institution — this creates the tenant. Everything below
   belongs to it.
2. **Create the exam** — title, duration in minutes, optional intro video, and
   whether camera/microphone are required.
3. **Add sections** — Physics, Chemistry, Mathematics. These become the tabs a
   candidate sees.
4. **Add questions** — individually, or bulk-import a CSV:
   ```
   questionText, optionA, optionB, optionC, optionD, correctAnswer, [marks], [negativeMarks], [section]
   ```
   Commas inside a quoted question survive (`"If x = 2, find y"`). Rejected rows
   come back with line numbers and reasons rather than a silent success.
5. **Create a slot** — the window during which the exam may be entered. This is
   separate from the paper's duration: a 3-hour paper can sit inside a 5-hour
   window.
6. **Upload candidates** — a CSV of `hallTicket, name`.
7. **Prepare papers** — `POST /admin/exam/{id}/prepare`. Run this the night
   before. It freezes every candidate's paper in advance so that Start, at the
   moment thousands of people click it at once, is a single cheap update.

### The candidate sits it

1. **Sign in** with hall ticket and name. The slot window is checked here; if it
   is not open, the message says why.
2. **Read the briefing** — paper structure, marking scheme, and the meaning of
   each palette colour, taught before the exam rather than discovered during it.
3. **Begin** — the paper is served in a frozen order and the server clock starts.
4. **Answer** — responses save the instant they are chosen. Losing the network
   queues them locally and retries; a banner says so.
5. **Submit** — manually, or automatically when time expires.

### Marking

Each question carries its own marks and penalty, which is what lets one platform
run three different exams honestly:

| Exam | Correct | Wrong | Unanswered |
|---|---|---|---|
| EAMCET | +1 | 0 | 0 |
| NEET / JEE | +4 | −1 | 0 |
| TCS NQT | +1 | 0 | 0 |

---

## What the candidate's screen guarantees

- **The paper never reshuffles.** Question and option order are frozen per
  candidate at start, so refreshing mid-exam returns the identical paper.
- **The clock belongs to the server.** Editing local storage buys no time. A
  candidate who closes their laptop at the buzzer is still scored.
- **The answer key is never sent.** The paper carries no correct answer in any
  form until after submission.
- **Five palette states**, matching the national portals: Answered, Not
  Answered, Marked for Review, Answered &amp; Marked (still evaluated), Not
  Visited.
- **Proctoring** — leaving fullscreen, switching tabs or apps is recorded both
  locally and on the server, so an invigilator can audit it afterwards. Three
  violations auto-submit.

---

## Project layout

```
src/
  lib/api.js            single source for the API base, tokens, auth interceptor
  contexts/             AuthContext (sessions), ExamContext (the exam engine)
  routes/Guards.jsx     navigation guards — UX only; the server enforces access
  components/Exam/      palette, question panel, timer, submit summary
  pages/student/        sign-in, briefing, exam, result
  pages/admin/          console: exams, sections, questions, candidates, reports
```

Two details worth knowing before changing things:

- `installAuthFetch()` in `src/index.jsx` wraps `fetch` once so every request
  carries the right token and a 401 redirects to the correct sign-in. Do not add
  tokens by hand in components.
- Student and admin tokens are stored under separate keys, and signing a
  candidate in clears only candidate keys. An invigilator signed in as admin on
  the same machine stays signed in.

---

## Known limitations

Stated plainly, because an exam platform should not overclaim:

- **Tokens live in `localStorage`.** Convenient, but vulnerable to XSS. Production
  should move to httpOnly cookies, or short-lived tokens with a refresh flow.
- **Proctoring is browser-based.** It raises the cost of cheating; it does not
  make it impossible. There is no screen recording or identity verification.
- **No sectional hard-lock yet.** True TCS NQT format requires per-section timers
  you cannot return from.
- **Verified to 5,000 concurrent candidates** on a single server. Beyond that
  needs the horizontal deployment in the backend's `deploy/`.
