import json, zipfile
from pathlib import Path
root=Path('C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d/sync-startup-probe')
output=[]
for phase in ['executed/current-single','baseline-executed/baseline-single']:
 for path in (root/phase/'test-results').glob('*/trace.zip'):
  with zipfile.ZipFile(path) as archive:
   for name in archive.namelist():
    if name.endswith('.trace'):
     for line in archive.read(name).decode('utf8').splitlines():
      event=json.loads(line)
      if event.get('type')=='context-options':
       output.append({'phase':phase,'trace':str(path),'metadata':event})
       break
(root/'baseline'/'runtime-comparison.json').write_text(json.dumps(output,indent=2),encoding='utf8')
print(json.dumps(output))
