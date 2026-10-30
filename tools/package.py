#!/usr/bin/env python3
"""Deterministic ZIP/XPI packaging. Python standard library only."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
OUT.mkdir(exist_ok=True)
manifest = json.loads((ROOT / "extension/manifest.json").read_text())
version = manifest["version"]

def write_zip(target, entries):
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, name in sorted(entries, key=lambda pair: pair[1]):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())

runtime = [(p, p.relative_to(ROOT / "extension").as_posix()) for p in (ROOT / "extension").rglob("*") if p.is_file()]
release = OUT / f"tidy-research-{version}-amo.zip"
write_zip(release, runtime)
xpi = OUT / f"tidy-research-{version}-unsigned.xpi"
xpi.write_bytes(release.read_bytes())
source = [(p, "tidy-research/" + p.relative_to(ROOT).as_posix()) for p in ROOT.rglob("*") if p.is_file() and not any(part in {"dist", "node_modules", ".git", "test-results"} for part in p.relative_to(ROOT).parts)]
bundle = OUT / f"Tidy_Research_{version}_Workshop.zip"
write_zip(bundle, source + [(release, "tidy-research/dist/" + release.name), (xpi, "tidy-research/dist/" + xpi.name)])
for path in (release, xpi, bundle):
    print(f"{path.name}: {path.stat().st_size} bytes; sha256 {hashlib.sha256(path.read_bytes()).hexdigest()}")
