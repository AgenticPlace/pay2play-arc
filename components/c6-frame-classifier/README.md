# C6 · Per-frame edge-ML classifier

Machine-to-machine demo: a "camera" POSTs frames; a classifier service answers for $0.0005/frame. Pure M2M narrative — no humans in the loop.

## Run

```bash
pnpm start   # :4026
# Classifier endpoint:
# POST /classify  body: { frames: [{ id, data /* base64 jpg */, model? }, ...] }
# Price = frames.length × $0.0005
```
