# taplink

`taplink` is a Chrome extension that brings `quicklink`-style prefetching to arbitrary websites.

It watches same-origin links that become visible in the viewport and adds a low-priority `rel="prefetch"` hint for likely next navigations. It also reacts to pointer intent so hovered links can warm up before the click lands.

## Behavior

- Prefetches only `http/https` links on the same origin as the current page
- Ignores downloads, `_blank` targets, `rel="external"` links, and hash-only jumps
- Backs off entirely when the browser reports `Save-Data` or a `2g/slow-2g` connection
- Uses a capped observer/prefetch budget to avoid going wild on link-heavy pages

## Stack

- Vite
- CRXJS
- TypeScript
- Vitest
- happy-dom

The project structure intentionally mirrors `~/src/github.com/mkusaka/github-pr-ci-skip-toggle-checkbox`.

## Development

```bash
pnpm install
pnpm test:run
pnpm build
```

## Load in Chrome

1. Run `pnpm build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click Load unpacked
5. Select the generated `dist` directory

## Package

```bash
pnpm package
```
