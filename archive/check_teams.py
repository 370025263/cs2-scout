import json
with open(r'C:\Users\BOSS\demos\scout_data.json', encoding='utf-8') as f:
    data = json.load(f)
for p in data['players']:
    if 'stone' in p.get('name','').lower():
        print(f'{p["name"]} (steam={p["steam_id"]})')
        for i, m in enumerate(p['matches']):
            team = m.get('team','?')
            rounds = len(m.get('rounds',[]))
            r0 = m['rounds'][0] if rounds>0 else {}
            n_pos = len(r0.get('positions',[]))
            first_pos = r0['positions'][0] if n_pos>0 else None
            spawn_zone = ''
            if first_pos:
                x, y = first_pos['x'], first_pos['y']
                if y > 2000: spawn_zone = 'T-spawn-area'
                elif y < -500: spawn_zone = 'CT-spawn-area'
                else: spawn_zone = 'mid'
            print(f'  Match {i}: team={team} rounds={rounds} spawn={spawn_zone} ({first_pos["x"]:.0f},{first_pos["y"]:.0f})' if first_pos else f'  Match {i}: team={team} rounds={rounds}')
# Also check a known T player from match 1
print()
for p in data['players']:
    if '2167889059' in str(p.get('steam_id','')):
        print(f'{p["name"]}:')
        for i,m in enumerate(p['matches']):
            r0=m['rounds'][0] if m.get('rounds') else {}
            fp=r0['positions'][0] if r0.get('positions') else None
            print(f'  Match {i}: team={m.get("team","?")} spawn=({fp["x"]:.0f},{fp["y"]:.0f})' if fp else f'  Match {i}: team={m.get("team","?")}')
