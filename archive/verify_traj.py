import json

with open(r'C:\Users\BOSS\demos\temp_traj_9213557739766665228_0.json', encoding='utf-8') as f:
    data = json.load(f)

p = data['players'][0]
total_s = total_h = total_f = 0
for mi, m in enumerate(p['matches']):
    for ri, r in enumerate(m['rounds']):
        s = len(r.get('smokes') or [])
        h = len(r.get('hes') or [])
        f = len(r.get('flashes') or [])
        if s or h or f:
            total_s += s; total_h += h; total_f += f
            if total_s <= 3:
                print("Match%d Round%d: smokes=%d hes=%d flashes=%d" % (mi, ri, s, h, f))
                for sm in (r.get('smokes') or [])[:1]:
                    print("  Smoke keys:", list(sm.keys()))
                    t = sm.get('trajectory', [])
                    print("  trajectory: %d pts" % len(t))
                    for pt in t[:3]:
                        print("    tick=%d x=%.0f y=%.0f" % (pt['tick'], pt['x'], pt['y']))

print("Total: %d smokes, %d hes, %d flashes" % (total_s, total_h, total_f))
