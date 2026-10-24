import json, subprocess, sys, os, time
os.chdir(os.path.dirname(os.path.abspath(__file__)))
B = "/Applications/Blender.app/Contents/MacOS/Blender"
items = json.load(open("items.json"))
only = set(sys.argv[1:])
for it in items:
    if only and it["id"] not in only: continue
    out = os.path.abspath(f"glb/{it['id']}.glb")
    t = time.time()
    try:
        r = subprocess.run([B, "-b", "--factory-startup", "-P", "export.py", "--", json.dumps(it), out], capture_output=True, text=True, errors="replace", timeout=1500)
        rep = next((l[7:] for l in r.stdout.splitlines() if l.startswith("REPORT:")), None)
    except subprocess.TimeoutExpired:
        rep = None; r = None
    size = os.path.getsize(out) / 1e6 if os.path.exists(out) else 0
    print(f"{it['id']:16} {size:6.2f} MB {time.time()-t:5.0f}s {rep}", flush=True)
    if not rep and r is not None:
        errs = [l for l in (r.stdout + r.stderr).splitlines() if "Error" in l or "Traceback" in l or "error" in l.lower()]
        print("   ", errs[-5:], flush=True)
