# Kahunas CLI

A TypeScript CLI for Kahunas (kahunas.io) to fetch check-ins and workouts.

![Kahunas CLI screenshot](https://unpkg.com/kahunas-cli@latest/ai-screenshot.png)

## Quick start

1) Install dependencies and build:

```bash
pnpm install
pnpm build
```

2) Log in once (opens a browser):

```bash
pnpm kahunas -- auth login
```

3) Fetch data:

```bash
pnpm kahunas -- checkins list
pnpm kahunas -- workout list
pnpm kahunas -- workout pick
```

You can also run without installing globally:

```bash
npx kahunas-cli checkins list
npx kahunas-cli workout events
```

## Commands

### Auth

- `kahunas auth login`
  - Opens a browser, lets you log in, and saves the `auth-user-token`.
- `kahunas auth status`
  - Checks whether the stored token is valid.
- `kahunas auth show`
  - Prints the stored token.

Tokens are saved to:

- `~/.config/kahunas/config.json`

### Check-ins

- `kahunas checkins list`
  - Lists recent check-ins.

### Workouts

- `kahunas workout list`
  - Lists workout programs.
- `kahunas workout pick`
  - Shows a numbered list and lets you choose a program.
- `kahunas workout latest`
  - Loads the most recently updated program.
- `kahunas workout events`
  - Lists workout log events with dates and a human-friendly workout summary (from the calendar endpoint).
- `kahunas workout serve`
  - Starts a local dev server with a workout preview page and a JSON endpoint that matches the CLI output.
- `kahunas workout program <id>`
  - Fetches a program by UUID.

### Workout sync (browser capture)

If the API list is missing a program you see in the web UI, run:

```bash
pnpm kahunas -- workout sync
```

This opens a browser, you log in, then navigate to your workouts page. After you press Enter, the CLI captures the workout list from network responses and writes a cache:

- `~/.config/kahunas/workouts.json`

`workout list`, `workout pick`, and `workout latest` automatically merge the API list with this cache.
Raw output (`--raw`) prints the API response only.

### Workout events (dates)

To see when workouts happened, the calendar endpoint returns log events with timestamps. By default each event is summarized into a human-friendly structure (total volume sets, exercises, supersets). Use `--full` to return the full program payload (best effort; falls back to cached summary if needed).

```bash
pnpm kahunas -- workout events --user <user-uuid>
```

Or via pnpm:

```bash
pnpm kahunas -- workout events
```

Default timezone is `Europe/London`. Override with `--timezone`.

You can filter by program or workout UUID:

```bash
pnpm kahunas -- workout events --program <program-uuid>
pnpm kahunas -- workout events --workout <workout-uuid>
```

Use `--minimal` to return the raw event objects without program enrichment. Use `--full` to return the full enriched output. Use `--latest` for only the most recent event, or `--limit N` for the most recent N events. Use `--debug-preview` to log where preview HTML was discovered (stderr only).

If the user UUID is missing, `workout events` will attempt to discover it from check-ins and save it. You can also set it directly:

- `KAHUNAS_USER_UUID=...`
- `--user <uuid>`

### Workout preview server

Run a local dev server to preview workouts in a browser:

```bash
pnpm kahunas -- workout serve
```

The HTML page is available at `http://127.0.0.1:3000` and the JSON endpoint is at `http://127.0.0.1:3000/api/workout`.
The JSON response matches the CLI output for `workout events --latest`, so there is only one data shape to maintain.

Options:

```bash
pnpm kahunas -- workout serve --program <program-uuid>
pnpm kahunas -- workout serve --workout <workout-uuid>
pnpm kahunas -- workout serve --limit 3
```

Use `?day=<index>` to switch the selected workout day tab in the browser.

## Auto-login

Most commands auto-login by default if a token is missing or expired. To disable:

```bash
pnpm kahunas -- checkins list --no-auto-login
```

## Flags

- `--raw` prints raw API responses (no formatting).
- `--headless` runs Playwright without a visible browser window.

## Environment variables

- `KAHUNAS_TOKEN`
- `KAHUNAS_CSRF`
- `KAHUNAS_CSRF_COOKIE`
- `KAHUNAS_COOKIE`
- `KAHUNAS_WEB_BASE_URL`
- `KAHUNAS_USER_UUID`

## Playwright

If Playwright did not download a browser during install:

```bash
pnpm exec playwright install chromium
```

## Testing

Run the unit tests with:

```bash
pnpm test
```

## Publishing

The npm package is built from `dist/cli.js`. Publishing runs the build automatically:

```bash
pnpm publish
```

## Notes

- This CLI uses the same APIs the web app uses; tokens can expire quickly.
- `auth login` is the most reliable way to refresh the token.
- `workout events` relies on session cookies captured during `auth login`.
