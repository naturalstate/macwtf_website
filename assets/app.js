// macWTF catalogue.
//
// Zero build step: Preact and htm are vendored in assets/vendor and resolved
// by an import map, so the site is a static folder that serves from GitHub
// Pages with nothing installed and contacts no third party.
//
// The catalogue is generated from macWTF's TOML manifests by
// scripts/sync_catalogue.py, so the site and the CLI cannot disagree about
// what exists or what it does.

import { h, render } from "preact";
import { useState, useMemo, useEffect, useCallback } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

const FLAG_LABEL = {
  quarantine: "UNSIGNED", tcc: "PERMISSION", rosetta: "ROSETTA",
};
const FLAG_HELP = {
  quarantine: "Unsigned — Gatekeeper blocks the first launch until the quarantine attribute is removed. macWTF asks before doing that.",
  tcc: "Needs a macOS privacy permission that no installer can grant. You grant it by hand in System Settings.",
  rosetta: "An Intel build; needs Rosetta 2.",
};

const COMMAND = {
  brew: p => `brew install ${p}`,
  cask: p => `brew install --cask ${p}`,
  mas: p => `mas install ${p}`,
  pipx: p => `pipx install ${p}`,
  cargo: p => `cargo install ${p}`,
  go: p => `go install ${p}@latest`,
  npm: p => `npm install -g ${p}`,
  gem: p => `gem install ${p}`,
  git: p => `git clone ${p}`,
  curl: p => `curl -fSLO ${p}`,
  docker: p => `docker pull ${p}`,
  builtin: p => `# ${p} ships with macOS`,
  manual: p => `# ${p} — manual download`,
  defaults: p => `defaults write ${p}`,
};
const BACKEND_ORDER = ["brew","cask","mas","pipx","go","cargo","npm","gem","git","curl","defaults","builtin","manual"];

const cmdFor = t => (COMMAND[t.backend] || COMMAND.manual)(t.package || t.id);

// Saved packs live in localStorage. No account, no server: a pack is just a
// list of ids, and a list of ids fits in a URL.
const STORE = "macwtf.packs";

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE) || "[]"); }
  catch { return []; }
}
function storeSaved(packs) {
  try { localStorage.setItem(STORE, JSON.stringify(packs)); } catch {}
}
// A share link carries the ids themselves, so it works for anyone opening it
// without either of us needing somewhere to put it.
const shareURL = (name, ids) =>
  `${location.origin}${location.pathname}#/share/${encodeURIComponent(name)}~${ids.join(",")}`;

// toggleIn adds or removes a value from a list, for multi-select filters.
const toggleIn = (list, v) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];

function FilterGroup({ label, options, active, onToggle }) {
  return html`
    <div class="fgroup">
      <div class="flabel">${label}</div>
      <div class="frow">
        ${options.map(o => {
          const [val, text] = Array.isArray(o) ? o : [o, o];
          return html`
            <button class="chip ${active.includes(val) ? "on" : ""}" key=${val}
                    onClick=${() => onToggle(val)}>${text}</button>`;
        })}
      </div>
    </div>`;
}

// ------------------------------------------------------------------ routing

