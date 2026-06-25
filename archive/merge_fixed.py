import json, os, glob
base = r'C:\Users\BOSS\demos'
merged = {"map": "de_dust2", "players": []}
players = {}
for tf in glob.glob(os.path.join(base, 'temp_reparse_*.json')):
    print(f'Loading {os.path.basename(tf)[:60]}...')
    with open(tf, encoding='utf-8') as f:
        data = json.load(f)
    for p in data.get('players', []):
        sid = p['steam_id']
        if sid in players:
            players[sid]['matches'].extend(p['matches'])
            if p['name'] and len(p['name']) > len(players[sid].get('name','')):
                players[sid]['name'] = p['name']
        else:
            players[sid] = p
merged['players'] = list(players.values())
with open(os.path.join(base, 'scout_data.json'), 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)
for p in merged['players']:
    m = len(p['matches'])
    if m >= 2:
        teams = set(mt.get('team','?') for mt in p['matches'])
        print(f'  {p["name"]}: {m} matches teams={teams}')
print(f'Total: {len(merged["players"])} players')
