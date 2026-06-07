#!/usr/bin/env python3
"""Vendor the CUDA 12 runtime libs that node-llama-cpp's linux-x64-cuda prebuilt
binary needs, into .cuda-libs/ (gitignored). No pip, no CUDA toolkit, no build —
just downloads the manylinux wheels from PyPI and extracts the .so files.

Pinned versions are forward/backward compatible within CUDA 12.x. Re-run is safe
(idempotent): it skips download if the libs already exist."""

import io
import json
import os
import sys
import urllib.request
import zipfile

DEST = os.path.join(os.getcwd(), ".cuda-libs")
PINS = {
    "nvidia-cuda-runtime-cu12": "12.9.79",
    "nvidia-cublas-cu12": "12.9.2.10",
}
REQUIRED = ["libcudart.so.12", "libcublas.so.12", "libcublasLt.so.12"]


def wheel_url(pkg: str, version: str) -> str:
    meta = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/{pkg}/{version}/json"))
    for f in meta["urls"]:
        fn = f["filename"]
        if fn.endswith(".whl") and "x86_64" in fn and "manylinux" in fn:
            return f["url"]
    raise SystemExit(f"no manylinux x86_64 wheel for {pkg}=={version}")


def main() -> None:
    os.makedirs(DEST, exist_ok=True)
    if all(os.path.exists(os.path.join(DEST, lib)) for lib in REQUIRED):
        print(f"CUDA libs already present in {DEST} — skipping.")
        return
    for pkg, version in PINS.items():
        url = wheel_url(pkg, version)
        print(f"downloading {pkg}=={version} ...")
        raw = urllib.request.urlopen(url).read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for name in z.namelist():
                if name.endswith(".so") or ".so." in name:
                    base = os.path.basename(name)
                    with open(os.path.join(DEST, base), "wb") as out:
                        out.write(z.read(name))
                    print(f"  extracted {base}")
    missing = [lib for lib in REQUIRED if not os.path.exists(os.path.join(DEST, lib))]
    if missing:
        raise SystemExit(f"missing after extract: {missing}")
    print(f"\nCUDA runtime libs ready in {DEST}")


if __name__ == "__main__":
    sys.exit(main())
