"""Generate a deterministic industrial production fixture for both databases."""
import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "production_events.csv"
ROWS = 10_000
LINES = ("LINE-01", "LINE-02", "LINE-03", "LINE-04")
START = datetime(2025, 1, 6, 6, 0)


def main():
    rng = random.Random(20251005)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(("event_id", "event_ts", "line_id", "units_produced", "units_defective"))
        for event_id in range(1, ROWS + 1):
            event_ts = START + timedelta(minutes=15 * (event_id - 1))
            line = LINES[(event_id - 1) % len(LINES)]
            produced = rng.randint(80, 140)
            defect_rate = 0.012 + (0.008 if line == "LINE-03" else 0) + rng.random() * 0.018
            defective = min(produced, round(produced * defect_rate))
            writer.writerow((event_id, event_ts.strftime("%Y-%m-%d %H:%M:%S"), line, produced, defective))
    print(f"Wrote {ROWS:,} rows to {OUT}")


if __name__ == "__main__":
    main()