function useRoute() {
  const parse = () => {
    const raw = location.hash.replace(/^#\/?/, "");
    const [name, arg] = raw.split("/");
    return { name: name || "home", arg: arg ? decodeURIComponent(arg) : "" };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

// -------------------------------------------------------------- components

function Copyable({ text }) {
  const [done, setDone] = useState(false);
  return html`
    <div>
      <pre class="cmd">${text}</pre>
      <button class="copy" onClick=${() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true); setTimeout(() => setDone(false), 1200);
        });
      }}>${done ? "copied" : "copy"}</button>
    </div>`;
}

function Nav({ route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.name, route.arg]);

  const links = html`
    <a href="#/" class=${route.name === "home" ? "on" : ""}>Home</a>
    <a href="#/tools" class=${route.name === "tools" ? "on" : ""}>Tools</a>
    <a href="#/packs" class=${route.name === "packs" || route.name === "pack" ? "on" : ""}>Packs</a>
    <a href="https://github.com/naturalstate/macWTF">GitHub</a>`;

  return html`
    <nav class="top">
      <div class="nav-inner">
        <a class="brand" href="#/"><span class="mark">m</span> macWTF</a>
        <div class="nav-links">${links}</div>
        <div class="nav-right"><a class="btn sm" href="#/tools">Browse tools</a></div>
        <button class="burger ${open ? "open" : ""}" aria-label="Menu"
                aria-expanded=${String(open)} onClick=${() => setOpen(!open)}>
          <span></span><span></span><span></span>
        </button>
      </div>
      <div class="drawer ${open ? "open" : ""}">${links}</div>
    </nav>`;
}

// packTools resolves a pack definition to the tools it contains.
function packTools(data, pack) {
  const byId = Object.fromEntries(data.tools.map(t => [t.id, t]));
  const ids = new Set();
  if (pack.profile) {
    const p = data.packs.find(x => x.id === pack.profile);
    if (p) p.tools.forEach(i => ids.add(i));
  }
  (pack.categories || []).forEach(c =>
    data.tools.filter(t => t.category === c).forEach(t => ids.add(t.id)));
  (pack.tools || []).forEach(i => ids.add(i));
  return [...ids].map(i => byId[i]).filter(Boolean);
}

function PackGrid({ data, packs }) {
  return html`
    <div class="packs">
      ${packs.featured.map(p => html`
        <a class="pack" key=${p.id} href=${`#/pack/${p.id}`} style=${`--pack:${p.accent}`}>
          <span class="glyph">${p.glyph}</span>
          <div class="tagline">${p.tagline}</div>
          <h3>${p.name}</h3>
          <p>${p.blurb}</p>
          <div class="foot"><span class="n">${packTools(data, p).length} tools</span> · view pack</div>
        </a>`)}
    </div>`;
}

// ------------------------------------------------------------------- home

const INSTALL = "git clone https://github.com/naturalstate/macWTF.git && cd macWTF && ./install.sh";

function Home({ data, packs }) {
  const verified = data.tools.filter(t => !t.unverified).length;

  return html`
    <div class="wrap">
      <header class="hero">
        <span class="stamp">✦ Apple Silicon · macOS</span>
        <h1>The tooling macOS <span class="zing">leaves out</span>.</h1>
        <p class="sub">
          ${data.tools.length} curated tools for pentesting, InfoSec and development,
          installed through whichever package manager each one actually needs — and every
          manual step macOS still demands collected into one list at the end.
        </p>
        <div class="cta">
          <a class="btn" href="#/packs">Browse packs</a>
          <a class="btn ghost" href="#/tools">All ${data.tools.length} tools</a>
        </div>
        <div class="install-line" style="margin-top:26px;max-width:660px">
          <span>${INSTALL}</span>
          <button onClick=${e => {
            navigator.clipboard?.writeText(INSTALL);
            const b = e.currentTarget; b.textContent = "copied";
            setTimeout(() => (b.textContent = "copy"), 1200);
          }}>copy</button>
        </div>
        <div class="stats">
          <div class="stat"><b>${data.tools.length}</b><span>tools</span></div>
          <div class="stat"><b>${verified}</b><span>verified upstream</span></div>
          <div class="stat"><b>${data.categories.length}</b><span>categories</span></div>
          <div class="stat"><b>10</b><span>package managers</span></div>
        </div>
      </header>

      <section>
        <div class="sec-head">
          <h2>Start with a <span class="zing">pack</span></h2>
          <p>Curated sets. Take one whole, or open it and pick.</p>
        </div>
        <${PackGrid} data=${data} packs=${packs} />
      </section>

      <section>
        <div class="sec-head">
          <h2>One catalogue, <span class="zing">four platforms</span></h2>
          <p>Each tool is described once. Only the install command differs.</p>
        </div>
        <div class="platforms">
          <div class="plat on"><b>macOS</b><span>available now</span></div>
          <div class="plat"><b>Kali</b><span>coming soon</span></div>
          <div class="plat"><b>Windows</b><span>coming soon</span></div>
          <div class="plat"><b>Android</b><span>coming soon</span></div>
        </div>
      </section>

      <section>
        <div class="sec-head"><h2>Why not just a <span class="zing">Brewfile</span>?</h2></div>
        <div class="packs">
          <div class="pack" style="--pack:var(--orange)">
            <span class="glyph">⚠</span>
            <h3>Gatekeeper blocks half of it</h3>
            <p>Reverse engineering and RF tools are mostly unsigned, so macOS refuses to
               launch them behind a dialog whose only button is Move to Trash. macWTF knows
               which ones, and offers to clear it — never silently.</p>
          </div>
          <div class="pack" style="--pack:var(--cyan)">
            <span class="glyph">◑</span>
            <h3>Permissions cannot be scripted</h3>
            <p>Full Disk Access, Screen Recording, Accessibility. No installer can grant
               these. Every one your run needs is collected into a numbered checklist
               naming the exact System Settings pane.</p>
          </div>
          <div class="pack" style="--pack:var(--danger)">
            <span class="glyph">⊘</span>
            <h3>Some of it is a lie on macOS</h3>
            <p>Wireless monitor mode has been dead since Big Sur. Tools that install
               perfectly and then cannot work are left out of the macOS catalogue entirely,
               rather than left for you to discover mid-engagement.</p>
          </div>
        </div>
      </section>
    </div>`;
}

function Packs({ data, packs }) {
  const [saved, setSaved] = useState(loadSaved);

  const remove = id => {
    const next = loadSaved().filter(p => p.id !== id);
    storeSaved(next);
    setSaved(next);
  };

  return html`
    <div class="wrap">
      <section>
        <div class="sec-head">
          <h2>Your <span class="zing">packs</span></h2>
          <p>Built from your own selection. Stored in this browser only.</p>
        </div>
        <div class="packs" style="margin-bottom:18px">
          <a class="pack" href="#/tools" style="--pack:var(--cyan)">
            <span class="glyph">✛</span>
            <div class="tagline">Start from scratch</div>
            <h3>Build a pack</h3>
            <p>Browse all ${data.tools.length} tools, press + on the ones you want, then save
               the selection as a pack you can re-open or share.</p>
            <div class="foot"><span class="n">Open the catalogue</span></div>
          </a>
        </div>
        ${saved.length === 0
          ? html`<div class="note" style="margin:0">
                   Nothing saved yet — anything you build will appear here.
                 </div>`
          : html`<div class="packs">
              ${saved.map(p => html`
                <div class="pack" key=${p.id} style="--pack:var(--accent)">
                  <span class="glyph">◆</span>
                  <div class="tagline">Your pack</div>
                  <h3>${p.name}</h3>
                  <p>${p.tools.length} tools, saved in this browser.</p>
                  <div class="foot" style="gap:14px">
                    <a href=${`#/pack/${p.id}`} class="n">Open</a>
                    <a href="#" onClick=${e => {
                      e.preventDefault();
                      navigator.clipboard?.writeText(shareURL(p.name, p.tools));
                      e.target.textContent = "link copied";
                      setTimeout(() => (e.target.textContent = "Share"), 1400);
                    }}>Share</a>
                    <a href="#" onClick=${e => { e.preventDefault(); remove(p.id); }}
                       style="color:var(--dim)">Delete</a>
                  </div>
                </div>`)}
            </div>`}
      </section>

      <section>
        <div class="sec-head">
          <h2>Curated packs</h2>
          <p>Open one to see what is inside, then edit it and save your own.</p>
        </div>
        <${PackGrid} data=${data} packs=${packs} />
      </section>
    </div>`;
}

// ------------------------------------------------------------- tool detail

function Detail({ tool, picked, onToggle, onClose }) {
  if (!tool) return null;
  return html`
    <div class="scrim" onClick=${onClose}>
      <div class="modal" onClick=${e => e.stopPropagation()}>
        <div class="modal-head">
          <h2>${tool.name}</h2>
          <span class="be">${tool.backend}</span>
          <button class="x" onClick=${onClose}>✕</button>
        </div>
        <div class="modal-body">
          ${tool.description && html`<p style="margin-top:0;color:#c9c9cf">${tool.description}</p>`}
          <dl class="kv">
            <dt>Category</dt><dd>${tool.categoryLabel}</dd>
            <dt>Install</dt><dd>${tool.backend}</dd>
            <dt>License</dt><dd>${tool.license}</dd>
            ${tool.homepage && html`<dt>Homepage</dt><dd><a href=${tool.homepage}>${tool.homepage.replace(/^https?:\/\//, "")}</a></dd>`}
            ${tool.alsoOn && tool.alsoOn.length > 0 && html`<dt>Also on</dt><dd>${tool.alsoOn.join(", ")}</dd>`}
          </dl>

          ${tool.flags.map(f => html`
            <div class="note" key=${f}><b style="color:var(--ink)">${FLAG_LABEL[f]}</b> — ${FLAG_HELP[f]}</div>`)}

          ${tool.manualSteps && tool.manualSteps.length > 0 && html`
            <div style="margin-top:18px">
              <h4 style="margin:0 0 8px;font:700 10.5px var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--dim)">After installing</h4>
              ${tool.manualSteps.map((s, i) => html`<div class="note" key=${i}>${s}</div>`)}
            </div>`}

          <h4 style="margin:20px 0 9px;font:700 10.5px var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--dim)">Install command</h4>
          <${Copyable} text=${cmdFor(tool)} />
          ${tool.unverified && html`<div class="note">This package name has not been verified against its registry yet.</div>`}
          ${tool.notes && html`<div class="note">${tool.notes}</div>`}
        </div>
        <div class="modal-head" style="border-top:1px solid var(--line);border-bottom:0">
          <button class=${picked ? "btn ghost sm" : "btn sm"}
                  onClick=${() => onToggle(tool.id)}>
            ${picked ? "Remove from pack" : "Add to pack"}
          </button>
          <button class="btn ghost sm" style="margin-left:auto" onClick=${onClose}>Close</button>
        </div>
      </div>
    </div>`;
}

function Card({ tool, picked, onToggle, onOpen }) {
  return html`
    <div class="card ${picked ? "picked" : ""}" onClick=${() => onOpen(tool)}>
      <button class="add ${picked ? "on" : ""}"
              title=${picked ? "Remove from pack" : "Add to pack"}
              aria-label=${picked ? "Remove from pack" : "Add to pack"}
              onClick=${e => { e.stopPropagation(); onToggle(tool.id); }}>
        ${picked ? "✓" : "+"}
      </button>
      <div class="card-top">
        <h3 title=${tool.name}>${tool.name}</h3>
        <span class="be">${tool.backend}</span>
      </div>
      <p>${tool.description || html`<span style="color:var(--dim)">No description yet.</span>`}</p>
      ${(tool.flags.length > 0 || tool.license === "paid" || tool.unverified) && html`
        <div class="flags">
          ${tool.flags.map(f => html`<span class="flag ${f}" key=${f} title=${FLAG_HELP[f]}>${FLAG_LABEL[f]}</span>`)}
          ${tool.license === "paid" && html`<span class="flag paid">PAID</span>`}
          ${tool.unverified && html`<span class="flag unverified" title="Package name not yet verified">UNVERIFIED</span>`}
        </div>`}
      <div class="cat-note">${tool.categoryLabel}</div>
    </div>`;
}

function CommandsModal({ tools, onClose, onClear }) {
  const groups = useMemo(() => {
    const m = {};
    for (const t of tools) (m[t.backend] ||= []).push(t);
    return BACKEND_ORDER.filter(b => m[b]).map(b => [b, m[b]]);
  }, [tools]);

  const script = useMemo(() => {
    const out = ["#!/usr/bin/env bash", "# Generated by macWTF — review before running", "set -euo pipefail", ""];
    for (const [b, list] of groups) {
      out.push(`# ${b} (${list.length})`);
      if (b === "brew" || b === "cask") {
        out.push(`brew install${b === "cask" ? " --cask" : ""} ${list.map(t => t.package).join(" ")}`);
      } else {
        list.forEach(t => out.push(cmdFor(t)));
      }
      out.push("");
    }
    return out.join("\n");
  }, [groups]);

  const attention = tools.filter(t => t.flags.length > 0 || (t.manualSteps && t.manualSteps.length > 0));

  return html`
    <div class="scrim" onClick=${onClose}>
      <div class="modal" onClick=${e => e.stopPropagation()}>
        <div class="modal-head"><h2>Your selection</h2>
          <span class="be">${tools.length}</span>
          <button class="x" onClick=${onClose}>✕</button></div>
        <div class="modal-body">
          <div class="banner">
            Or skip all this: <b>macwtf install</b> runs the same commands, and handles the
            Gatekeeper and permission steps these will not.
          </div>

          ${attention.length > 0 && html`
            <div class="pack-group">
              <h4>${attention.length} need attention after installing</h4>
              ${attention.slice(0, 8).map(t => html`
                <div class="note" key=${t.id}><b style="color:var(--ink)">${t.name}</b> — ${
                  [...t.flags.map(f => FLAG_HELP[f]), ...(t.manualSteps || [])].join(" ")}</div>`)}
              ${attention.length > 8 && html`<div class="note">… and ${attention.length - 8} more</div>`}
            </div>`}

          <div class="pack-group"><h4>One script</h4><${Copyable} text=${script} /></div>
          ${groups.map(([b, list]) => html`
            <div class="pack-group" key=${b}>
              <h4>${b} · ${list.length}</h4>
              <${Copyable} text=${
                b === "brew" || b === "cask"
                  ? `brew install${b === "cask" ? " --cask" : ""} ${list.map(t => t.package).join(" ")}`
                  : list.map(cmdFor).join("\n")} />
            </div>`)}
        </div>
        <div class="modal-head" style="border-top:1px solid var(--line);border-bottom:0">
          <button class="btn ghost sm" onClick=${onClear}>Clear</button>
          <button class="btn sm" style="margin-left:auto" onClick=${onClose}>Done</button>
        </div>
      </div>
    </div>`;
}

