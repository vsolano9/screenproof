# Media fixture provenance

These files are one-second, stream-copy trims of the independent media reproductions in the 2026-09-12 Screenproof audit handoff. They contain generated black video and silent audio. They are committed so parser tests do not depend on ffmpeg or a network connection.

| File | Independently verified audio | Purpose |
| --- | --- | --- |
| `mp3.mp4` | MP3, `mp4a` sample entry, stereo, 44.1 kHz | Proves that the container tag alone does not establish AAC. |
| `pcm64.mov` | 64-bit floating-point PCM, `fl64` sample entry, stereo, 48 kHz | Proves that the fixed 16-bit sound-description field can be a placeholder. |
| `mono.mp4` | AAC, `mp4a` sample entry, mono, 44.1 kHz | Positive codec control and negative stereo-layout control. |

The source files were generated with ffmpeg for the audit, then inspected with ffprobe. On 2026-09-12, each committed copy was trimmed with `-map 0 -t 1 -c copy -movflags +faststart`; no stream was re-encoded. ffmpeg and ffprobe are fixture-preparation tools only and are not Screenproof runtime dependencies.
