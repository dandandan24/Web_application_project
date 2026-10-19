# The Daily Web — News Management System

A web system for writing, editing, approving and publishing news, similar to a modern news site.
Built **only** with the technologies taught in the course:
HTML5, CSS3 (Flexbox), Vanilla JavaScript (Ajax / `fetch`), Node.js, Express, MongoDB + Mongoose, EJS.
No front-end frameworks (no React / Angular / Vue / jQuery / Bootstrap).

| npm dependency | Why |
|---|---|
| `express` | Web server / routing |
| `mongoose` | MongoDB models and queries |
| `ejs` | Server-side views |
| `chart.js` | Impact Analytics graph (explicitly allowed in the requirements) |

Everything else (password hashing, sessions, cookies, logging, `.env` loading, file upload,
rate limiting) is written by hand using Node.js built-in modules (`crypto`, `fs`, `fetch`).

---

## 1. Installation and running

### Requirements
- **Node.js 20.6 or newer** (`node -v`)
- **MongoDB 6 or newer**, running locally — either:
  - MongoDB Community Server installed locally, **or**
  - Docker: `docker run -d --name dailyweb-mongo -p 27017:27017 -v dailyweb-mongo-data:/data/db mongo:7`
- Internet connection (only for the weather widget)

### Steps
```bash
# 1. Install dependencies
npm install

# 2. (optional) configuration - the defaults work out of the box
cp .env.example .env

# 3. Load the demo data (WARNING: deletes everything in the database first)
npm run seed

# 4. Start the server
npm start            # or: npm run dev  (restarts automatically on code changes)
```
Open **http://localhost:3000**

### Demo users
| Role | Username | Password |
|---|---|---|
| Editor | `editor` | `editor123` |
| Reporters | `dana`, `yossi`, `maya`, `omer`, `noa`, `lior` | `reporter123` |

These are demo-only accounts created by the seed script. No real secrets are stored in the
repository (`.env` is in `.gitignore`; the weather service needs no API key).

### Configuration (`.env`)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/daily_web` | Database connection |
| `COOKIE_SECURE` | `false` | `true` when served over HTTPS |
| `SESSION_DAYS` | `7` | Login session lifetime |

---

## 2. Project structure (MVC)

```
├── src/
│   ├── server.js              # Entry point: DB connection, start/stop (graceful shutdown)
│   ├── app.js                 # Express app: middleware, static files, routes, error handling
│   ├── config.js              # Settings + small .env loader
│   ├── db.js                  # Mongoose connection
│   ├── models/                # M - Mongoose schemas
│   │   ├── User.js            #   reporters & editors (scrypt password hash)
│   │   ├── Article.js         #   article with `working` and `live` versions + publish history
│   │   ├── Comment.js         #   reader comments
│   │   ├── ViewStat.js        #   views per article per hour (analytics)
│   │   ├── ReadHistory.js     #   which articles a device has viewed ("viewed" filter)
│   │   └── Session.js         #   login sessions (stored in MongoDB, TTL index)
│   ├── views/                 # V - EJS templates
│   │   ├── partials/          #   head, header, footer, weather widget, article card
│   │   └── pages/             #   home, article, login, workspace, edit, editor, review,
│   │                          #   analytics, users, comments, error
│   ├── controllers/           # C - request handlers
│   │   ├── pageController.js  #   renders the EJS pages
│   │   ├── articleController.js, commentController.js, userController.js,
│   │   ├── statsController.js, authController.js, weatherController.js, uploadController.js
│   ├── routes/
│   │   ├── pages.js           #   HTML pages
│   │   └── api.js             #   REST API (/api/...)
│   ├── services/              # business logic
│   │   ├── articleWorkflow.js #   allowed status transitions & permissions
│   │   ├── articleService.js  #   feed query (search / filter / sort / paging)
│   │   ├── viewTracker.js     #   buffered view counting
│   │   ├── commentLimiter.js  #   3 comments per minute per device
│   │   └── weatherService.js  #   external weather service + cache
│   ├── middleware/            # auth (sessions, roles), visitor id cookie, error handler
│   └── utils/                 # logger, validation, cookies, formatting helpers
├── public/                    # static files
│   ├── css/style.css          #   responsive Flexbox stylesheet
│   ├── js/                    #   Vanilla JS for every page (Ajax with fetch)
│   ├── img/                   #   category images (SVG)
│   └── uploads/               #   images uploaded by reporters (not committed)
├── scripts/seed.js            # demo data generator
├── logs/                      # app.log (events & requests), error.log (errors)
└── .env.example
```

