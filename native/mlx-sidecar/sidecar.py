# native/mlx-sidecar/sidecar.py
# NDJSON stdio sidecar hosting lightning-whisper-mlx or parakeet-mlx.
# Loaded lazily so `load` reports import errors as JSON instead of crashing.
import json
import sys


def respond(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def words_from_lightning(result):
    """lightning-whisper-mlx returns {'text', 'segments': [[start, end, text], ...]}
    (times in ms in some versions, seconds in others). No word timings, so
    distribute each segment's words linearly across its span."""
    words = []
    segments = result.get("segments") or []
    for segment in segments:
        try:
            start, end, text = segment[0], segment[1], segment[2]
        except (IndexError, TypeError):
            continue
        start, end = float(start), float(end)
        if end < 100:  # heuristic: values this small are seconds, not ms
            start, end = start * 1000, end * 1000
        tokens = [t for t in str(text).split() if t]
        if not tokens:
            continue
        step = (end - start) / len(tokens)
        for i, token in enumerate(tokens):
            words.append({"text": token, "endMs": int(start + step * (i + 1))})
    if not words and result.get("text"):
        words = [{"text": result["text"].strip(), "endMs": 0}]
    return words


def words_from_parakeet(result):
    words = []
    for sentence in getattr(result, "sentences", []):
        for token in getattr(sentence, "tokens", []):
            text = getattr(token, "text", "").strip()
            if text:
                words.append({"text": text, "endMs": int(float(getattr(token, "end", 0)) * 1000)})
    return words


def main():
    engine_kind = None
    engine = None
    respond({"type": "sidecar-ready"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(request, dict):
            continue
        request_id = request.get("id")
        try:
            cmd = request.get("cmd")
            if cmd == "load":
                kind = request["engine"]
                model = request["model"]
                if kind == "lightning":
                    from lightning_whisper_mlx import LightningWhisperMLX

                    engine = LightningWhisperMLX(model=model, batch_size=12, quant=None)
                elif kind == "parakeet":
                    from parakeet_mlx import from_pretrained

                    engine = from_pretrained(model)
                else:
                    raise ValueError(f"unknown engine: {kind}")
                engine_kind = kind
                respond({"id": request_id, "ok": True})
            elif cmd == "transcribe":
                if engine is None:
                    raise RuntimeError("no engine loaded")
                path = request["path"]
                if engine_kind == "lightning":
                    result = engine.transcribe(audio_path=path)
                    words = words_from_lightning(result)
                else:
                    result = engine.transcribe(path)
                    words = words_from_parakeet(result)
                respond({"id": request_id, "words": words})
            else:
                raise ValueError(f"unknown cmd: {cmd}")
        except Exception as error:  # report, never crash the loop
            respond({"id": request_id, "error": str(error)})


if __name__ == "__main__":
    main()