// -------------------------------------------------------------- catalogue

function Tools({ data, packs, initialPack, shared }) {
  const all = data.tools;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(null);
  const [backends, setBackends] = useState([]);
  const [flags, setFlags] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [status, setStatus] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [showCmds, setShowCmds] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  // Opening a pack shows that pack, not the whole catalogue with a few things
  // ticked somewhere in it. Scrolling five hundred entries hunting for the
  // thirty you asked for is not a view of a pack.
  const [scope, setScope] = useState(null);

  useEffect(() => {
    if (shared) {
      setPicked(new Set(shared.ids));
      setScope(new Set(shared.ids));
      return;
    }
    if (!initialPack) { setScope(null); return; }
    const p = packs.featured.find(x => x.id === initialPack)
      || loadSaved().find(x => x.id === initialPack);
    if (!p) return;
    const ids = p.tools && !p.categories && !p.profile
      ? p.tools                                   // a saved pack is a plain list
      : packTools(data, p).map(t => t.id);
    setPicked(new Set(ids));
    setScope(new Set(ids));
  }, [initialPack, shared]);

  const groups = useMemo(() => {
    const general = [], security = [];
    for (const c of data.categories) (c.security ? security : general).push(c);
    return [["", general], ["Security", security]].filter(([, l]) => l.length);
  }, [data]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(t => {
      if (scope && !scope.has(t.id)) return false;
      if (cat && t.category !== cat) return false;
      if (backends.length && !backends.includes(t.backend)) return false;
      if (flags.length && !flags.every(f => t.flags.includes(f))) return false;
      if (licenses.length && !licenses.includes(t.license)) return false;
      if (status === "verified" && t.unverified) return false;
      if (status === "unverified" && !t.unverified) return false;
      if (!needle) return true;
      return `${t.name} ${t.description} ${t.categoryLabel} ${t.backend} ${t.package}`
        .toLowerCase().includes(needle);
    });
  }, [all, q, cat, backends, flags, licenses, status, scope]);

  const toggle = useCallback(id => setPicked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault(); document.getElementById("q")?.focus();
      }
      if (e.key === "Escape") { setDetail(null); setShowCmds(false); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // Only offer backends that actually appear, so the filter never shows a
  // choice that returns nothing.
  const backendOptions = useMemo(() => {
    const counts = {};
    for (const t of all) counts[t.backend] = (counts[t.backend] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([b, n]) => [b, `${b} ${n}`]);
  }, [all]);

  const activeCount = backends.length + flags.length + licenses.length +
    (status ? 1 : 0) + (cat ? 1 : 0);

  const pickedTools = all.filter(t => picked.has(t.id));
  const activePack = initialPack
    ? packs.featured.find(p => p.id === initialPack) || loadSaved().find(p => p.id === initialPack)
    : null;

  return html`
    <div class="wrap">
      ${scope && html`
        <div class="scope-head">
          <span class="stamp" style=${activePack ? `color:${activePack.accent};border-color:${activePack.accent}` : ""}>
            ✦ ${activePack ? activePack.name : (shared ? shared.name : "Selection")}</span>
          ${activePack && html`<p>${activePack.blurb}</p>`}
          <div class="scope-actions">
            <span class="scope-count">${scope.size} tools in this pack</span>
            <button class="btn ghost sm" onClick=${() => setScope(null)}>Browse all ${all.length}</button>
          </div>
        </div>`}

      <div class="tool-layout">
        <aside class="cats ${catsOpen ? "open" : ""}">
          <div class="side-label">Categories</div>
          <button class="cat ${!cat ? "on" : ""}" onClick=${() => setCat(null)}>
            All <span class="n">${all.length}</span></button>
          ${groups.map(([label, list]) => html`
            <div key=${label || "g"}>
              ${label && html`<div class="side-label">${label}</div>`}
              ${list.map(c => html`
                <button class="cat ${cat === c.slug ? "on" : ""}" key=${c.slug}
                        onClick=${() => { setCat(cat === c.slug ? null : c.slug); setCatsOpen(false); }}>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.label}</span>
                  <span class="n">${c.count}</span>
                </button>`)}
            </div>`)}
        </aside>

        <main>
          <div class="toolbar">
            <div class="searchbar">
              <span class="ic">⌕</span>
              <input id="q" value=${q} placeholder=${`Search ${all.length} tools…`}
                     onInput=${e => setQ(e.target.value)} />
            </div>
            <button class="chip cats-toggle" onClick=${() => setCatsOpen(!catsOpen)}>
              ${cat ? data.categories.find(c => c.slug === cat)?.label : "Categories"}
            </button>
            <button class="chip ${filtersOpen || activeCount ? "on" : ""}"
                    onClick=${() => setFiltersOpen(!filtersOpen)}>
              Filters${activeCount ? ` · ${activeCount}` : ""}
            </button>
          </div>
          ${filtersOpen && html`
            <div class="filters">
              <${FilterGroup} label="Installed with" options=${backendOptions}
                              active=${backends} onToggle=${v => setBackends(toggleIn(backends, v))} />
              <${FilterGroup} label="Needs attention"
                              options=${[["quarantine","Unsigned"],["tcc","Permission"],["rosetta","Rosetta"]]}
                              active=${flags} onToggle=${v => setFlags(toggleIn(flags, v))} />
              <${FilterGroup} label="License"
                              options=${[["free","Free"],["freemium","Freemium"],["paid","Paid"]]}
                              active=${licenses} onToggle=${v => setLicenses(toggleIn(licenses, v))} />
              <${FilterGroup} label="Package name"
                              options=${[["verified","Verified"],["unverified","Unverified"]]}
                              active=${status ? [status] : []}
                              onToggle=${v => setStatus(status === v ? null : v)} />
              ${activeCount > 0 && html`
                <button class="btn ghost sm" style="align-self:start;margin-top:6px"
                        onClick=${() => { setBackends([]); setFlags([]); setLicenses([]); setStatus(null); setCat(null); }}>
                  Clear ${activeCount} filter${activeCount === 1 ? "" : "s"}
                </button>`}
            </div>`}

          <div class="resultbar">
            <span><b>${shown.length}</b> ${shown.length === 1 ? "tool" : "tools"}${
              scope ? " in this pack" : ""}${cat ? ` in ${data.categories.find(c => c.slug === cat)?.label}` : ""}</span>
            ${shown.length > 0 && html`
              <button class="linkish" onClick=${() => setPicked(prev => {
                const n = new Set(prev); shown.forEach(t => n.add(t.id)); return n;
              })}>Select all ${shown.length}</button>`}
            ${shown.some(t => picked.has(t.id)) && html`
              <button class="linkish" onClick=${() => setPicked(prev => {
                const n = new Set(prev); shown.forEach(t => n.delete(t.id)); return n;
              })}>Deselect these</button>`}
            ${picked.size > 0 && html`
              <button class="linkish dim" onClick=${() => setPicked(new Set())}>Clear all (${picked.size})</button>`}
          </div>

          ${shown.length === 0
            ? html`<div class="empty">Nothing matches “${q}”.</div>`
            : html`<div class="grid">
                ${shown.map(t => html`
                  <${Card} key=${t.id} tool=${t} picked=${picked.has(t.id)}
                           onToggle=${toggle} onOpen=${setDetail} />`)}
              </div>`}
        </main>
      </div>
    </div>

    ${picked.size > 0 && !showCmds && html`
      <div class="tray">
        <span><b>${picked.size}</b> selected</span>
        <button class="btn ghost sm" onClick=${() => setPicked(new Set())}>Clear</button>
        <button class="btn ghost sm" onClick=${() => {
          const name = prompt("Name this pack:", activePack ? `${activePack.name} (edited)` : "My pack");
          if (!name) return;
          const saved = loadSaved();
          saved.unshift({ id: "u-" + Date.now().toString(36), name,
                          tools: [...picked], custom: true });
          storeSaved(saved);
          location.hash = "#/packs";
        }}>Save as pack</button>
        <button class="btn sm" onClick=${() => setShowCmds(true)}>Get commands</button>
      </div>`}

    <${Detail} tool=${detail} picked=${detail && picked.has(detail.id)}
               onToggle=${toggle} onClose=${() => setDetail(null)} />
    ${showCmds && html`<${CommandsModal} tools=${pickedTools} onClose=${() => setShowCmds(false)}
                                         onClear=${() => { setPicked(new Set()); setShowCmds(false); }} />`}`;
}

