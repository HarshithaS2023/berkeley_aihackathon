# Learn and Grow

Adaptive quiz app with AI-generated questions, whiteboard work analysis, spoken hints, session analytics, and optional multiplayer.

**Stack:** React + Vite (frontend), FastAPI + Claude (backend), Supabase (auth + saved sessions).

---

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- API keys: [Anthropic](https://console.anthropic.com/), [Deepgram](https://console.deepgram.com/) (text-to-speech)
- Optional: [Supabase](https://supabase.com/) project (sign-in, analytics, competitions)

---

## 1. Clone and install frontend dependencies

```bash
git clone <repo-url>
cd quizcraft
npm install
```

---

## 2. Python virtual environment

Create and activate a venv in the project root. **Always use this venv for the backend** so dependencies match `requirements.txt`.

### Windows (PowerShell)

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

---

## 3. Environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env` in the **project root**. Vite loads `VITE_*` variables from this file during `npm run dev`.

### Backend (required)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `ANTHROPIC_MODEL` | Model id (default: `claude-sonnet-4-6-20251001`) |
| `DEEPGRAM_API_KEY` | Deepgram key for `/speak` (spoken hints) |
| `DEEPGRAM_SPEAK_MODEL` | Optional; default `aura-2-asteria-en` |

### Frontend API routing (recommended for local dev)

With the Vite proxy, the app calls `/api/...` and Vite forwards to the backend on port 3001:

```env
VITE_API_BASE=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:3001
```

Alternatively, call the backend directly (no proxy):

```env
VITE_API_BASE=http://127.0.0.1:3001
```

### Supabase (optional — sign-in, analytics, competitions)

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

After creating a Supabase project:

1. Enable **Email** under Authentication → Providers.
2. In the SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql) for a new project.
3. If tables already exist with open RLS, also run [`supabase/auth_migration.sql`](supabase/auth_migration.sql).

---

## 4. Run the app

Use **two terminals**, both from the project root.

### Terminal 1 — Backend (with venv activated)

**Windows:**

```powershell
.\venv\Scripts\Activate.ps1
.\venv\Scripts\python -m uvicorn claude_api:app --host 127.0.0.1 --port 3001 --reload
```

**macOS / Linux:**

```bash
source venv/bin/activate
python -m uvicorn claude_api:app --host 127.0.0.1 --port 3001 --reload
```

Verify the backend:

```bash
curl http://127.0.0.1:3001/health
```

You should see `"status": "ok"`. If `deepgramConfigured` is `false`, check `DEEPGRAM_API_KEY` in `.env` and restart the server.

> **Note:** `npm run backend` uses `python3`, which may not exist on Windows. Prefer the venv commands above.

### Terminal 2 — Frontend

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

---

## 5. Production build

```bash
npm run build
npm run preview
```

The backend must still be running separately for API routes unless you deploy it elsewhere and set `VITE_API_BASE` to that URL at build time.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED 127.0.0.1:3001` | Start the backend on port 3001 before using the app |
| `/speak` returns 503 | Set `DEEPGRAM_API_KEY` in `.env` and restart uvicorn |
| `python3` not found (Windows) | Use `.\venv\Scripts\python` instead |
| Module not found after `pip install` | Activate venv, then `pip install -r requirements.txt` |
| Analytics / login errors | Configure Supabase vars and run the SQL migrations |
| API calls fail in dev | Ensure `VITE_API_BASE=/api` and backend is on the proxy target port |

---

## Project layout

| Path | Purpose |
|------|---------|
| `src/` | React frontend |
| `claude_api.py` | FastAPI backend (Claude, Deepgram, question queue) |
| `requirements.txt` | Python dependencies |
| `.env` | Secrets and config (not committed) |
| `.env.example` | Template for required variables |
| `supabase/` | Database schema and migrations |