---

## 3. Features

### Public site (guests)
- **Home feed** – only approved & published content. First 20 articles are rendered on the server,
  then **infinite scroll** loads 20 more with Ajax when the reader approaches the bottom.
- **Search** (title + summary), **filter** by category and by *viewed / not viewed*,
  **sort** by publication date or popularity — all without a page reload (URL is updated, so it can be bookmarked).
- Each card shows title, image, summary, category, reporter and publication date.
- **Article page** – full content is in the initial HTML from the server (SEO friendly, works without JavaScript).
  Every visit is counted for statistics.
- **Comments** – the list is rendered by the server; a new comment is added with Ajax and appears immediately.
- **Spam protection** – a guest device can post at most **3 comments per minute**. Enforced by the
  server (HTTP 429 + message). The device is identified by an anonymous cookie id *or* IP + browser,
  and the count is taken from the database, so it survives a server restart.
- **Weather widget** in the sidebar (choose a city).

### Reporter area (`/workspace`)
- List of the reporter's own articles with their status, filter by status, search.
- Create a new article, edit drafts, returned articles and published articles.
- **Autosave** – no "Save" button. Changes are saved to the server about 1 second after typing stops,
  immediately when the page is closed / hidden (`fetch` with `keepalive`), and a backup is kept in
  `localStorage` in case the network is down. Opening the article on another computer loads the last saved version.
- Send for editor approval, see the editor's note when an article is returned, fix and resubmit.
- Preview of the working version.

### Editor area (`/editor`)
- All articles, filtered by status (default: waiting for approval), search.
- Review page: view the submitted content, **approve & publish**, **return with a note**, edit, delete.
- For an **update to a published article** the page shows *currently published* and *new version*
  side by side, with changed fields highlighted and a word-level diff of the text.
- **Impact Analytics** (`/editor/analytics`) – choose an article and see a Chart.js graph of views over time
  with dashed vertical lines at every approved publication/update, plus a table comparing the average
  views per hour 24 hours before vs. after each update.
- **Users** management (create / edit / reset password / delete) and **comments moderation**.

### Article workflow
Statuses: **In preparation** (`draft`), **Awaiting editor approval** (`pending`),
**Published** (`published`), **Returned for corrections** (`returned`).

| Transition | Who |
|---|---|
| new article → In preparation | reporter |
| In preparation → Awaiting approval | the reporter who owns it |
| Awaiting approval → Published | editor |
| Awaiting approval → Returned (note required) | editor |
| Returned → Awaiting approval | the reporter who owns it |

Any other transition is rejected by the server (HTTP 409).
When a published article is edited, a **new revision** starts (status goes back to *In preparation*,
or *Awaiting approval* if an editor edits it) and goes through the same approval process.

**How "readers keep seeing the approved version" works:** each article stores two copies of its content:
`working` (what reporters/editors edit, autosaved) and `live` (the last version an editor approved).
The public site reads **only** `live`. Approving copies `working` → `live` and records a publish event
(time + editor), which is also used for the analytics markers.

---

## 4. Architecture and design decisions

### REST API
| Method & path | Description | Access |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | authentication | all |
| `GET /api/articles?q=&category=&viewed=&sort=&page=` | public feed | all |
| `GET /api/articles/:id` | published article | all |
| `GET/POST /api/articles/:id/comments` | list / add comments | all |
| `GET /api/comments`, `PUT/DELETE /api/comments/:id` | moderation | editor |
| `GET/POST /api/workspace/articles` | list (own / all) / create | reporter, editor |
| `GET/PUT/DELETE /api/workspace/articles/:id` | read / save working copy / delete | owner or editor |
| `PATCH /api/workspace/articles/:id/status` | workflow transition `{status, note}` | by rules above |
| `POST /api/uploads` | upload an image (base64 JSON, max 2MB, signature checked) | reporter, editor |
| `GET/POST /api/users`, `GET/PUT/DELETE /api/users/:id` | users CRUD | editor |
| `GET /api/stats/articles`, `GET /api/stats/articles/:id?range=&interval=` | analytics | editor |
| `GET /api/stats/articles/:id/buckets`, `PUT /api/stats/:statId`, `DELETE /api/stats/articles/:id` | raw statistics: list / correct / reset | editor |
| `GET /api/weather?city=`, `GET /api/weather/cities` | weather | all |

