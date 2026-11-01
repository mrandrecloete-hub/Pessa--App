#!/usr/bin/env python3
"""Makes a BlazeCam update patch: the bytes that turn one release APK into the next.

Usage: make_patch.py OLD.apk NEW.apk OUT.patch

The app downloads the patch (usually a few MB instead of the whole APK), rebuilds the new APK from the
APK that is installed, and checks its SHA-256 against SHA256SUMS.txt before installing. If anything does
not match, the app downloads the full APK instead.

Format "BLZDIF01" (bsdiff 4 with zlib instead of bzip2, because Android has zlib built in):
  8 bytes  magic  b"BLZDIF01"
  8 bytes  new file size              (little endian, unsigned)
  8 bytes  compressed control length  (little endian, unsigned)
  8 bytes  compressed diff length     (little endian, unsigned)
  then zlib(control) zlib(diff) zlib(extra)
Control is a list of (x, y, z) triples, each 8 bytes in bsdiff's sign and magnitude form: add x diff bytes
to the old file, copy y extra bytes, then move the old position by z.
Needs: pip install bsdiff4
"""
import bz2, struct, sys, zlib
import bsdiff4


def to_blz(bsdiff40: bytes) -> bytes:
    if bsdiff40[:8] != b"BSDIFF40":
        raise ValueError("not a BSDIFF40 patch")
    lc, ld, new_size = struct.unpack("<qqq", bsdiff40[8:32])
    ctrl = bz2.decompress(bsdiff40[32:32 + lc])
    diff = bz2.decompress(bsdiff40[32 + lc:32 + lc + ld])
    extra = bz2.decompress(bsdiff40[32 + lc + ld:])
    zc, zd, ze = (zlib.compress(b, 9) for b in (ctrl, diff, extra))
    return b"BLZDIF01" + struct.pack("<QQQ", new_size, len(zc), len(zd)) + zc + zd + ze


def main():
    old_path, new_path, out_path = sys.argv[1:4]
    old = open(old_path, "rb").read()
    new = open(new_path, "rb").read()
    patch = to_blz(bsdiff4.diff(old, new))
    with open(out_path, "wb") as f:
        f.write(patch)
    print(f"{out_path}: {len(patch)} bytes ({100.0 * len(patch) / len(new):.1f}% of the full APK)")


if __name__ == "__main__":
    main()
