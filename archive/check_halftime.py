import json
with open(r'C:\Users\BOSS\demos\scout_data.json', encoding='utf-8') as f:
    data = json.load(f)

for p in data['players']:
    if 'stone' in p.get('name','').lower():
        for mi, m in enumerate(p['matches']):
            print(f"Match {mi}: team={m['team']}, {len(m['rounds'])} rounds")
            # First 3 rounds - should be CT spawn area
            for ri in range(min(3, len(m['rounds']))):
                r = m['rounds'][ri]
                y0 = r['positions'][0]['y'] if r.get('positions') else None
                print(f"  Round {ri+1}: spawn y={y0:.0f}")
            # Rounds 12-15 - halftime switch!
            for ri in [11, 12, 13, 14]:
                if ri < len(m['rounds']):
                    r = m['rounds'][ri]
                    y0 = r['positions'][0]['y'] if r.get('positions') else None
                    print(f"  Round {ri+1}: spawn y={y0:.0f}")
        break

print()
for p in data['players']:
    if p.get('name') == '准星之下无活物-':
        for mi, m in enumerate(p['matches'][:1]):
            print(f"{p['name']}: team={m['team']}, {len(m['rounds'])} rounds")
            for ri in range(min(3, len(m['rounds']))):
                r = m['rounds'][ri]
                y0 = r['positions'][0]['y'] if r.get('positions') else None
                print(f"  Round {ri+1}: spawn y={y0:.0f}")
            for ri in [11, 12, 13, 14]:
                if ri < len(m['rounds']):
                    r = m['rounds'][ri]
                    y0 = r['positions'][0]['y'] if r.get('positions') else None
                    print(f"  Round {ri+1}: spawn y={y0:.0f}")
        break
