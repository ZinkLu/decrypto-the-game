# Console audio

The production bank is `web/public/audio/console-foley-v3.wav` (mono, 24 kHz,
16-bit PCM, approximately 449 KiB; 24 cues, 31 clips). Its segment manifest is generated into
`web/src/components/console/soundBank.ts`. Source credits and licenses are in
[`web/public/audio/CREDITS.md`](../../web/public/audio/CREDITS.md).

Keys, toggle contacts, disk loading and paper transport use recorded foley.
Keys and rotary contacts rotate through distinct takes. The printer uses one
crossfaded recorded loop while the visible roller advances, with 25 ms attack
and 30 ms release; it is never retriggered each animation frame. Disk seating
and spring ejection follow the physical animation's impact events. Speaker
messages use a narrow-band keyed radio carrier and contact noise, not melodies.

CRT power uses four cues cut from two recordings: degauss, warmup, raster collapse,
and static discharge. Warmup and discharge use short, band-limited excerpts of
the degaussing coil's decay. The longer TV-cycle source was removed after a
speech-like background sound was reported; it is no longer in the bank.
`CrtSoundMotion` observes the main tube's supply, raster
size and phosphor state, so the other tubes do not stack duplicate effects.
Cold starts energise the degaussing coil; the simulated hot PTC suppresses it
on warm restarts and palette changes. Warmup ends when the picture is steady,
collapse begins at the line, and the quiet discharge follows the remaining spot.
Reversals cancel the outgoing electrical voices without cutting the mechanical
switch. Reduced motion uses one short cue per power action. Initial snapshots,
ordinary game updates, and the mobile fallback do not invent CRT transitions.

Music and sound effects default on and share one gesture-unlocked context. The rear MUSIC and SFX slides control independent gain paths; muting effects never mutes music.
Turning SFX off stops every effect immediately, including the paper motor, and
invalidates cues awaiting fetch/decode/resume. Hidden pages also stop all voices. Audio
is prefetched without creating an AudioContext; only a user gesture can unlock
playback. Asset failures remain silent and never block a game action.

## Rebuilding

Requires Python 3 (standard library only) and `ffmpeg`. Download these source
files into a temporary source directory, preserving the filenames below:

| Local file | Download |
| --- | --- |
| `floppy.mp3` | https://cdn.freesound.org/previews/39/39697_276701-hq.mp3 |
| `insert.mp3` | https://cdn.freesound.org/previews/628/628244_890072-hq.mp3 |
| `eject.mp3` | https://cdn.freesound.org/previews/628/628245_890072-hq.mp3 |
| `switch.mp3` | https://cdn.freesound.org/previews/424/424987_8533382-hq.mp3 |
| `printer.mp3` | https://cdn.freesound.org/previews/217/217181_544580-hq.mp3 |
| `tear.mp3` | https://cdn.freesound.org/previews/366/366909_6050874-hq.mp3 |
| `crt-on.mp3` | https://cdn.freesound.org/previews/693/693860_9395330-hq.mp3 |
| `crt-off.mp3` | https://cdn.freesound.org/previews/90/90682_985693-hq.mp3 |
| `keys/Single Keys/keypress-*.wav` | Extract [Keyboard Soundpack](https://opengameart.org/sites/default/files/unicae_games_keyboard_soundpack_1_0.zip) under `keys/` |
| `interface/Audio/scroll_*.ogg` | Extract [Interface Sounds](https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip) under `interface/` |

Run from the repository root:

```sh
python3 assets/audio/build_bank.py /path/to/source-directory
```

This rebuilds the WAV, manifest, and `console-audition.wav` in the source
directory. The audition uses the same levels as the app, in this order: three
keys, switch, disk slide, disk seat, disk eject, paper feed, tear, transmit.
It also writes [`assets/audio/crt-audition.wav`](crt-audition.wav): cold startup
followed by shutdown, at app levels. These are short recordings, with no
continuous high-frequency whine.

Update the filename version in the builder and `sound.ts` when replacing the
bank so deployed browsers cannot retain stale segment timings. The raw source
packs are not shipped; the app has no runtime dependency on external hosts.

## Background music V1

Four local MP3s (128 kbps, stereo 32 kHz, approximately 2.67 MiB total) live in
`web/public/audio/music/`. Two 82.129-second loops follow the source's actual
cycle, and 6/4.5-second excerpts serve as provisional win/loss endings.
`music-plan.md` records the decisions and the remaining listening work.

Rebuild from the credited original `fusion jazz_0.ogg`:

```sh
python3 assets/audio/build_music.py /path/to/fusion.ogg
```

The builder measures loudness and decoded MP3 boundaries, checks clipping and
gapless duration, and writes `manifest.json`. It uses a circular 160 ms blend,
not a fade to silence on every loop. These checks cannot establish musical fit.
The game edit is quieter and mildly filtered/compressed; no stems were available.

`ConsoleMusic` acquires the same gesture-unlocked master bus as `ConsoleAudio`.
It lazily loads only the desired track and retains one decoded buffer. Native
AudioBufferSource loops have no JavaScript restart timer. Scene changes crossfade
over 0.9 seconds; power-off fades over 0.65 seconds. Music mute/hidden pages stop
all music sources immediately; ordinary loops retain their playhead, interrupted
endings are consumed. Remote state changes never unlock audio. Fresh known local
results replace the legacy beep; snapshots/draws/observers do not invent a win.
Significant speaker cues duck music for roughly one second; keys and dials do not.

The Settings panel mirrors both independent rear switches and exposes music volume.
Music choices persist in `decrypto-music`; a new session without a saved choice defaults both channels on.
Playback waits for the first pointer or keyboard gesture, including when effects are disabled.
Missing audio can be retried without blocking gameplay.
