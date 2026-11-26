# WeChat Mini Game Subtree Notes

Follow root `../AGENTS.md` (edit `../shared/js/` and run `npm run sync` / `npm run verify` from root).
- Open this directory in WeChat DevTools (no local package manager/build); verify startup, drag/place, tools, line clears, audio, vibration, safe areas, persistence, and hide/show on real changes.
- Never expose `project.private.config.json`, credentials, admin/member codes, or session secrets; WeChat code `upload` requires explicit user authorization.
