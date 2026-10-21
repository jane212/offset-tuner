"""Pack volume-weighted band+cutoff offsets into data/plans.json."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
SRC = (
    ROOT.parent
    / "TomTomBased"
    / "Green_Plots_Optimized_BandCutoff"
    / "offsets.csv"
)
SEG = (
    ROOT.parent
    / "TomTomBased"
    / "Green_Plots_Optimized_BandCutoff"
    / "segment_travel_times.csv"
)
OUT = ROOT / "data" / "plans.json"


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    df = pd.read_csv(SRC)
    df["SignalID"] = df["SignalID"].astype(str)
    seg = pd.read_csv(SEG)
    seg["from_SignalID"] = seg["from_SignalID"].astype(str)
    seg["to_SignalID"] = seg["to_SignalID"].astype(str)

    # North -> south is the row order in offsets.csv
    ids = df["SignalID"].drop_duplicates().tolist()
    names = (
        df.drop_duplicates("SignalID")
        .set_index("SignalID")["SecondaryName"]
        .to_dict()
    )

    links_sb = []
    links_nb = []
    for i in range(len(ids) - 1):
        a, b = ids[i], ids[i + 1]
        row = seg.loc[
            (seg["from_SignalID"] == a) & (seg["to_SignalID"] == b)
        ]
        if row.empty:
            raise SystemExit(f"missing segment {a} -> {b}")
        links_sb.append(
            {"from": a, "to": b, "tt": float(row["tt_sb_sec"].iloc[0])}
        )
        links_nb.append(
            {"from": b, "to": a, "tt": float(row["tt_nb_sec"].iloc[0])}
        )

    cum_sb = {ids[0]: 0.0}
    running = 0.0
    for link in links_sb:
        running += link["tt"]
        cum_sb[link["to"]] = running
    # links_nb is stored north-segment first; NB time accumulates from the south.
    cum_nb = {ids[-1]: 0.0}
    running = 0.0
    for link in reversed(links_nb):
        running += link["tt"]
        cum_nb[link["to"]] = running

    plans = []
    keys = ["day_type", "plan_id", "start_time", "end_time", "cycle_length"]
    for _, plan in df.loc[:, keys].drop_duplicates().iterrows():
        part = df.loc[
            (df["day_type"] == plan["day_type"])
            & (df["plan_id"] == plan["plan_id"])
        ]
        by_id = part.set_index("SignalID")
        signals = []
        for sid in ids:
            r = by_id.loc[sid]
            signals.append(
                {
                    "id": sid,
                    "name": str(names[sid]),
                    "offset": int(r["offset"]),
                    "split2": int(r["split2"]),
                    "split6": int(r["split6"]),
                    "tt_sb": float(cum_sb[sid]),
                    "tt_nb": float(cum_nb[sid]),
                }
            )
        head = part.iloc[0]
        plans.append(
            {
                "corridor_id": str(head["CorridorID"]),
                "day_type": str(plan["day_type"]),
                "plan_id": int(plan["plan_id"]),
                "start_time": str(plan["start_time"]),
                "end_time": str(plan["end_time"]),
                "cycle": int(round(float(plan["cycle_length"]))),
                "d_sb": float(head["d_sb"]),
                "d_nb": float(head["d_nb"]),
                "vol_sb": float(head["vol_sb"]),
                "vol_nb": float(head["vol_nb"]),
                "w_band": float(head["w_band"]),
                "w_cut": float(head["w_cut"]),
                "signals": signals,
            }
        )

    payload = {
        "source": "TomTomBased/Green_Plots_Optimized_BandCutoff",
        "note": (
            "Starting offsets are the volume-weighted band+cutoff solution. "
            "Green shifts by adj_start = (offset - TT) mod C."
        ),
        "links_sb": links_sb,
        "links_nb": links_nb,
        "plans": plans,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[data] {len(plans)} plans -> {OUT}")


if __name__ == "__main__":
    main()
