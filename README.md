# personal-site

Resume/portfolio website. React (Vite) frontend + FastAPI backend, deployed on Render.

## Structure

```
frontend/   React app (Vite) — the resume site, served as a static site
backend/    FastAPI app — /api/projects, /api/health; add project APIs here
render.yaml Render Blueprint — defines both services for auto-deploy
```

## Local development

Two terminals:

```sh
# Terminal 1 — backend (http://localhost:8000)
cd backend
python3 -m venv .venv && source .venv/bin/activate   # first time only
pip install -r requirements.txt                       # first time only
uvicorn main:app --reload

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install                                           # first time only
npm run dev
```

The Vite dev server proxies `/api/*` to the backend, so the frontend just
fetches `/api/projects` and it works in both dev and production.

## First-time GitHub setup

```sh
gh auth login                        # if gh is installed (brew install gh)
gh repo create personal-site --private --source . --push
```

Or without the GitHub CLI: create an empty repo named `personal-site` on
github.com, then:

```sh
git remote add origin git@github.com:YOUR_USERNAME/personal-site.git
git push -u origin main
```

## Deploying to Render

1. Sign in at https://render.com with GitHub.
2. New → Blueprint → select the `personal-site` repo. Render reads
   `render.yaml` and creates both services.
3. After the API service deploys, copy its URL
   (e.g. `https://personal-site-api.onrender.com`) and set it as the
   `VITE_API_URL` environment variable on the static site service, then
   trigger a redeploy of the frontend.

After that, every `git push` to `main` deploys automatically.

Note: the API runs on Render's free tier, which spins down after ~15 min of
inactivity (first request takes ~30–50 s). Upgrade the service to Starter
($7/mo) to keep it always on.
