"""Fix team assignment in scout_data.json using spawn position heuristics."""
import json, os

path = r'C:\Users\BOSS\demos\scout_data.json'
with open(path, encoding='utf-8') as f:
    data = json.load(f)

fixed = 0
for p in data['players']:
    for m in p['matches']:
        # Get first position from first round
        if not m.get('rounds'): continue
        r0 = m['rounds'][0]
        positions = r0.get('positions', [])
        if not positions: continue
        x, y = positions[0]['x'], positions[0]['y']
        # de_dust2: CT spawn area Y > 2000, T spawn area Y < -400
        # Other maps: CT generally at higher Y
        real_team = 'CT' if y > 1500 else ('T' if y < -400 else None)
        if real_team and m.get('team') != real_team:
            m['team'] = real_team
            fixed += 1
            print(f'Fixed {p["name"]}: {m.get("demo_file","?")[:20]} -> {real_team} (spawn y={y:.0f})')

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f'Fixed {fixed} team assignments')
