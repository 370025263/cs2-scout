import json

with open(r'C:\Users\BOSS\demos\scout_data.json', encoding='utf-8') as f:
    data = json.load(f)

p = data['players'][0]
m = p['matches'][0]
r = m['rounds'][0]

# Find first round with smokes
for mi, m in enumerate(p['matches']):
    for ri, r in enumerate(m['rounds']):
        if r.get('smokes') and len(r['smokes']) > 0:
            s = r['smokes'][0]
            print("=== SMOKE data fields ===")
            for k, v in s.items():
                if isinstance(v, list):
                    print(f"  {k}: list[{len(v)}]")
                    if v and len(v) > 0:
                        print(f"    first: {v[0]}")
                        if len(v) > 1:
                            print(f"    last: {v[-1]}")
                else:
                    print(f"  {k}: {v}")
            print()
            break
    else:
        continue
    break

# Find first round with HEs
for mi, m in enumerate(p['matches']):
    for ri, r in enumerate(m['rounds']):
        if r.get('hes') and len(r['hes']) > 0:
            h = r['hes'][0]
            print("=== HE data fields ===")
            for k, v in h.items():
                if isinstance(v, list):
                    print(f"  {k}: list[{len(v)}]")
                    if v and len(v) > 0:
                        print(f"    first: {v[0]}")
                else:
                    print(f"  {k}: {v}")
            print()
            break
    else:
        continue
    break

# Find first round with flashes
for mi, m in enumerate(p['matches']):
    for ri, r in enumerate(m['rounds']):
        if r.get('flashes') and len(r['flashes']) > 0:
            f = r['flashes'][0]
            print("=== FLASH data fields ===")
            for k, v in f.items():
                if isinstance(v, list):
                    print(f"  {k}: list[{len(v)}]")
                    if v and len(v) > 0:
                        print(f"    first: {v[0]}")
                else:
                    print(f"  {k}: {v}")
            print()
            break
    else:
        continue
    break

# Check round keys
r0 = p['matches'][0]['rounds'][0]
print("=== Round 0 keys ===")
print(list(r0.keys()))

# Check if smokes have paths/trajectory
print()
print("=== Looking for trajectory/path fields ===")
for mi, m in enumerate(p['matches']):
    for ri, r in enumerate(m['rounds']):
        if r.get('smokes'):
            for si, s in enumerate(r['smokes']):
                unknown = [k for k in s.keys() if k not in ['tick','throw_x','throw_y','land_x','land_y']]
                if unknown:
                    print(f"Match{mi} Round{ri} Smoke{si}: extra fields = {unknown}")
                    for uk in unknown:
                        v = s[uk]
                        if isinstance(v, list):
                            print(f"  {uk}: list[{len(v)}] sample: {v[:2]}")
                        else:
                            print(f"  {uk}: {v}")
        if r.get('hes'):
            for hi, h in enumerate(r['hes']):
                unknown = [k for k in h.keys() if k not in ['tick','throw_x','throw_y']]
                if unknown:
                    print(f"Match{mi} Round{ri} HE{hi}: extra fields = {unknown}")
                    for uk in unknown:
                        v = h[uk]
                        if isinstance(v, list):
                            print(f"  {uk}: list[{len(v)}] sample: {v[:3]}")
                        else:
                            print(f"  {uk}: {v}")
        if r.get('flashes'):
            for fi, f in enumerate(r['flashes']):
                unknown = [k for k in f.keys() if k not in ['tick','throw_x','throw_y']]
                if unknown:
                    print(f"Match{mi} Round{ri} Flash{fi}: extra fields = {unknown}")
                    for uk in unknown:
                        v = f[uk]
                        if isinstance(v, list):
                            print(f"  {uk}: list[{len(v)}] sample: {v[:3]}")
                        else:
                            print(f"  {uk}: {v}")
    if mi >= 1:
        break
