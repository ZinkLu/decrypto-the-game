# Console sound sources

All third-party source recordings below are released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The console uses edited excerpts: trimmed, equalized, resampled to mono 24 kHz,
level matched, and in some cases layered or played at a slightly lower pitch.
Radio signalling cues are authored by this project in `assets/audio/build_bank.py`.

| Source | Author | Used for |
| --- | --- | --- |
| [Keyboard Soundpack #1](https://opengameart.org/content/keyboard-soundpack-1-typing-and-single-keystrokes) | unicaegames | Four keypress recordings (001, 009, 017, 025), light case resonance |
| [click_switch.wav](https://freesound.org/people/StarTowerStudio/sounds/424987/) | StarTowerStudio | Toggle, power, score-register contact |
| [inserting_floppy_disc.wav](https://freesound.org/people/KRAFTWERK2K1/sounds/39697/) | KRAFTWERK2K1 | Disk guide friction, latch, soft handling, transmit lever |
| [floppy_insert.ogg](https://freesound.org/people/asiekierka/sounds/628244/) | asiekierka | Amiga 600 disk seating |
| [floppy_eject.ogg](https://freesound.org/people/asiekierka/sounds/628245/) | asiekierka | Amiga 600 spring ejection |
| [Old Till Printer Feeding Receipt Paper.wav](https://freesound.org/people/lolamadeus/sounds/217181/) | lolamadeus | Continuous paper-feed motor and short mobile/reduced-motion feed |
| [Paper Tear.wav](https://freesound.org/people/Marissrar/sounds/366909/) | Marissrar | Paper tearing, two edits |
| [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | Three quiet dial-contact sounds (scroll_001–003) |
| [CRT TV Switches On](https://freesound.org/people/Fission9/sounds/693860/) | Fission9 | CRT degaussing coil, short filtered coil-decay excerpts for warmup and discharge (14-inch PAL television, H4n Pro recording) |
| [Tv 100Hz off.wav](https://freesound.org/people/KnightRider1/sounds/90682/) | KnightRider1 | Philips CRT shutdown, timed to raster collapse |

Freesound edits were made from the site's publicly offered high-quality MP3
previews. They are source recordings, not original recordings made for this game.
No third-party requests are made by the running game; the finished sound bank is
served locally from `/audio/console-foley-v3.wav`.

## Music V1

All four music edits use [(Basically not) Fusion Jazz](https://opengameart.org/content/basically-not-fusion-jazz)
by **Spring Spring / Julie Damsgaard**, released on OpenGameArt under **CC0 1.0**.
Original file: [fusion jazz_0.ogg](https://opengameart.org/sites/default/files/fusion%20jazz_0.ogg).
The music is an existing recording, not an original composition or an AI-generated track.

| Local edit | Use | Changes to the stereo master |
| --- | --- | --- |
| `music/lobby-v1.mp3` | Home / room, looping | 82.129-second musical cycle, circular boundary blend, level matching; original tempo and pitch |
| `music/game-v1.mp3` | All active game phases, looping | Next iteration of the same cycle; 2 dB high shelf reduction, light compression, 4 LU quieter |
| `music/win-v1.mp3` | Local win, once | Six-second excerpt, short attack and 1.4-second release, level matching |
| `music/loss-v1.mp3` | Local loss, once | 4.5-second excerpt, gentle high shelf reduction and release, level matching |

These are provisional excerpts and mix edits, not separate instrumental arrangements.
The original master contains three iterations of the same approximately 82-second cycle.
No vocals, new samples, tempo changes, or pitch changes were added. Assets are
served by this application; there is no runtime dependency on OpenGameArt.
`music/manifest.json` records source checksum, edit points, duration and measured loudness.
