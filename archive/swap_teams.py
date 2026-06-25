with open(r'C:\Users\BOSS\demos\parse\main_multi.go', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('TeamTerrorists:', 'TeamTerrorists_OLD:')
content = content.replace('TeamCounterTerrorists:', 'TeamTerrorists:')
content = content.replace('TeamTerrorists_OLD:', 'TeamCounterTerrorists:')
with open(r'C:\Users\BOSS\demos\parse\main_multi.go', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done - swapped T/CT in parser')
