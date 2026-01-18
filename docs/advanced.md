# Advanced usage

This CLI supports more commands and configuration options than the quick start. This file collects those details so the main README can stay focused.

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
- `kahunas workout sync`
  - Captures workout programs from the web UI and writes the cache.

### Sync alias

- `kahunas sync`
  - Alias for `kahunas workout sync`.

### Serve alias

- `kahunas serve`
  - Alias for `kahunas workout serve`.

## Workout sync details

Workout sync uses a headless browser session (by default) to capture workout programs from web requests and caches them at:

- `~/.config/kahunas/workouts.json`

If auto-capture does not find workouts, the CLI falls back to a manual prompt where you log in and navigate to the workouts screen before pressing Enter.

If there is no valid session token and no `auth.json`, `sync` prompts for credentials, saves them to `~/.config/kahunas/auth.json`, and continues. After syncing, it asks whether to start the preview server.

## Auth automation

If you add `~/.config/kahunas/auth.json`, the browser flow will attempt an automatic login. Example:

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

## Config file

The CLI stores session details in `~/.config/kahunas/config.json`.

Optional fields you may set:

- `debug` (`true`/`false`) enables extra logs on stderr.
- `headless` (`true`/`false`) controls whether Playwright shows a browser window.

## Workout events

The calendar endpoint returns log events with timestamps. The CLI returns the latest event summarized into a human-friendly structure (total volume sets, exercises, supersets).

Flags:

- `--minimal` returns raw event objects without program enrichment.
- `--full` returns full enriched output.
- `--debug-preview` logs preview discovery info to stderr.
- `--raw` prints raw API responses (no formatting).

If the user UUID is missing, `workout events` attempts to discover it from check-ins and saves it.

## Preview server

The HTML page is available at `http://127.0.0.1:3000` and the JSON endpoint is at `http://127.0.0.1:3000/api/workout`.
Use `?day=<index>` to switch the selected workout day tab.

## Playwright setup

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
