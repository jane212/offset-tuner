# Offset tuner

Fine-tune corridor offsets on top of the volume-weighted band + cutoff solution for Waverly 4th St SW.

The plot matches the green timelines: southbound phase 6 on the left, northbound phase 2 on the right, signals north to south. Raising an offset shifts that signal’s green to the right (it wraps inside the cycle).

## Run (Windows CMD)

```bat
cd /d G:\LLC\Work\Projects\REACTOR\SignalTiming\Retiming\OffsetTuner
start.bat
```

Open http://127.0.0.1:8765

Python 3 is enough. No extra packages. Do not open `index.html` by double-click; the browser will block `data/plans.json`.

## Use

1. Pick a TOD plan.
2. Drag a signal’s slider (0 through cycle length − 1, step 1 s). The green bars update as you drag.
3. **Reset** restores the optimized offsets for the current plan.
4. **Save CSV** downloads `offsets_<day>_plan<id>_C<cycle>_<yyyymmdd_hhmmss>.csv`.
5. **Upload CSV** reloads a file saved from this tool and restores that plan’s offsets.

## Share

This folder is self-contained. Share `OffsetTuner/` (include `data/plans.json`). Recipients run `start.bat` the same way.

To rebuild `data/plans.json` after a new optimization:

```bat
cd /d G:\LLC\Work\Projects\REACTOR\SignalTiming\Retiming\OffsetTuner
python build_data.py
```

That reads `TomTomBased\Green_Plots_Optimized_BandCutoff\offsets.csv`.
