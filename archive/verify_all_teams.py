"""Verify ALL team assignments in scout_data.json using spawn positions."""
import json

with open(r'C:\Users\BOSS\demos\scout_data.json', encoding='utf-8') as f:
    data = json.load(f)

correct = 0
mismatches = []

for p in data['players']:
    for i, m in enumerate(p['matches']):
        if not m.get('rounds'): continue
        r0 = m['rounds'][0]
        positions = r0.get('positions', [])
        if not positions: continue

        x, y = positions[0]['x'], positions[0]['y']
        team = m.get('team', '?')

        # de_dust2: CT spawn y < -400, T spawn y > 1500
        if y < -400:
            real_team = 'CT'
        elif y > 1500:
            real_team = 'T'
        else:
            real_team = 'MID'

        if real_team == 'MID':
            mismatches.append(f'MID: {p["name"]} team={team} spawn y={y:.0f}')
        elif team != real_team:
            mismatches.append(f'MISMATCH: {p["name"]} match {i} team={team} but spawn={real_team}-area ({x:.0f},{y:.0f})')
        else:
            correct += 1

print(f"✓ Correct: {correct}")
print(f"✗ Mismatches: {len(mismatches)}")
for m in mismatches:
    print(f"  {m}")

total = correct + len(mismatches)
print(f"\nTotal: {total} match-entries checked")
print(f"Accuracy: {100*correct/total:.1f}%" if total > 0 else "N/A")
