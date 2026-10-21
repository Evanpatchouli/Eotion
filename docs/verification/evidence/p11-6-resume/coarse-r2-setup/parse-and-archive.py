from pathlib import Path
from zipfile import ZipFile
from datetime import datetime, timezone
import json, hashlib

source=Path('C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d/final-web-r2/product')
failure=source/'test-results/product-database-P11-5-coa-62442-the-native-Timeline-surface'
target=Path(__file__).parent
entries=[]
def copy_bytes(origin,destination,snapshot=False):
    raw=origin.read_bytes()
    destination=target/destination
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_bytes(raw)
    sha=hashlib.sha256(raw).hexdigest()
    assert hashlib.sha256(destination.read_bytes()).hexdigest()==sha
    entries.append({'source':str(origin),'destination':str(destination.relative_to(target)),'bytes':len(raw),'sha256':sha,'inProgressLogSnapshot':snapshot})
for name in ['trace.zip','test-failed-1.png','error-context.md']:
    copy_bytes(failure/name,'failure/'+name)
copy_bytes(source/'command.json','command.json')
for name in ['stdout.log','stderr.log']:
    copy_bytes(source/name,name.replace('.log','.in-progress-snapshot.log'),True)
with ZipFile(failure/'trace.zip') as archive:
    test=[json.loads(line) for line in archive.read('test.trace').decode().splitlines()]
    browser=[json.loads(line) for line in archive.read('1-trace.trace').decode().splitlines()]
    network=[json.loads(line) for line in archive.read('1-trace.network').decode().splitlines()]
    api=[row for row in test if row.get('callId') in ['pw:api@54','expect@55','pw:api@56','pw:api@58','expect@59','pw:api@60','pw:api@61','hook@62']]
    calls=[row for row in browser if row.get('callId') in ['call@9084','call@9086','call@9088','call@9090'] and row.get('type') in ['before','after','log']]
    snapshots=[row['snapshot'] for row in browser if row.get('type')=='frame-snapshot' and 775690 < row['snapshot']['timestamp'] < 780860]
    api_network=[]
    for row in network:
        if row.get('type')!='resource-snapshot':continue
        value=row['snapshot']
        if '/api/' in value.get('request',{}).get('url',''):
            api_network.append({'time':value.get('_monotonicTime'),'method':value['request'].get('method'),'url':value['request'].get('url'),'status':value.get('response',{}).get('status')})
    (target/'trace-selected-actions.json').write_text(json.dumps({'testActions':api,'browserCalls':calls,'snapshots':snapshots,'apiNetwork':api_network},ensure_ascii=False,indent=2),encoding='utf-8')
for name in ['trace-selected-actions.json','implementation-brief.md','proposed-setup.patch','parse-and-archive.py']:
    raw=(target/name).read_bytes()
    entries.append({'source':'derived/local '+name,'destination':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'derived':True})
manifest={'createdAtUtc':datetime.now(timezone.utc).isoformat(),'notes':['Raw failure artifacts copied byte-for-byte; derived trace-selected-actions.json is a read-only parsing convenience. trace.zip remains authoritative.','R2 Product run was still active when log bytes were captured. *.in-progress-snapshot.log are explicitly partial snapshots and must not be presented as final complete run logs.','This failure occurs before trial tap/390 viewport loop/native scroll; it is distinct from the previous scrollLeft=8074 failure and provides no evidence of a trial-tap regression.','stdout and stderr sources were captured separately; no reconstruction or editing of original logs.'],'files':entries}
(target/'copy-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'files':len(entries),'bytes':sum(item['bytes'] for item in entries)}))
