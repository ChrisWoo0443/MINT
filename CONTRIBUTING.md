# Contributing to MINT

Thanks for your interest in contributing! MINT is a small project, so contributions are welcome but please open an issue first for anything non-trivial so we can align on scope before you write code.

## Development setup

```bash
git clone https://github.com/ChrisWoo0443/MINT.git
cd MINT
npm install
npm run dev
```

You'll need:

- macOS with Apple Silicon (system audio capture is macOS-specific)
- Node.js 20+
- A [Deepgram API key](https://console.deepgram.com) for transcription
- An OpenAI key, or a local [Ollama](https://ollama.com) install, for note generation

API keys are entered in the app's Settings panel — there's no `.env` file.

## Before submitting a PR

Please run these locally and make sure they pass:

```bash
npm run typecheck    # TypeScript checks (node + web)
npm run lint         # ESLint
npm test             # Vitest
```

For UI changes, also run `npm run dev` and exercise the feature in the actual app — typecheck and tests don't catch broken UI.

## Pull requests

- Fork, branch off `main`, and open the PR against `main`.
- Keep PRs focused on a single change. Smaller is easier to review.
- If your PR fixes an issue, link it in the description (`Fixes #123`).
- Update the README if you change user-facing behavior or add a setting.

## Commit conventions

- Atomic, descriptive messages — say what changed, nothing more.
- No conventional-commit prefixes (no `feat:`, `fix:`, `chore:`, etc.).
- No co-author trailers.
- One logical change per commit when reasonable.

Examples:

```
add color tag rename in settings
fix transcript scroll jump on new entry
move audio downsampling into a worker
```

## Code style

- TypeScript everywhere. Avoid `any`; prefer narrowing.
- Match the existing style — don't reformat unrelated code in the same PR.
- React 19 — use `React.JSX.Element`, not `JSX.Element`.
- Keep changes surgical. If you spot unrelated cleanup, mention it in the PR description rather than bundling it in.

## What's in scope

Good things to work on:

- Bug fixes (transcription glitches, UI regressions, edge cases in storage)
- Improvements to existing features
- Test coverage for areas that don't have it
- Performance and reliability improvements

Out of scope without prior discussion:

- New cloud integrations or backends — MINT is local-first by design
- Cross-platform support (Windows/Linux) — macOS-only is intentional for now
- Major architectural rewrites

If you're not sure whether something fits, open an issue and ask.

## Reporting bugs

Use the issue templates in [.github/ISSUE_TEMPLATE](.github/ISSUE_TEMPLATE). Include macOS version, MINT version, and steps to reproduce. Logs from the app's developer tools (View → Toggle Developer Tools) are very helpful for transcription or audio issues.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
