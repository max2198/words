# words-app

English-Russian word flashcards with SM-2 spaced repetition.

## Run

```
npm start          # serves on http://localhost:3000
```

No dependencies, no build step. `server.js` is a bare Node `http` static file server — edits to `index.html`, `script.js`, `styles.css` are reflected immediately on reload.

## Structure

| File | Role |
|------|------|
| `index.html` | Single-page app shell |
| `script.js` | All client-side logic and SM-2 algorithm |
| `styles.css` | All styling |
| `server.js` | Static file server, port 3000 |
| `words.json` | Word list — array of `{english, russian, transcription}` |
| `plans/` | Design docs (e.g. SM-2 plan) |

## Data & state

- Word list: `words.json` — edit directly, reload the page to pick up changes.
- Progress: stored in browser `localStorage` under key `wordsProgress`. Each word key is the lowercased English word. To reset progress, clear localStorage or delete the key.
- The SM-2 algorithm lives in the `SpacedRepetition` class in `script.js`.

## Conventions

- No linting, no tests, no typecheck.
- UI language is Russian; code comments are Russian.
- `.gitignore` only excludes `.aider*`.
