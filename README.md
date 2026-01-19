# Kahunas CLI

Fetch workouts from Kahunas and preview them locally.

## Quick start

1) Install and build:

```bash
pnpm install
pnpm build
```

2) Optional: add auto-login credentials at `~/.config/kahunas/auth.json`:

```json
{
  "email": "you@example.com",
  "password": "your-password"
}
```

3) Sync workouts, then run the preview server:

```bash
pnpm kahunas sync
pnpm kahunas serve
```

Open `http://127.0.0.1:3000`.

If `auth.json` is missing, `sync` will prompt for credentials and save them after a successful login.
After syncing, the CLI prints the cache JSON written to `~/.config/kahunas/workouts.json`, including calendar events with per-exercise date labels.
Raw Kahunas payloads are cached under `~/.config/kahunas/cache` for offline preview.

## Testing

Run the test suite:

```bash
pnpm test
```

Generate coverage reports (CI enforces coverage thresholds):

```bash
pnpm test:coverage
```

## Advanced usage

See `docs/advanced.md` for all commands, flags, and configuration options.