CRUD per model: **Users** – `/api/users`; **Articles** – `/api/workspace/articles` (+ public read/search);
**Comments** – `/api/articles/:id/comments` + `/api/comments/:id`; **View statistics** – created
automatically when an article is opened, read/updated/deleted through `/api/stats`.

### Security
- Passwords are hashed with **scrypt** + random salt (Node `crypto`) — one-way, never stored or returned.
- Login creates a random session token in an **httpOnly, SameSite=Lax cookie**. Only its SHA-256 hash is stored
  in MongoDB. The user and the **role are always loaded from the database**, never from data the browser can change.
- **All permission checks are on the server** (`middleware/auth.js`, `services/articleWorkflow.js`);
  hidden buttons are only for convenience.
- Data-changing API requests must be JSON (blocks cross-site form posts / CSRF).
- User input is validated on the client and the server; search text is regex-escaped; IDs are validated;
  output is escaped by EJS (`<%= %>`) and by `textContent` in the browser (no XSS).
- Safe redirects after login (local paths only), security headers, upload type & size checks.

### Login survives a server restart
Sessions are stored in MongoDB (not in server memory), so after `Ctrl+C` and `npm start`
a logged-in user continues working without logging in again. Expired sessions are removed by a TTL index.

### View statistics for thousands of readers
- Opening an article only increments a counter **in memory**. Every 5 seconds the counters are written
  to MongoDB with a single `bulkWrite` of `$inc` operations (also on shutdown, so nothing is lost).
- Views are stored **pre-aggregated per article per hour** (`ViewStat`, unique index `{article, bucket}`)
  — at most 24 small documents per article per day, instead of one document per view.
- The graph is a cheap indexed range query + `$group` by hour or day (`$dateTrunc`).
- `Article.viewCount` keeps the total for the "most popular" sort.

### Performance with thousands of articles
Compound indexes for the feed (`isLive + publishedAt`, `isLive + viewCount`, `isLive + category`),
the work areas (`author`, `status`) and comments; `lean()` queries with projections; paging of 20 items.

### External web service — weather
[Open-Meteo](https://open-meteo.com/) — free, no registration, no API key, no credit card.
The browser never calls the provider directly; it calls our server (`/api/weather`), which keeps a
**shared cache per city for 10 minutes**, so thousands of users cause at most one request per city every
10 minutes (data is never more than 15 minutes old). Parallel requests are merged into one, there is a
5-second timeout, and if the provider is down the widget shows the cached value (only if younger than
15 minutes) or a friendly message — the site keeps working.

### Errors and logs
A central error handler converts every error (validation, bad id, bad JSON, duplicate key, permissions…)
into a proper JSON response or error page — invalid input never crashes the server.
`logs/app.log` records requests that change data and operational events (logins, failed logins,
publishing, deletions, rate-limit hits…); `logs/error.log` records errors with stack traces.

---

## 5. Demo data (`npm run seed`)
- 1 editor and 6 reporters
- **600 articles** in all categories: ~485 public, including drafts, articles awaiting approval,
  returned articles (with editor notes), **30 articles updated 2–4 times after publication**, and
  35 published articles with a new version in progress / awaiting approval / returned
- ~1,500 comments
- ~250,000 hourly view statistics with daily cycles and visible jumps after each update

## 6. Suggested demo scenarios
1. **Permissions** – log in as `dana`, try to open `/editor` → 403. Try to edit another reporter's article → refused by the server.
2. **Workflow** – `dana` creates an article → sends it → `editor` returns it with a note → `dana` fixes and resubmits → `editor` approves.
3. **Editing a published article** – edit a published article as a reporter; the public page still shows the old version until the editor approves. The review page shows both versions side by side.
4. **Work continuity** – type in the editor, close the tab / refresh / open on another computer — the text is there.
5. **Restart** – stop the server (`Ctrl+C`), start it again, refresh — still logged in.
6. **Search & infinite scroll** on 600 articles; combine category, viewed/not-viewed and sort.
7. **Comment limit** – post 4 comments within a minute as a guest → the 4th is blocked with a message.
8. **Analytics** – `/editor/analytics`, pick one of the top articles (they have several updates).
9. **Weather** – change the city; disconnect the internet → the widget shows a friendly message while the site keeps working.