// -------------------------------------------------------------------- app

function App({ data, packs }) {
  const route = useRoute();

  let body;
  switch (route.name) {
    case "tools": body = html`<${Tools} data=${data} packs=${packs} />`; break;
    case "packs": body = html`<${Packs} data=${data} packs=${packs} />`; break;
    case "pack":  body = html`<${Tools} data=${data} packs=${packs} initialPack=${route.arg} />`; break;
    case "share": {
      const [name, ids] = route.arg.split("~");
      body = html`<${Tools} data=${data} packs=${packs}
                            shared=${{ name: name || "Shared pack", ids: (ids || "").split(",").filter(Boolean) }} />`;
      break;
    }
    default:      body = html`<${Home} data=${data} packs=${packs} />`;
  }

  return html`
    <div class="blob a"></div><div class="blob b"></div><div class="blob c"></div>
    <div class="grain"></div>
    <div class="page">
      <${Nav} route=${route} />
      ${body}
      <footer class="foot">
        <div class="family">
          <span class="here">macWTF</span>
          <span class="soon">KaliWTF <em>soon</em></span>
          <span class="soon">WindowsWTF <em>soon</em></span>
          <span class="soon">AndroidWTF <em>soon</em></span>
        </div>
        <p style="margin:18px 0 0">
          Generated from the macWTF manifests · package names verified against their registries ·
          <a href="https://github.com/naturalstate/macWTF">source on GitHub</a>
        </p>
      </footer>
    </div>`;
}

const [data, packs] = await Promise.all([
  fetch("./data/tools.json").then(r => r.json()),
  fetch("./data/packs.json").then(r => r.json()),
]);
render(html`<${App} data=${data} packs=${packs} />`, document.getElementById("app"));
