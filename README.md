# Kahunas CLI

A TypeScript CLI for Kahunas (kahunas.io) to fetch check-ins and workouts.

## Quick start

1) Install dependencies and build:

```bash
pnpm install
pnpm build
```

2) Log in once (opens a browser):

```bash
node dist/cli.js auth login
```

3) Fetch data:

```bash
node dist/cli.js checkins list
node dist/cli.js workout list
node dist/cli.js workout pick
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
  - Lists workout log events with dates (from the calendar endpoint).
- `kahunas workout program <id>`
  - Fetches a program by UUID.

### Workout sync (browser capture)

If the API list is missing a program you see in the web UI, run:

```bash
node dist/cli.js workout sync
```

This opens a browser, you log in, then navigate to your workouts page. After you press Enter, the CLI captures the workout list from network responses and writes a cache:

- `~/.config/kahunas/workouts.json`

`workout list`, `workout pick`, and `workout latest` automatically merge the API list with this cache.
Raw output (`--raw`) prints the API response only.

### Workout events (dates)

To see when workouts happened, the calendar endpoint returns log events with timestamps:

```bash
node dist/cli.js workout events --user <user-uuid>
```

Default timezone is `Europe/London`. Override with `--timezone`.

You can filter by program or workout UUID:

```bash
node dist/cli.js workout events --program <program-uuid>
node dist/cli.js workout events --workout <workout-uuid>
```

The user UUID is saved automatically after `checkins list`, or you can set it:

- `KAHUNAS_USER_UUID=...`
- `--user <uuid>`

## Auto-login

Most commands auto-login by default if a token is missing or expired. To disable:

```bash
node dist/cli.js checkins list --no-auto-login
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

## Notes

- This CLI uses the same APIs the web app uses; tokens can expire quickly.
- `auth login` is the most reliable way to refresh the token.
