# Pomodoro Focus Timer

Modern, responsive Pomodoro timer optimised for iPad, mobile, and desktop.  
Built as a static React app (via CDN) with sound alerts, browser notifications, and screen wake support for long study sessions.

## Features

- **Pomodoro flow**
  - Default **25 min focus**, **5 min short break**, **30 min long break**
  - After **4 focus sessions** you automatically get a long break
- **Fully configurable**
  - Change focus, short break, and long break durations
  - Change how many pomodoros before a long break
  - Settings are stored in `localStorage` per device
- **Notifications**
  - **Audio chime** at the end of every session
  - **Browser notifications** (where supported and permitted)
- **Screen wake / iPad support**
  - Uses the **Screen Wake Lock API** (on supported browsers) to keep the display awake while the timer runs
  - For iPad, you can also set **Settings → Display & Brightness → Auto-Lock → Never** for best results
- **Modern UI**
  - Tomato/pomodoro-themed circular timer
  - Dark, glassy UI that adapts to mobile, tablet, and desktop

## Tech stack

- **React 18** via CDN (UMD build) – no bundler required
- **JSX** compiled in-browser by **Babel Standalone**
- Pure CSS for layout and design
- Static hosting friendly – works on any static file host (AWS Amplify, S3, GitHub Pages, Nginx, etc.)

## Project structure

```text
index.html      # Entry point, loads React/ReactDOM and mounts the app
app.js          # React app with timer logic, settings, notifications, wake lock
style.css       # All styling and layout
favicon.svg     # Tomato timer icon
Dockerfile      # nginx-based image serving the static site
.github/
  workflows/
    docker-publish.yml  # Build & push Docker image to GitHub Container Registry
```

## Running locally (no Docker)

Because this is a static site, you can run it locally with any simple HTTP server.

### Option 1 – Quick test by opening the file

You can open `index.html` directly in the browser, but some browsers limit features (like notifications) on `file://` URLs. For best results, use a local HTTP server (Option 2).

### Option 2 – Using a simple HTTP server

From the project root (`pomodoro`):

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

in your browser.

## Using the app

1. **Open the site** (locally or via your hosting URL).
2. **Adjust session settings** in the “Session settings” panel if you want something other than 25/5/30 and 4 pomodoros.
3. Click **Start** to begin a focus session.
4. At the end of each session:
   - a **short chime** plays, and
   - a **browser notification** appears (if you enabled notifications and the tab is allowed).
5. The app automatically switches between **Focus → Short Break → Focus … → Long Break** according to your settings.
6. Use the **mode tabs** (Focus / Short break / Long break) if you want to manually jump to a specific phase.

### Notifications

- Click **“Enable notifications”** in the Notifications panel the first time you use the app.
- Your browser will ask for permission; choose **Allow**.
- Notifications will then appear at the end of each session, even if the tab is in the background (subject to browser/OS rules).

### Sound

- Click **“Test chime”** to confirm audio works on your device.
- Many mobile browsers require a user interaction before playing sound; starting the timer or testing the chime satisfies this.

### Screen wake / iPad

- The app uses the **Screen Wake Lock API** where available:
  - When the timer is running, it requests a wake lock to keep the screen from sleeping.
  - When the timer is paused or finishes, the wake lock is released.
- On iPad or iPhone, you can additionally set:
  - `Settings → Display & Brightness → Auto-Lock → Never`
  to avoid aggressive auto-lock behaviour while studying.

## Deploying to AWS Amplify

AWS Amplify Hosting can deploy this as a **static web app** directly from your GitHub repo.

1. **Push the project to GitHub**

   ```bash
   cd /path/to/pomodoro
   git init
   git add .
   git commit -m "Initial React pomodoro timer"
   git branch -M main
   git remote add origin git@github.com:dpsiom/pomodoro.git   # or https URL
   git push -u origin main
   ```

2. **Create an Amplify app**
   - In the AWS console, go to **Amplify → Hosting → Get started**.
   - Choose **Host web app**.
   - Select **GitHub**, authorize if needed, and pick the `dpsiom/pomodoro` repo and `main` branch.

3. **Configure build settings**
   - Framework: **Static web app** (no special React framework build required).
   - Build command: **leave empty** (no build step – we serve the files as-is).
   - Output directory: `/` (root).

4. **Save and deploy**
   - Amplify will clone the repo, skip a build (no command), and publish `index.html` and the static assets.
   - It then provides you with a public URL.

5. **Continuous deployment**
   - Any push to the connected branch (`main`) automatically triggers a new deployment.

## Docker image (local testing)

The included `Dockerfile` builds a small image using Nginx to serve the static site.

### Build the image

From the project root:

```bash
docker build -t pomodoro-timer:local .
```

### Run the container

```bash
docker run --rm -p 8080:80 pomodoro-timer:local
```

Then open:

```text
http://localhost:8080
```

in your browser.

## Docker image to GitHub Packages (GitHub Container Registry)

This repo includes a **GitHub Actions workflow** that builds and pushes the image to GitHub Container Registry when changes are pushed to `main`/`master`.

- Workflow: `.github/workflows/docker-publish.yml`
- Target image: `ghcr.io/<OWNER>/pomodoro:latest`

Once the repo is on GitHub:

1. Ensure the default branch is `main` (or `master`).
2. Push to that branch; GitHub Actions will:
   - build the Docker image from the root `Dockerfile`
   - push it to `ghcr.io/<your-account>/pomodoro:latest`

### Manual push (optional)

You can also build and push manually:

```bash
# Log in to GitHub Container Registry
echo "$GITHUB_TOKEN" | docker login ghcr.io -u dpsiom --password-stdin

# Build and tag the image
docker build -t ghcr.io/dpsiom/pomodoro:latest .

# Push the image
docker push ghcr.io/dpsiom/pomodoro:latest
```

Where `GITHUB_TOKEN` is a GitHub personal access token with `write:packages` permission.

---

If you want to extend this in future (e.g. stats/history, different profiles, or a true bundler-based React setup), this static version can be ported into a standard React toolchain easily.

