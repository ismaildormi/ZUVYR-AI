# ZUVYR Studio — Voice Bible & Character Bible

The voice bible defines one stable voice per recurring character. Each voice
has a **model-generated reference clip** (`voices/reference_clips/<id>.wav`,
8–10 s, neutral read) that is reused forever as the zero-shot clone reference
in full mode (Chatterbox). **No real person's voice is ever cloned** —
references are synthesized by the studio itself (or user-owned recordings).

`bin/zuvyr voices` lists the bible; `bin/zuvyr voices --build` regenerates
the reference clips.

## Voices (14)

| voice_id | character | age | gender | pitch | pace | accent | timbre | personality | default emotion | engine (degraded) |
|---|---|---|---|---|---|---|---|---|---|---|
| narrator | Narrator | adult | male | low | measured 150 wpm | neutral American | warm, storytelling | calm omniscient storyteller | neutral | zsynth |
| mika | Mika Sato | teen | female | medium-high | medium-fast 172 | neutral American | bright, expressive | hopeful and earnest | determined | zsynth |
| jayden | Jayden Cole | teen | male | medium | fast 186 | neutral American | warm, gritty | hype and loyal | excited | zsynth |
| rico | Rico Vega | teen | male | high | very fast 198 | slight Latino | hype, bouncy | fearless hype-man | excited | zsynth |
| zoe | Zoe Reyes | teen | female | medium | sharp 180 | neutral American | edgy, confident | competitive emcee | determined | zsynth |
| mr_grimm | Mr. Grimm | older adult | male | low | slow 134 | neutral American | oily, smug | greedy and patient | greedy | zsynth |
| tommy | Tommy Kim | child | male | very high | quick 184 | neutral American | small, nervous | scared but brave with friends | fearful | zsynth |
| mrs_kim | Mrs. Kim (Tommy's mother) | adult | female | medium | gentle 158 | neutral American | warm, kind | loving mother | tender | zsynth |
| mr_cole | Mr. Cole (Jayden's father) | adult | male | low | firm 146 | neutral American | stern, deep | strict but fair | neutral | zsynth |
| ms_chan | Ms. Chan (teacher) | adult | female | medium | even 162 | neutral American | clear, authoritative | firm teacher who cares | neutral | zsynth |
| grandma_rosa | Grandma Rosa | senior | female | low | slow 136 | slight Latino | raspy, sweet | block grandmother | tender | zsynth |
| the_broker | The Broker | adult | male | very low | very slow 124 | neutral American | calm, menacing | quiet villain | menacing | zsynth |
| derek | Derek (bully) | teen | male | medium-high | taunting 168 | neutral American | nasal, mocking | school bully | sarcastic | zsynth |
| kid_crowd | Crowd of kids (extras) | teen | mixed | mixed | chant 176 | neutral American | group chant | the whole block cheering | excited | zsynth |

Engine per voice in **full mode**: Chatterbox / Chatterbox-Turbo (MIT) is the
main character engine (exaggeration 0–2, cfg, `[laugh]` tags, zero-shot
cloning from the reference clip). Long multi-speaker passages run through
Dia (`[S1]/[S2]` + `(laughs)(gasps)(sighs)`) or Higgs Audio **V2**; cast
voice design via Qwen3-TTS; Orpheus for tag-based nonverbals
(`<sigh><laugh><gasp><cry>`). Kokoro (Apache-2.0) is the **narrator only**.
**Never** Higgs Audio V3 or Fish Audio S2 Pro (non-commercial licenses).

## Character bible (visual identity)

Fixed appearance + fixed seed + fixed sprite → the same face/hair/outfit in
every scene, every video, every format. The token block is injected into
**every** prompt for that character.

| id | name | age | role | voice | seed |
|---|---|---|---|---|---|
| mika | Mika Sato | 16 | protagonist — teen girl with a sketchbook and a plan | mika | 1628975950 |
| jayden | Jayden Cole | 15 | best friend — emcee with golden headphones | jayden | 1985630048 |
| rico | Rico Vega | 14 | crew — street dancer, hype machine | rico | 1561120006 |
| zoe | Zoe Reyes | 15 | rival-turned-ally emcee | zoe | 1170927047 |
| mr_grimm | Howard Grimm | 52 | antagonist — greedy landlord | mr_grimm | 818879497 |
| tommy | Tommy Kim | 10 | neighbor kid — the heart of the block | tommy | 242832307 |

Token block example (mika, injected verbatim in every prompt she appears in):

> Mika Sato, 16-year-old Japanese-American girl, long dark navy hair with one
> bright teal streak, large amber eyes, slim build, denim jacket over a
> mustard-yellow t-shirt, dark pleated skirt, white sneakers, carrying a
> sketchbook

## Emotion pipeline

Per dialogue line the brain annotates **speaker, emotion, intensity 1–5,
delivery** (whisper/normal/shout/trembling/breaking/cold), **pause_before_ms**
and **nonverbal** (laugh/sigh/gasp/sob/breath/gulp). It annotates only —
never rewrites the line.

Mapping (Chatterbox exaggeration): calm 0.4–0.6 · normal 0.8–1.0 ·
intense 1.5–2.0. Pauses go before reveals; slower pacing = sadness;
sharper attacks = anger/greed. Three takes per important line (different
seeds); selection gates on faster-whisper WER + emotion match
(emotion2vec in full mode), falling back to lowest-WER-most-expressive.
The **exact final audio** feeds lip-sync.
