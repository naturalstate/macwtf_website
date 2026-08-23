#!/usr/bin/env python3
"""Generate the website's catalogue from macWTF's manifests.

Reads the same TOML the CLI embeds, so the two cannot disagree about what
exists. Replaces the earlier importer that parsed the draft markdown and
produced guesses.
"""
import json, sys, tomllib, glob, os, re

SRC = sys.argv[1] if len(sys.argv) > 1 else "../macWTF"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/tools.json"

# Display names for the manifest's category slugs.
CATEGORY_LABEL = {
    "bootstrap": "Bootstrap", "terminal": "Terminal", "shell": "Shell & Prompt",
    "cli": "CLI Quality of Life", "browsers": "Browsers",
    "vpn": "VPN & Privacy", "remote": "Remote Access", "dev": "Development",
    "sec-recon": "Recon & OSINT", "sec-web": "Web Application",
    "sec-passwords": "Passwords & Cracking", "sec-network": "Network & Internal",
    "sec-cloud": "Cloud & Container", "sec-mobile": "Mobile",
    "sec-reversing": "Reverse Engineering", "sec-macos": "macOS Defense",
    "sdr": "SDR, RF & Hardware", "reporting": "Reporting",
    "utilities": "Utilities", "system-tweaks": "System Tweaks",
    "wordlists": "Wordlists", "payloads": "Payloads",
}
SECURITY = {k for k in CATEGORY_LABEL if k.startswith("sec-")} | {"payloads", "wordlists"}

def load(pattern):
    for path in sorted(glob.glob(pattern)):
        with open(path, "rb") as f:
            yield path, tomllib.load(f)

tools, skipped = [], 0
for path, doc in load(os.path.join(SRC, "manifest", "*.toml")):
    for e in doc.get("tool", []):
        mac = e.get("macos")
        if not mac:
            # No macOS block: belongs to a sibling platform, not this site.
            skipped += 1
            continue
        cat = e.get("category", "other")
        flags = []
        if mac.get("quarantine_strip"): flags.append("quarantine")
        if mac.get("tcc_permissions"):  flags.append("tcc")
        if mac.get("requires_rosetta"): flags.append("rosetta")

        notes = " ".join(x for x in (e.get("notes"), mac.get("notes")) if x)
        tools.append({
            "id": e["id"],
            "name": e.get("name", e["id"]),
            "description": e.get("description", ""),
            "category": cat,
            "categoryLabel": CATEGORY_LABEL.get(cat, cat),
            "isSecurity": cat in SECURITY,
            "backend": mac.get("backend", "manual"),
            "package": mac.get("package", ""),
            "license": e.get("license", "free"),
            "homepage": e.get("homepage", ""),
            "notes": notes,
            "flags": flags,
            "manualSteps": mac.get("manual_steps", []),
            "requires": e.get("requires", []),
            "unverified": bool(mac.get("unverified")),
            "alsoOn": [p for p in ("kali", "windows", "android") if p in e],
        })

by_id = {t["id"]: t for t in tools}

def expand(p, seen=None):
    """Resolve a profile to tool ids the way the CLI's resolver does."""
    seen = seen or set()
    if p["id"] in seen:
        return []
    seen.add(p["id"])
    out = []
    for inc in p.get("includes", []):
        if inc in profiles_by_id:
            out += expand(profiles_by_id[inc], seen)
    for c in p.get("categories", []):
        out += [t["id"] for t in tools if t["category"] == c]
    out += p.get("tools", [])
    excl = set(p.get("excludes", []))
    seen_ids, res = set(), []
    for i in out:
        if i in excl or i in seen_ids or i not in by_id:
            continue
        seen_ids.add(i)
        res.append(i)
    return res

raw_profiles = []
for path, doc in load(os.path.join(SRC, "profiles", "*.toml")):
    if "profile" in doc:
        raw_profiles.append(doc["profile"])
profiles_by_id = {p["id"]: p for p in raw_profiles}

packs = []
for p in raw_profiles:
    ids = expand(p)
    packs.append({
        "id": p["id"], "name": p.get("name", p["id"]),
        "description": p.get("description", ""),
        "tools": ids, "count": len(ids),
    })
packs.sort(key=lambda p: -p["count"])

json.dump({
    "generated": "from macWTF manifests",
    "tools": tools,
    "packs": packs,
    "categories": [
        {"slug": c, "label": CATEGORY_LABEL.get(c, c),
         "security": c in SECURITY,
         "count": sum(1 for t in tools if t["category"] == c)}
        for c in dict.fromkeys(t["category"] for t in tools)
    ],
}, open(OUT, "w"), indent=1)

verified = sum(1 for t in tools if not t["unverified"])
print(f"{len(tools)} tools ({verified} verified), {len(packs)} packs -> {OUT}")
print(f"  {skipped} entries skipped (no macOS block)")
for p in packs:
    print(f"  {p['count']:4d}  {p['name']}")
