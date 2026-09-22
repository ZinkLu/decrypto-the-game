#!/usr/bin/env python3
"""Edit the CC0 stereo master into four local cues. Requires ffmpeg, no Python packages.

Usage: python3 assets/audio/build_music.py /path/to/fusion.ogg
This is an excerpt/mix workflow, not stem separation or original composition.
"""
import array
import hashlib
import json
import math
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'web/public/audio/music'
RATE = 32000
# Waveform recurrence measured between 8–28s and the next iteration (r=.977).
PERIOD = 82.12925
EDITS = {
    'lobby': (8, PERIOD, True, -23, 'anull'),
    'game': (8 + PERIOD, PERIOD, True, -27,
             'treble=f=3800:g=-2,acompressor=threshold=0.16:ratio=1.4:attack=35:release=300:makeup=1'),
    'win': (76.2, 6, False, -22, 'anull'),
    'loss': (72.5, 4.5, False, -25, 'treble=f=3800:g=-2'),
}


def ffmpeg(*args, capture=False):
    return subprocess.run(['ffmpeg', '-hide_banner', '-y', *map(str, args)],
                          check=True, capture_output=True).stdout if capture else subprocess.run(
        ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True)


def measure(path):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af',
                             'loudnorm=I=-23:TP=-2:LRA=11:print_format=json',
                             '-f', 'null', '-'], check=True, capture_output=True, text=True)
    return json.loads(re.findall(r'\{[^{}]+\}', result.stderr)[-1])


def main():
    source = pathlib.Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'source': 'https://opengameart.org/content/basically-not-fusion-jazz',
              'author': 'Spring Spring / Julie Damsgaard', 'license': 'CC0-1.0',
              'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'tracks': {}}
    with tempfile.TemporaryDirectory(prefix='decrypto-music-') as scratch:
        scratch = pathlib.Path(scratch)
        for name, (start, duration, loop, target, filters) in EDITS.items():
            frames = round(duration * RATE)
            blend = round(.16 * RATE)
            raw = ffmpeg('-ss', start, '-i', source, '-t', duration + (.16 if loop else 0),
                         '-af', filters, '-ar', RATE, '-ac', 2, '-f', 'f32le', '-', capture=True)
            samples = array.array('f', raw)
            if sys.byteorder != 'little':
                samples.byteswap()
            if loop:
                # Blend continuation past the loop end into its opening. The boundary
                # itself remains consecutive samples; no fade-to-silence on each repeat.
                for frame in range(blend):
                    weight = .5 - .5 * math.cos(math.pi * frame / (blend - 1))
                    for ch in range(2):
                        i = frame * 2 + ch
                        samples[i] = samples[frames * 2 + i] * (1 - weight) + samples[i] * weight
            else:
                for frame in range(frames):
                    gain = min(1, frame / (.025 * RATE), (frames - 1 - frame) / (1.4 * RATE))
                    for ch in range(2):
                        samples[frame * 2 + ch] *= max(0, gain)
            samples = samples[:frames * 2]
            if sys.byteorder != 'little':
                samples.byteswap()
            pcm = scratch / f'{name}.f32'
            pcm.write_bytes(samples.tobytes())
            wav = scratch / f'{name}.wav'
            ffmpeg('-f', 'f32le', '-ar', RATE, '-ac', 2, '-i', pcm, '-c:a', 'pcm_f32le', wav)
            stats = measure(wav)
            gain_db = min(target - float(stats['input_i']), -2 - float(stats['input_tp']))
            destination = OUT / f'{name}-v1.mp3'
            ffmpeg('-i', wav, '-af', f'volume={gain_db}dB', '-c:a', 'libmp3lame', '-b:a', '128k',
                   '-write_xing', 1, '-metadata', 'artist=Spring Spring / Julie Damsgaard',
                   '-metadata', f'title=Decrypto {name} edit – (Basically not) Fusion Jazz', destination)
            final = measure(destination)
            decoded = array.array('f', ffmpeg('-i', destination, '-ar', RATE, '-ac', 2, '-f', 'f32le', '-', capture=True))
            seam = max(abs(decoded[ch] - decoded[-2 + ch]) for ch in range(2))
            assert abs(len(decoded) / (2 * RATE) - frames / RATE) < .002
            assert float(final['input_tp']) < -2
            assert not loop or seam < .02, (name, seam)
            report['tracks'][name] = dict(file=destination.name, source_start=start, duration=frames / RATE,
                loop=loop, processing=filters, gain_db=round(gain_db, 2), lufs=float(final['input_i']),
                peak_dbtp=float(final['input_tp']), boundary_step=round(seam, 6), bytes=destination.stat().st_size)
    (OUT / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report['tracks'], indent=2))


if __name__ == '__main__':
    main()
