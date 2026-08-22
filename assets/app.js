// macWTF catalogue — MVP.
//
// Zero build step on purpose: Preact + htm are vendored in assets/vendor and
// resolved by an import map, so the site is a static folder that opens locally
// or serves from GitHub Pages with nothing installed. Vendored rather than
// pulled from a CDN so that visiting the page contacts no third party and the
// site does not depend on someone else's uptime. Moving to Vite later means
// keeping these components and dropping htm for JSX.
//
// The catalogue is a placeholder dataset generated from the draft markdown.
// Package names are unverified, and the generated commands are illustrative.

import { h, render } from "preact";
import { useState, useMemo, useEffect, useCallback } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

const FLAG_LABEL = {
  quarantine: "UNSIGNED",
  tcc: "PERMISSION",
  limited: "LIMITED",
  rosetta: "ROSETTA",
};

const FLAG_HELP = {
  quarantine: "Unsigned — Gatekeeper blocks the first launch until quarantine is removed.",
  tcc: "Needs a macOS privacy permission that no installer can grant. You grant it by hand in System Settings.",
  limited: "Does not work properly on macOS. Usually needs a Linux VM.",
  rosetta: "Intel-only build; needs Rosetta 2.",
};

// How each backend installs a package. Illustrative only for the MVP.
const COMMAND = {
  brew: (p) => `brew install ${p}`,
  cask: (p) => `brew install --cask ${p}`,
  mas: (p) => `mas install ${p}`,
  pipx: (p) => `pipx install ${p}`,
  cargo: (p) => `cargo install ${p}`,
  go: (p) => `go install ${p}@latest`,
  npm: (p) => `npm install -g ${p}`,
  gem: (p) => `gem install ${p}`,
  git: (p) => `git clone ${p}`,
  curl: (p) => `# download: ${p}`,
  docker: (p) => `docker pull ${p}`,
  builtin: (p) => `# ${p} ships with macOS`,
  manual: (p) => `# ${p} — manual download`,
  script: (p) => `# ${p} — helper script`,
  defaults: (p) => `defaults write ${p}`,
};

const BACKEND_ORDER = ["brew", "cask", "mas", "pipx", "go", "cargo", "npm", "gem",
  "git", "curl", "docker", "defaults", "builtin", "manual", "script"];

// pkgName turns a display name into something command-shaped. Deliberately
// naive: real package names come from the manifests later.
const pkgName = (t) =>
  t.name.split("/")[0].split("(")[0].trim().toLowerCase().replace(/[^a-z0-9.@+-]+/g, "-").replace(/^-|-$/g, "");

function Flag({ f }) {
  return html`<span class="flag ${f}" title=${FLAG_HELP[f] || ""}>${FLAG_LABEL[f] || f}</span>`;
}

function Card({ tool, picked, onToggle, onOpen }) {
  return html`
    <div class="card ${picked ? "picked" : ""}"
         onClick=${(e) => (e.metaKey || e.shiftKey ? onToggle(tool.id) : onOpen(tool))}>
      ${picked && html`<div class="tick">✓</div>`}
      <div class="card-top">
        <h3 title=${tool.name}>${tool.name}</h3>
        ${!picked && html`<span class="be">${tool.backend}</span>`}
      </div>
      <p>${tool.notes || html`<span style="color:var(--dim)">No description yet.</span>`}</p>
      ${(tool.flags.length > 0 || tool.license === "paid") && html`
        <div class="flags">
          ${tool.flags.map((f) => html`<${Flag} f=${f} key=${f} />`)}
          ${tool.license === "paid" && html`<span class="flag paid">PAID</span>`}
        </div>`}
      <div class="cat-note">${tool.subcategory || tool.category}</div>
    </div>`;
}

