# macWTF — website

Catalogue browser for [macWTF](https://github.com/naturalstate/macWTF). Explore the
tooling macOS leaves out, build a pack, and generate the install commands for
whichever package managers you actually use.

> **MVP preview.** The catalogue is generated from a draft document and the
> package names are **not verified**. The generated commands are illustrative —
> do not run them yet.

## Running it

No build step. It is a static folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Preact and htm load as ES modules from a CDN, so there is nothing to install.
Moving to Vite later means keeping the components and swapping htm for JSX.

## Layout

```
index.html                    markup and style links
assets/app.js                 the whole app: search, filter, pack builder, commands
assets/app.css                dark theme
data/tools.json               generated catalogue
scripts/parse_catalogue.py    markdown draft -> tools.json
```

## Regenerating the catalogue

```bash
python3 scripts/parse_catalogue.py ../macWTF/macwtf-catalogue.md data/tools.json
```

Eventually this should read the TOML manifests from the macWTF repo instead of
the draft markdown, so the site and the CLI cannot disagree about what exists.

## Not done yet

Verified package names · real links to upstream projects · curated packs ·
per-tool install options · syncing with the macWTF manifests · sharing a pack
by URL.

## License

MIT
