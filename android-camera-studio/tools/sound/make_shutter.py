"""Synthesises BlazeCam's original soft shutter sound (no recordings are used).

Two soft mechanical transients ("tk" then a quieter "chk" 75 ms later), each made of band-limited noise
with a very fast decay plus a short low "body" tone, a faint room tail, and a gentle overall level
(peak about -14 dBFS). Writes app/src/main/res/raw/shutter_click.wav (44.1 kHz, 16 bit, mono).
Run: python tools/sound/make_shutter.py  (needs numpy)
"""
import wave, numpy as np, os

SR = 44100
rng = np.random.default_rng(20261101)  # fixed seed: the same sound every time

def bandpass_noise(n, lo, hi):
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    # smooth band edges to avoid ringing
    w = np.clip((f - lo) / (lo * 0.5), 0, 1) * np.clip((hi - f) / (hi * 0.25), 0, 1)
    return np.fft.irfft(spec * w, n)

def transient(length_s, gain, noise_lo, noise_hi, noise_decay_ms, body_hz, body_decay_ms):
    n = int(length_s * SR); t = np.arange(n) / SR
    noise = bandpass_noise(n, noise_lo, noise_hi)
    noise = noise / np.max(np.abs(noise)) * np.exp(-t / (noise_decay_ms / 1000))
    attack = np.clip(t / 0.0008, 0, 1)  # 0.8 ms soft attack, so no sharp "tick"
    body = np.sin(2 * np.pi * body_hz * t) * np.exp(-t / (body_decay_ms / 1000))
    return gain * attack * (0.8 * noise + 0.3 * body)

total = int(0.20 * SR)
out = np.zeros(total)
first = transient(0.09, 1.0, 1800, 7000, 5.0, 220, 7)
second = transient(0.09, 0.7, 1300, 5500, 6.5, 170, 9)
out[: len(first)] += first
off = int(0.075 * SR)
out[off: off + len(second)] += second
# tiny room tail: a few soft, low-passed echoes
dry = out.copy()
soft = np.convolve(dry, np.ones(24) / 24, mode="same")
for d, g in [(0.011, 0.12), (0.019, 0.07)]:
    k = int(d * SR)
    out[k:] += g * soft[:-k]
# gentle fade out and level
t = np.arange(total) / SR
out *= np.clip((0.20 - t) / 0.04, 0, 1)
peak_db = -14.0
out = out / np.max(np.abs(out)) * 10 ** (peak_db / 20)

path = os.path.join(os.path.dirname(__file__), "..", "..", "app", "src", "main", "res", "raw", "shutter_click.wav")
with wave.open(path, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
rms_db = 20 * np.log10(np.sqrt(np.mean(out[: int(0.12 * SR)] ** 2)))
print(f"wrote {os.path.normpath(path)}: {total / SR * 1000:.0f} ms, peak {peak_db:.1f} dBFS, RMS of first 120 ms {rms_db:.1f} dBFS")
