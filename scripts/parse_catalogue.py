#!/usr/bin/env python3
"""Convert the draft catalogue markdown into JSON for the website.

The draft mixes two shapes: markdown tables with Tool/Backend/Notes columns,
and prose lines of backticked names separated by middots. Both carry real
entries, so both are parsed. Package names are taken as written and are not
verified — this is a placeholder dataset for the MVP.
"""
import json, re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "../macWTF/macwtf-catalogue.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/tools.json"

BACKENDS = {"brew","cask","mas","pipx","cargo","go","npm","gem","curl","git",
            "defaults","builtin","manual","docker","script"}

FLAGS = {
    "[Q]": ("quarantine", "Unsigned — needs a Gatekeeper quarantine strip"),
    "[T]": ("tcc",        "Needs a macOS privacy permission granted by hand"),
    "[R]": ("rosetta",    "Needs Rosetta 2"),
    "[!]": ("limited",    "Linux-only or crippled on macOS"),
}

def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "x"

def clean(s):
    return re.sub(r"\s+", " ", s.replace("**","").replace("`","")).strip()

def pull_flags(text):
    found, rest = [], text
    for marker,(key,_) in FLAGS.items():
        if marker in rest:
            found.append(key)
            rest = rest.replace(marker, "")
    return found, clean(rest)

def guess_backend(raw, fallback=""):
    raw = clean(raw).lower()
    for b in BACKENDS:
        if re.search(rf"\b{re.escape(b)}\b", raw):
            return b
    return fallback

tools, seen = [], {}
category = subcategory = None
cat_index = 0

def add(name, backend, notes, license_hint=""):
    name = clean(name)
    if not name or name.lower() in ("tool","---"):
        return
    flags, notes = pull_flags(notes)
    nf, name = pull_flags(name)
    flags = sorted(set(flags + nf))

    lic = "free"
    low = (notes + " " + license_hint).lower()
    if "paid" in low: lic = "paid"
    elif "license required" in low: lic = "paid"
    elif "account required" in low: lic = "freemium"

    base = slug(name.split("/")[0].split("(")[0])
    tid = base
    n = 2
    while tid in seen:
        tid = f"{base}-{n}"; n += 1
    seen[tid] = True

    tools.append({
        "id": tid,
        "name": name,
        "backend": backend or "manual",
        "category": category,
        "categorySlug": slug(category or "other"),
        "subcategory": subcategory,
        "notes": notes,
        "flags": flags,
        "license": lic,
    })

for line in open(SRC, encoding="utf-8"):
    raw = line.rstrip("\n")
    s = raw.strip()

    m = re.match(r"^##\s+(.*)$", s)
    if m and not s.startswith("###"):
        title = clean(m.group(1))
        title = re.sub(r"^\d+\.\s*", "", title)
        if title.lower().startswith(("profile definitions","open design")):
            category = None
            continue
        category, subcategory = title, None
        cat_index += 1
        continue

    m = re.match(r"^###\s+(.*)$", s)
    if m:
        subcategory = clean(m.group(1))
        continue

    if category is None:
        continue

    # Markdown table row
    if s.startswith("|") and s.count("|") >= 3:
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) < 2 or set(cells[0]) <= set("-: "):
            continue
        if cells[0].lower() in ("tool","profile"):
            continue
        name, backend = cells[0], guess_backend(cells[1])
        notes = cells[2] if len(cells) > 2 else ""
        add(name, backend, notes, cells[1])
        continue

    # Prose list: `a` · `b` (note) · `c`
    if "·" in s and not s.startswith(("#","|",">")):
        default_backend = guess_backend(subcategory or "", "")
        for part in s.split("·"):
            part = part.strip()
            if not part:
                continue
            inner = re.search(r"\(([^)]*)\)", part)
            note = clean(inner.group(1)) if inner else ""
            nm = clean(re.sub(r"\([^)]*\)", "", part))
            if not nm or len(nm) > 60:
                continue
            b = guess_backend(note, default_backend) or "brew"
            add(nm, b, note)

json.dump({
    "generated": "draft — package names not yet verified",
    "tools": tools,
}, open(OUT,"w"), indent=1)

cats = {}
for t in tools:
    cats.setdefault(t["category"], 0)
    cats[t["category"]] += 1
print(f"{len(tools)} tools across {len(cats)} categories -> {OUT}\n")
for c,n in cats.items():
    print(f"  {n:4d}  {c}")