function Detail({ tool, picked, onToggle, onClose }) {
  if (!tool) return null;
  const cmd = (COMMAND[tool.backend] || COMMAND.manual)(pkgName(tool));
  return html`
    <div class="scrim" onClick=${onClose}>
      <div class="modal" onClick=${(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>${tool.name}</h2>
          <span class="be">${tool.backend}</span>
          <button class="x" onClick=${onClose}>✕</button>
        </div>
        <div class="modal-body">
          ${tool.notes && html`<p style="margin-top:0;color:var(--muted)">${tool.notes}</p>`}
          <dl class="kv">
            <dt>Category</dt><dd>${tool.category}</dd>
            ${tool.subcategory && html`<dt>Section</dt><dd>${tool.subcategory}</dd>`}
            <dt>Backend</dt><dd>${tool.backend}</dd>
            <dt>License</dt><dd>${tool.license}</dd>
          </dl>
          ${tool.flags.length > 0 && html`
            <div style="margin-top:16px">
              ${tool.flags.map((f) => html`
                <div class="note" key=${f}>
                  <b style="color:var(--text)">${FLAG_LABEL[f]}</b> — ${FLAG_HELP[f]}
                </div>`)}
            </div>`}
          <h4 style="margin:20px 0 8px;font-size:11px;letter-spacing:.09em;color:var(--dim);text-transform:uppercase">
            Install command
          </h4>
          <${Copyable} text=${cmd} />
          <div class="note">Placeholder command. Package names are not verified yet.</div>
        </div>
        <div class="modal-head" style="border-top:1px solid var(--line-solid);border-bottom:0">
          <button class="ghost-btn ${picked ? "" : "primary"}" onClick=${() => onToggle(tool.id)}>
            ${picked ? "Remove from pack" : "Add to pack"}
          </button>
        </div>
      </div>
    </div>`;
}

function Copyable({ text }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    });
  };
  return html`
    <div>
      <pre class="cmd">${text}</pre>
      <button class="copy" onClick=${copy}>${done ? "copied" : "copy"}</button>
    </div>`;
}

function PackModal({ tools, onClose, onClear }) {
  const groups = useMemo(() => {
    const m = {};
    for (const t of tools) (m[t.backend] ||= []).push(t);
    return BACKEND_ORDER.filter((b) => m[b]).map((b) => [b, m[b]]);
  }, [tools]);

  const script = useMemo(() => {
    const lines = ["#!/usr/bin/env bash", "# Generated by macWTF — review before running", "set -euo pipefail", ""];
    for (const [b, list] of groups) {
      lines.push(`# ${b} (${list.length})`);
      if (b === "brew" || b === "cask") {
        const flag = b === "cask" ? " --cask" : "";
        lines.push(`brew install${flag} ${list.map(pkgName).join(" ")}`);
      } else {
        for (const t of list) lines.push((COMMAND[b] || COMMAND.manual)(pkgName(t)));
      }
      lines.push("");
    }
    return lines.join("\n");
  }, [groups]);

  const warn = tools.filter((t) => t.flags.length > 0);

  return html`
    <div class="scrim" onClick=${onClose}>
      <div class="modal" onClick=${(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>Your pack</h2>
          <span class="count-pill">${tools.length}</span>
          <button class="x" onClick=${onClose}>✕</button>
        </div>
        <div class="modal-body">
          <div class="banner">
            MVP preview — package names are unverified placeholders. Do not run these yet.
          </div>

          ${warn.length > 0 && html`
            <div class="pack-group">
              <h4>${warn.length} tool(s) need attention after install</h4>
              ${warn.map((t) => html`
                <div class="note" key=${t.id}>
                  <b style="color:var(--text)">${t.name}</b> — ${t.flags.map((f) => FLAG_HELP[f]).join(" ")}
                </div>`)}
            </div>`}

          <div class="pack-group">
            <h4>One script</h4>
            <${Copyable} text=${script} />
          </div>

          ${groups.map(([b, list]) => html`
            <div class="pack-group" key=${b}>
              <h4>${b} · ${list.length}</h4>
              <${Copyable} text=${
                b === "brew" || b === "cask"
                  ? `brew install${b === "cask" ? " --cask" : ""} ${list.map(pkgName).join(" ")}`
                  : list.map((t) => (COMMAND[b] || COMMAND.manual)(pkgName(t))).join("\n")
              } />
            </div>`)}
        </div>
        <div class="modal-head" style="border-top:1px solid var(--line-solid);border-bottom:0">
          <button class="ghost-btn" onClick=${onClear}>Clear pack</button>
          <button class="ghost-btn primary" style="margin-left:auto" onClick=${onClose}>Done</button>
        </div>
      </div>
    </div>`;
}

