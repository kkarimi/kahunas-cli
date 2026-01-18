# Kahunas CLI

A TypeScript CLI for Kahunas (kahunas.io) to fetch check-ins and workouts.

![Kahunas CLI screenshot](https://unpkg.com/kahunas-cli@latest/ai-screenshot.png)

## Quick start

1) Install dependencies and build:

```bash
pnpm install
pnpm build
```

2) Fetch data (browser login runs automatically on first run, headless by default):

```bash
pnpm kahunas checkins list
pnpm kahunas workout list
pnpm kahunas workout pick
```

You can also run without installing globally:

```bash
npx kahunas-cli checkins list
npx kahunas-cli workout events
```

## Commands

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
pnpm kahunas sync
```

Or:

```bash
pnpm kahunas workout sync
```

This runs a browser session (headless by default). You log in, then navigate to your workouts page. After you press Enter, the CLI captures the workout list from network responses and writes a cache:

- `~/.config/kahunas/workouts.json`

`workout list`, `workout pick`, and `workout latest` automatically merge the API list with this cache.
Raw output (`--raw`) prints the API response only.

If you add `~/.config/kahunas/auth.json`, the browser flow will attempt an automatic login and open your workouts page before capturing. Example:

```json
{
  "email": "you@example.com",
  "password": "your-password"
}
```

Keep this file private; it contains credentials.

Optional fields:

- `username` (use instead of `email`)
- `loginPath` (default: `/dashboard`)

If auto-capture does not find workouts, the CLI falls back to the manual prompt.

### Workout events (dates)

To see when workouts happened, the calendar endpoint returns log events with timestamps. The CLI returns the latest event summarized into a human-friendly structure (total volume sets, exercises, supersets). Use `--full` to return the full program payload (best effort; falls back to cached summary if needed).

```bash
pnpm kahunas workout events
```

Use `--minimal` to return the raw event objects without program enrichment. Use `--full` for full enriched output. Use `--debug-preview` to log where preview HTML was discovered (stderr only).

If the user UUID is missing, `workout events` will attempt to discover it from check-ins and save it.

### Workout preview server

Run a local dev server to preview workouts in a browser:

```bash
pnpm kahunas serve
```

Or:

```bash
pnpm kahunas workout serve
```

The HTML page is available at `http://127.0.0.1:3000` and the JSON endpoint is at `http://127.0.0.1:3000/api/workout`.
The JSON response matches the CLI output for `workout events`, so there is only one data shape to maintain.

Use `?day=<index>` to switch the selected workout day tab in the browser.

## Auto-login

Most commands auto-login if a token is missing or expired. This runs a browser session and saves session details in `~/.config/kahunas/config.json` (headless by default). If `~/.config/kahunas/auth.json` is present, the login step is automated.

## Debug logging

Set `debug` to `true` in `~/.config/kahunas/config.json` to enable extra logs on stderr (includes workout preview debug output).

## Headless mode

Set `headless` to `false` in `~/.config/kahunas/config.json` to show the Playwright browser. Defaults to `true`.

## Flags

- `--raw` prints raw API responses (no formatting).

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
- Re-run any command (or `workout sync`) to refresh login when needed.
- Informational logs are colorized; set `NO_COLOR=1` to disable colors.
