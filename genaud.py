#!/usr/bin/env python3

"""Generate speech audio + subtitles from text.txt with simple progress logs."""

import asyncio
from pathlib import Path

import edge_tts

TEXT_FILE = Path("text.txt")
VOICE = "en-GB-SoniaNeural"
OUTPUT_FILE = Path("audio/sermon/v1/3/audio.mp3")
SRT_FILE = Path("audio/sermon/v1/3/audio.srt")


def load_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"Input text file is empty: {path}")
    return text


async def amain() -> None:
    """Main function."""
    text = load_text(TEXT_FILE)
    words = len(text.split())
    print(f"[1/4] Loaded {TEXT_FILE} ({words} words).")
    print(f"[2/4] Starting TTS with voice: {VOICE}")

    communicate = edge_tts.Communicate(text, VOICE)
    submaker = edge_tts.SubMaker()

    audio_chunks = 0
    audio_bytes = 0
    boundary_events = 0
    progress_interval = 200

    print("[3/4] Streaming audio...")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "wb") as file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                data = chunk["data"]
                file.write(data)
                audio_chunks += 1
                audio_bytes += len(data)

                if audio_chunks % progress_interval == 0:
                    print(
                        f"  - audio chunks: {audio_chunks}, bytes: {audio_bytes:,}"
                    )
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                submaker.feed(chunk)
                boundary_events += 1

    with open(SRT_FILE, "w", encoding="utf-8") as file:
        file.write(submaker.get_srt())

    print("[4/4] Done.")
    print(
        f"Created {OUTPUT_FILE} ({audio_bytes:,} bytes) and {SRT_FILE} "
        f"with {boundary_events} boundary events."
    )


if __name__ == "__main__":
    asyncio.run(amain())
