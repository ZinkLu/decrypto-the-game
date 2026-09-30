#!/usr/bin/env python3
"""One measurement window as JSON: system-wide GPU/CPU/DRAM watts and the GPU's mean clock while active.

    python3 iowin.py 6   ->  {"gpu_w": ..., "cpu_w": ..., "dram_w": ..., "gpu_active": ..., "gpu_mhz": ...}

The watts include every other process: subtract a baseline window measured the same way, interleaved.
"""
import json, os, re, subprocess, sys, time
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iorep

def gpu_clocks():
    """MHz of OFF, P1 ... Pn, from the power manager's GPU voltage table (voltage-states9: pairs of Hz and mV)."""
    out = subprocess.run(['ioreg', '-r', '-n', 'pmgr', '-w', '0', '-l'], capture_output=True, text=True).stdout
    m = re.search(r'"voltage-states9" = <([0-9a-f]+)>', out)
    if not m: return None
    raw = bytes.fromhex(m.group(1))
    values = [int.from_bytes(raw[i:i + 4], 'little') for i in range(0, len(raw), 4)]
    return [values[i] / 1e6 for i in range(0, len(values), 2)]

clocks = gpu_clocks()
s = iorep.Sampler(); a = s.sample(); time.sleep(float(sys.argv[1]) if len(sys.argv) > 1 else 6); d = s.delta(a, s.sample())
watts = {k: v / d['seconds'] for k, v in d['energy'].items()}
states = list(d['gpu_states'].values()); total = sum(states) or 1; active = sum(states[1:])
mean = sum(f * r for f, r in zip(clocks, states)) / active if clocks and active else 0
print(json.dumps({'gpu_w': watts.get('GPU Energy', 0), 'cpu_w': watts.get('CPU Energy', 0), 'dram_w': watts.get('DRAM', 0),
                  'gpu_active': active / total, 'gpu_mhz': mean}))