function App({ data }) {
  const all = data.tools;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(null);
  const [flags, setFlags] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [showPack, setShowPack] = useState(false);

  const cats = useMemo(() => {
    const m = new Map();
    for (const t of all) m.set(t.category, (m.get(t.category) || 0) + 1);
    return [...m.entries()];
  }, [all]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((t) => {
      if (cat && t.category !== cat) return false;
      if (flags.length && !flags.every((f) => t.flags.includes(f) || t.backend === f)) return false;
      if (!needle) return true;
      return (t.name + " " + t.notes + " " + t.category + " " + (t.subcategory || "") + " " + t.backend)
        .toLowerCase().includes(needle);
    });
  }, [all, q, cat, flags]);

  const toggle = useCallback((id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleFlag = (f) => setFlags((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));

  // "/" focuses search, Escape closes whatever is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("q")?.focus();
      }
      if (e.key === "Escape") { setDetail(null); setShowPack(false); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const pickedTools = all.filter((t) => picked.has(t.id));

  return html`
    <header class="top">
      <div class="top-inner">
        <div class="brand">mac<span>WTF</span></div>
        <div class="tagline">the tooling macOS leaves out</div>
        <div class="search">
          <span class="icon">⌕</span>
          <input id="q" value=${q} placeholder="Search ${all.length} tools…"
                 onInput=${(e) => setQ(e.target.value)} />
          ${!q && html`<span class="hint"><kbd>/</kbd></span>`}
        </div>
        <button class="ghost-btn ${picked.size ? "primary" : ""}"
                disabled=${!picked.size} onClick=${() => setShowPack(true)}>
          Pack${picked.size > 0 && html`<span class="count-pill">${picked.size}</span>`}
        </button>
      </div>
    </header>

    <div class="layout">
      <aside class="cats">
        <div class="side-label">Categories</div>
        <button class="cat ${!cat ? "on" : ""}" onClick=${() => setCat(null)}>
          All <span class="n">${all.length}</span>
        </button>
        ${cats.map(([c, n]) => html`
          <button class="cat ${cat === c ? "on" : ""}" key=${c} onClick=${() => setCat(cat === c ? null : c)}>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${c.replace(/^Security: /, "")}
            </span>
            <span class="n">${n}</span>
          </button>`)}
      </aside>

      <main>
        <div class="toolbar">
          <div class="result-count"><b>${shown.length}</b> tools${cat ? ` in ${cat}` : ""}</div>
          <div class="chipbar">
            ${["brew", "cask", "pipx", "go"].map((b) => html`
              <button class="fchip ${flags.includes(b) ? "on" : ""}" key=${b}
                      onClick=${() => toggleFlag(b)}>${b}</button>`)}
            ${["quarantine", "tcc", "limited"].map((f) => html`
              <button class="fchip ${flags.includes(f) ? "on" : ""}" key=${f}
                      onClick=${() => toggleFlag(f)}>${FLAG_LABEL[f]}</button>`)}
          </div>
        </div>

        ${shown.length === 0
          ? html`<div class="empty">Nothing matches “${q}”.</div>`
          : html`<div class="grid">
              ${shown.map((t) => html`
                <${Card} key=${t.id} tool=${t} picked=${picked.has(t.id)}
                         onToggle=${toggle} onOpen=${setDetail} />`)}
            </div>`}
      </main>
    </div>

    ${picked.size > 0 && !showPack && html`
      <div class="tray">
        <span><b>${picked.size}</b> selected</span>
        <button class="ghost-btn" onClick=${() => setPicked(new Set())}>Clear</button>
        <button class="ghost-btn primary" onClick=${() => setShowPack(true)}>Get commands</button>
      </div>`}

    <${Detail} tool=${detail} picked=${detail && picked.has(detail.id)}
               onToggle=${toggle} onClose=${() => setDetail(null)} />

    ${showPack && html`
      <${PackModal} tools=${pickedTools} onClose=${() => setShowPack(false)}
                    onClear=${() => { setPicked(new Set()); setShowPack(false); }} />`}

    <footer class="foot">
      MVP preview · catalogue is a draft and package names are unverified ·
      <a href="https://github.com/naturalstate/macWTF">macWTF on GitHub</a>
    </footer>`;
}

const data = await fetch("./data/tools.json").then((r) => r.json());
render(html`<${App} data=${data} />`, document.getElementById("app"));
