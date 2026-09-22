"""Build the console's recorded foley bank. Requires Python 3 and ffmpeg.

Usage: python3 assets/audio/build_bank.py /path/to/source-downloads
See README.md for source filenames, URLs and CC0 credits. No runtime synthesis.
"""
import array
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1])
RATE = 24000


def recording(name, start=0, end=None, speed=1, lowpass=8500, highpass=85):
    filters = f'atrim=start={start}' + (f':end={end}' if end else '')
    filters += f',asetpts=PTS-STARTPTS,highpass=f={highpass},lowpass=f={lowpass}'
    # Resample the source itself so tuning remains identical in every browser.
    filters += f',aresample={RATE},asetrate={RATE * speed},aresample={RATE}'
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(SOURCE / name),
        '-af', filters, '-ac', '1', '-f', 'f32le', 'pipe:1'])
    return list(array.array('f', raw))


def finish(x, peak=.72, trim=True, fade=.012):
    if trim:
        gate = max(abs(v) for v in x) * .025
        active = [i for i, v in enumerate(x) if abs(v) > gate]
        x = x[max(0, active[0] - int(.003 * RATE)):min(len(x), active[-1] + int(.025 * RATE))]
    dc = sum(x) / len(x)
    x = [v - dc for v in x]
    gain = peak / max(abs(v) for v in x)
    attack, release = int(.002 * RATE), int(fade * RATE)
    return [v * gain * min(1, i / attack, (len(x) - 1 - i) / release) for i, v in enumerate(x)]


def mix(*parts):
    # Parts are (seconds, samples, gain). Preserve naturally recorded transients.
    result = [0.] * max(int(at * RATE) + len(x) for at, x, _ in parts)
    for at, x, gain in parts:
        offset = int(at * RATE)
        for i, value in enumerate(x):
            result[offset + i] += value * gain
    return result


def contact(x):
    # Kenney's scroll recordings contain a whole train of contacts. Extract one
    # tooth; playing that train for every pointer event would stack into a rattle.
    peak = max(range(len(x)), key=lambda i: abs(x[i]))
    return x[max(0, peak - int(.004 * RATE)):peak + int(.040 * RATE)]


def radio(pulses, duration):
    """Authored narrow-band keyed carrier, with squelch and imperfect contacts.

    Reserved for signals from the speaker, never used to imitate a mechanism.
    No melodies, glissandos, or victory arpeggios.
    """
    rng = random.Random(3406)
    out = []
    low = high = 0
    for i in range(int(duration * RATE)):
        t = i / RATE
        low += .37 * (rng.uniform(-1, 1) - low)
        high += .075 * (low - high)
        static = (low - high) * .10
        carrier = 0
        for at, length, frequency in pulses:
            age = t - at
            if 0 <= age < length:
                envelope = min(1, age / .003, (length - age) / .005)
                wobble = .7 * math.sin(t * 31) + .35 * math.sin(t * 71)
                wave = math.tanh(1.5 * math.sin(2 * math.pi * frequency * t + wobble * .08))
                carrier += wave * envelope * (.42 + .025 * math.sin(t * 97))
        gate = min(1, t / .014, (duration - t) / .035)
        out.append((carrier + static) * gate)
    return out


bank = {}


def add(cue, clips, gain=1, cooldown=.05):
    bank[cue] = {'clips': clips, 'gain': gain, 'cooldown': cooldown}


keys = [finish(recording(f'keys/Single Keys/keypress-{i:03}.wav', speed=.89, lowpass=6500)) for i in [1, 9, 17, 25]]
switch = finish(recording('switch.mp3', speed=.9, lowpass=7000))
latch = finish(recording('floppy.mp3', 1.285, 1.48, speed=.9, lowpass=6600))
add('key', keys, .74, .035)
add('switch', [switch, finish(recording('switch.mp3', speed=.98, lowpass=6400))], .70)
add('knob', [finish(contact(recording(f'interface/Audio/scroll_{i:03}.ogg', lowpass=4400))) for i in [1, 2, 3]], .22, .085)
add('latch', [latch], .80)
add('handle', [finish(recording('floppy.mp3', .12, .44, speed=.72, lowpass=1700), peak=.48)], .35, .18)
# The insertion's dry guide scrape and its final latch are separately triggered.
add('disk-in', [finish(recording('floppy.mp3', .03, .60, speed=.92, lowpass=5400), peak=.48, trim=False)], .55, .12)
add('disk-seat', [finish(recording('insert.mp3', .09, .42, lowpass=6500))], .88, .10)
add('disk-out', [finish(recording('eject.mp3', lowpass=6500))], .85, .12)
add('paper-feed', [finish(recording('printer.mp3', 3.58, 3.94, speed=.9, lowpass=6200), peak=.55, trim=False)], .62, .15)
motor = recording('printer.mp3', .70, 1.42, speed=.92, lowpass=5500)
# Equal-power overlap closes the recorded motor loop without a cut or retrigger.
overlap = int(.035 * RATE)
middle = motor[overlap:-overlap]
seam = [motor[-overlap + i] * math.cos(i / overlap * math.pi / 2) +
        motor[i] * math.sin(i / overlap * math.pi / 2) for i in range(overlap)]
