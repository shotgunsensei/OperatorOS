"""Create an original 15-second synthetic technology pulse for the campaign.

The soundtrack is generated locally from mathematical waveforms. It contains
no samples, third-party music, cloned voices, or external audio assets.
"""

from __future__ import annotations

import argparse
import math
import wave
from pathlib import Path

import numpy as np


def render(output: Path, duration: float = 15.2, sample_rate: int = 48_000) -> None:
    frame_count = int(duration * sample_rate)
    t = np.arange(frame_count, dtype=np.float64) / sample_rate

    # A restrained minor-pad foundation with slow phase movement.
    left = (
        0.18 * np.sin(2.0 * np.pi * 55.0 * t + 0.16 * np.sin(2.0 * np.pi * 0.13 * t))
        + 0.08 * np.sin(2.0 * np.pi * 82.41 * t + 0.4)
        + 0.055 * np.sin(2.0 * np.pi * 110.0 * t + 1.2)
    )
    right = (
        0.18 * np.sin(2.0 * np.pi * 55.0 * t + 0.16 * np.sin(2.0 * np.pi * 0.13 * t + 0.7))
        + 0.08 * np.sin(2.0 * np.pi * 82.41 * t + 0.8)
        + 0.055 * np.sin(2.0 * np.pi * 110.0 * t + 1.7)
    )

    # Scene-change pulses. The sweep and decay create a short, clean impact.
    transition_times = (0.0, 2.15, 4.20, 6.30, 8.40, 10.65, 12.90)
    for index, start in enumerate(transition_times):
        local = t - start
        active = (local >= 0.0) & (local < 0.72)
        tau = np.maximum(local, 0.0)
        envelope = np.exp(-tau * 7.2) * active
        phase = 2.0 * np.pi * (72.0 * tau + 72.0 * tau * tau)
        pulse = 0.38 * envelope * np.sin(phase)
        shimmer = 0.075 * np.exp(-tau * 4.0) * active * np.sin(
            2.0 * np.pi * (620.0 + index * 42.0) * tau
        )
        left += pulse + shimmer
        right += 0.96 * pulse + np.roll(shimmer, 32)

    # A subtle four-on-the-floor heartbeat keeps the video moving without
    # competing with captions or an optional future voiceover.
    for beat in np.arange(0.4, duration, 0.75):
        local = t - beat
        active = (local >= 0.0) & (local < 0.22)
        tau = np.maximum(local, 0.0)
        envelope = np.exp(-tau * 24.0) * active
        kick = 0.24 * envelope * np.sin(2.0 * np.pi * (78.0 - 32.0 * tau) * tau)
        left += kick
        right += kick

    # Fade in/out and leave conservative headroom for platform normalization.
    fade = np.ones(frame_count, dtype=np.float64)
    fade_in = min(frame_count, int(0.55 * sample_rate))
    fade_out = min(frame_count, int(0.80 * sample_rate))
    fade[:fade_in] = np.linspace(0.0, 1.0, fade_in, endpoint=False)
    fade[-fade_out:] = np.linspace(1.0, 0.0, fade_out, endpoint=True)
    left *= fade
    right *= fade
    stereo = np.column_stack((left, right))
    peak = float(np.max(np.abs(stereo))) or 1.0
    stereo = np.clip(stereo * (0.70 / peak), -1.0, 1.0)
    pcm = (stereo * 32767.0).astype('<i2')

    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('--duration', type=float, default=15.2)
    args = parser.parse_args()
    render(args.output.resolve(), args.duration)
    print(args.output.resolve())


if __name__ == '__main__':
    main()
