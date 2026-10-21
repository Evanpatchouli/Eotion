from pathlib import Path
import subprocess, json, hashlib
workspace=Path('C:/Users/31250/Work/Eotion')
baseline=Path('C:/Users/31250/AppData/Local/Temp/eotion-p116-c91e3284da1d43a4a12362d3f2d4e690/baseline-overlay')
target=Path(__file__).parent
commit='ff0901c7545c9bc1addad9114cc1d41492a52eb3'
files=['apps/web/src/components/editor/DatabaseTimelineView.vue','apps/web/src/components/editor/timeline/TimelineViewport.vue','apps/web/src/components/editor/timeline/useTimelineViewport.ts','apps/web/tests/product-database.spec.ts']
report=[]
for name in files:
    original=subprocess.check_output(['git','show',commit+':'+name],cwd=workspace)
    archived=(baseline/name).read_bytes()
    normalized=lambda b:b.replace(b'\r\n',b'\n')
    entry={'path':name,'gitSha256':hashlib.sha256(original).hexdigest(),'baselineSha256':hashlib.sha256(archived).hexdigest(),'exactEqual':original==archived,'normalizedLfEqual':normalized(original)==normalized(archived)}
    report.append(entry)
    assert entry['normalizedLfEqual'], name
(target/'source-verification.json').write_text(json.dumps({'commit':commit,'baselineRoot':str(baseline),'files':report},indent=2),encoding='utf-8')
source=(target.parent/'coarse-probe/prepare-minimal.py').read_text(encoding='utf-8')
source=source.replace("root = Path('C:/Users/31250/Work/Eotion')",'root = Path('+repr(str(baseline))+')')
source=source.replace("'http://127.0.0.1:7173'","'http://127.0.0.1:7176'")
(target/'prepare-geometry.py').write_text(source,encoding='utf-8')
exec(compile(source,str(target/'prepare-geometry.py'),'exec'),{'__file__':str(target/'prepare-geometry.py')})
original=(baseline/'apps/web/tests/product-database.spec.ts').read_text(encoding='utf-8')
for old,new in [('../src/components/editor/timeline/scale',(baseline/'apps/web/src/components/editor/timeline/scale').as_posix()),('../../../packages/domain/src/scheduling',(baseline/'packages/domain/src/scheduling').as_posix()),('./helpers/editorSelection',(baseline/'apps/web/tests/helpers/editorSelection').as_posix())]:
    original=original.replace("from '"+old+"'","from '"+new+"'")
(target/'product-database.original.spec.ts').write_text(original,encoding='utf-8')
(target/'playwright.original.config.ts').write_text("import { defineConfig } from '@playwright/test';\nexport default defineConfig({testDir:'.',testMatch:'*.original.spec.ts',timeout:30000,workers:1,retries:0,use:{baseURL:'http://127.0.0.1:7176',browserName:'chromium',channel:'chrome'}});\n",encoding='utf-8')