motor = middle + seam
scale = .55 / max(abs(v) for v in motor)
add('paper-motor', [[v * scale for v in motor]], .62)
add('paper-tear', [finish(recording('tear.mp3', .49, .79, speed=1.05, lowpass=8500)),
                   finish(recording('tear.mp3', .48, .79, speed=.98, lowpass=7800))], .68, .12)
add('score', [finish(recording('switch.mp3', .015, .15, speed=1.3, lowpass=8000))], .46, .015)
power = finish(recording('switch.mp3', speed=.72, lowpass=5000))
add('power-on', [finish(mix((0, power, 1), (.055, keys[1], .16)))], .85, .12)
add('power-off', [finish(recording('switch.mp3', speed=.8, lowpass=4200))], .76, .12)
# Isolated CRT transients only. The longer TV-cycle recording formerly used
# for warmup/discharge had speech-like background audio; do not reuse it.
# Warmup and discharge now use the continuously decaying coil transient, with
# different passbands. End every cut before the recording's ambient floor.
add('crt-degauss', [finish(recording('crt-on.mp3', .195, .82, lowpass=7200), trim=False, fade=.10)], .70, .08)
add('crt-warmup', [finish(recording('crt-on.mp3', .30, .62, highpass=1000, lowpass=6000), peak=.48, trim=False, fade=.12)], .22, .08)
add('crt-collapse', [finish(recording('crt-off.mp3', .67, .74, highpass=350, lowpass=7000), peak=.60, trim=False, fade=.018)], .48, .08)
add('crt-discharge', [finish(recording('crt-on.mp3', .32, .56, highpass=2800, lowpass=8500), peak=.38, trim=False, fade=.12)], .17, .08)
add('transmit', [finish(mix((0, latch, .8), (.12, radio([(0, .045, 880), (.095, .11, 880)], .25), .25)))], .80, .20)
add('receive', [finish(mix((0, switch, .25), (.025, radio([(0, .075, 710)], .16), .35)))], .42, .25)
add('turn', [finish(mix((0, switch, .25), (.025, radio([(0, .065, 810), (.145, .12, 810)], .31), .35)))], .48, .25)
add('success', [finish(radio([(0, .055, 780), (.12, .055, 780), (.25, .15, 780)], .46))], .32, .25)
add('error', [finish(radio([(0, .15, 380)], .23))], .34, .25)
add('test', [finish(mix((0, switch, .5), (.07, radio([(0, .11, 680)], .18), .28)))], .64, .20)

samples = []
manifest = {}
for cue, spec in bank.items():
    variants = []
    for clip in spec['clips']:
        variants.append({'offset': round(len(samples) / RATE, 6), 'duration': round(len(clip) / RATE, 6)})
        samples.extend(clip)
        samples.extend([0.] * int(.045 * RATE))
    manifest[cue] = {'variants': variants, 'gain': spec['gain'], 'cooldown': spec['cooldown']}


def write_wav(path, pcm):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(array.array('h', (round(max(-1, min(1, v)) * 32767) for v in pcm)).tobytes())


target = ROOT / 'web/public/audio/console-foley-v3.wav'
write_wav(target, samples)
(ROOT / 'web/src/components/console/soundBank.ts').write_text(
    '// Generated by assets/audio/build_bank.py; source credits in assets/audio/README.md.\n'
    'export const soundBank = {\n' + ''.join(f'    {json.dumps(cue)}: {json.dumps(spec)},\n' for cue, spec in manifest.items()) + '} as const;\n')

# Compact audition: keys, toggle, disk insertion/seat/eject, paper feed/tear, SEND.
demo = []
for cue, variant in [('key', 0), ('key', 1), ('key', 2), ('switch', 0), ('disk-in', 0),
                     ('disk-seat', 0), ('disk-out', 0), ('paper-feed', 0), ('paper-tear', 0), ('transmit', 0)]:
    demo.extend([v * bank[cue]['gain'] * .45 for v in bank[cue]['clips'][variant]])
    demo.extend([0.] * int(.28 * RATE))
write_wav(SOURCE / 'console-audition.wav', demo)
# Separate preview at the app's mix level: cold startup, pause, shutdown.
def preview(cue):
    return [v * bank[cue]['gain'] * .45 for v in bank[cue]['clips'][0]]
write_wav(ROOT / 'assets/audio/crt-audition.wav', mix(
    (0, preview('power-on'), 1), (.025, preview('crt-degauss'), 1), (.05, preview('crt-warmup'), 1),
    (1.7, preview('power-off'), 1), (1.79, preview('crt-collapse'), 1), (2.05, preview('crt-discharge'), 1)))
print(f'{target}: {len(samples) / RATE:.2f}s, {target.stat().st_size / 1024:.0f} KiB, {len(manifest)} cues')
