# Project Instructions

These instructions apply to the entire repository and extend `/home/ubuntu/AGENTS.md`.

## Issue-first workflow

- Create or select a GitHub issue before changing tracked files.
- Apply one `priority:P0` through `priority:P3` label and the relevant `area:*` label.
- Record concrete acceptance criteria in the issue and link every pull request to it.
- Work on a separate branch. Never push changes directly to `main`.
- Keep issue status, labels, milestone, and priority accurate as the work changes.

## Architecture and generated output

- This is a Vite/React static application deployed by AWS Amplify.
- `src/App.jsx` owns UI behavior; pure timer logic belongs in `src/timer.js`.
- `npm run build` creates `dist/`, then pre-renders the initial React markup for crawlers.
- `dist/` is generated and must not be committed.
- `package.json` is the only application-version source. User-visible releases must bump it.
- The production footer must display that exact package version.

## Required checks

Run `npm ci` after dependency changes and commit `package-lock.json`.

Before committing, run:

```bash
npm run check
```

This covers linting, unit tests, a production/pre-render build, Chromium behavior and
responsive checks, and Lighthouse thresholds. A crawlability change must also confirm:

- the built HTML has exactly one meaningful H1;
- title, description, canonical, robots, sitemap, and JSON-LD use the production URL;
- the page renders without browser console or hydration errors;
- the footer version matches `package.json`.

## Releases and deployment

- Use semantic versions and the matching `vX.Y.Z` Git tag.
- Amplify reads `amplify.yml`, builds `dist/`, and deploys merges to `main`.
- After merge, monitor `https://pomodoro.iomdev.com/` until its footer shows the new version.
- Verify `/`, `/robots.txt`, `/sitemap.xml`, the social image, and Lighthouse against production.
- Do not submit a URL for crawling until the production checks pass.

## GitHub and attribution

- Pull requests require the `quality` check and must satisfy the linked issue criteria.
- Preserve the configured human Git author/committer identity.
- End Codex-created commits with `Co-authored-by: Codex <noreply@openai.com>` after a blank line.
- Add `AI-assisted by OpenAI Codex.` to Codex-created pull request descriptions.
