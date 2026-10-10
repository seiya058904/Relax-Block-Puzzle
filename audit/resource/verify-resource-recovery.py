"""Independent audit-only audio preservation and handoff recovery checks."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import zipfile
import argparse

BASE = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('baseline_zip', type=Path, help='Original uploaded baseline ZIP, not the audited ZIP')
parser.add_argument('--output', type=Path, default=BASE / 'audit/rerun/resource')
args = parser.parse_args()
ROOT = BASE
ARCHIVE = args.baseline_zip
OUT = args.output
OUT.mkdir(parents=True, exist_ok=True)
sha = lambda value: hashlib.sha256(value).hexdigest()
mapping = json.loads((ROOT / "config/resource-map.json").read_text())
manifest = json.loads((ROOT / "config/platform-manifest.json").read_text())
roots = {
    "wechat": ROOT / "we xin xiao cheng xu",
    "web": ROOT / "we xin xiao cheng xu-android-apk/docs",
    "android": ROOT / "we xin xiao cheng xu-android-apk/app/src/main/assets",
}

report = {"audio": {}, "inputPreserved": {}, "recovery": {}}
with zipfile.ZipFile(ARCHIVE) as archive:
    names = archive.namelist()
    for platform, root in roots.items():
        tier = "wechat" if platform == "wechat" else "full"
        expected = {item[tier] for item in mapping.values()}
        actual = {str(path.relative_to(root)) for path in (root / "audio").rglob("*") if path.is_file()}
        assert actual == expected, (platform, sorted(actual ^ expected))
        files = {name: {"bytes": (root / name).stat().st_size, "sha256": sha((root / name).read_bytes())} for name in sorted(actual)}
        report["audio"][platform] = {"fileCount": len(files), "bytes": sum(file["bytes"] for file in files.values()), "files": files}
        if platform != "android":
            for name, details in files.items():
                suffix = f"{root.relative_to(ROOT)}/{name}"
                matches = [item for item in names if item.endswith(suffix)]
                assert len(matches) == 1, suffix
                assert sha(archive.read(matches[0])) == details["sha256"], suffix
            report["inputPreserved"][platform] = True

assert report["audio"]["web"]["files"] == report["audio"]["android"]["files"]
assert report["audio"]["wechat"]["bytes"] <= manifest["resources"]["wechat"]["audioMaxBytes"]
assert report["audio"]["web"]["bytes"] >= manifest["resources"]["full"]["audioMinBytes"]

with tempfile.TemporaryDirectory(prefix="recovery-", dir=OUT) as directory:
    scratch = Path(directory)
    source = roots["web"] / "audio"
    dest = scratch / "assets/audio"
    dest.parent.mkdir()
    # Reproduce the current handoff literally, in scratch only.
    for _ in range(2):
        subprocess.run(["cp", "-r", str(source), str(dest)], check=True)
    nested = dest / "audio"
    report["recovery"]["oldCommandAfterTwoRuns"] = {
        "fileCount": len([path for path in dest.rglob("*") if path.is_file()]),
        "nestedAudioDirectory": nested.is_dir(),
        "bytes": sum(path.stat().st_size for path in dest.rglob("*") if path.is_file()),
    }
    assert nested.is_dir()

    clean = scratch / "repaired/audio"
    for _ in range(2):
        clean.mkdir(parents=True, exist_ok=True)
        subprocess.run(["cp", "-a", f"{source}/.", f"{clean}/"], check=True)
    expected = report["audio"]["web"]["files"]
    actual = {f"audio/{path.relative_to(clean)}": {"bytes": path.stat().st_size, "sha256": sha(path.read_bytes())} for path in clean.rglob("*") if path.is_file()}
    assert actual == expected
    assert not (clean / "audio").exists()
    report["recovery"]["correctedCommandAfterTwoRuns"] = {
        "fileCount": len(actual), "sha256MatchesEveryFile": True,
        "nestedAudioDirectory": False, "bytes": sum(item["bytes"] for item in actual.values())
    }

(OUT / "resource-recovery-results.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"audio": {name: {k: v for k, v in item.items() if k != "files"} for name, item in report["audio"].items()}, "inputPreserved": report["inputPreserved"], "recovery": report["recovery"]}, indent=2))
