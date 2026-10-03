import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Behavior, BehaviorRegistryMap, LynxView, LynxViewClient } from '@lynx/lynx';
import { UIWebView } from '@lynx/xelement_webview';
import { EotionTemplateResourceFetcher } from '../provider/EotionTemplateResourceFetcher';
import { EotionViewClient } from '../provider/EotionViewClient';

const DOMAIN = 0xE071;
const TAG = 'EotionHost';

@Entry
@Component
struct Index {
  @State private templateResourceFetcher: EotionTemplateResourceFetcher | undefined = undefined;
  private readonly behaviors: BehaviorRegistryMap = new Map([
    ['webview', new Behavior(UIWebView, undefined)],
  ]);
  private readonly clients: LynxViewClient[] = [new EotionViewClient()];

  aboutToAppear(): void {
    hilog.info(DOMAIN, TAG, 'Index.aboutToAppear: creating template fetcher');
    this.templateResourceFetcher = new EotionTemplateResourceFetcher(
      getContext(this) as common.UIAbilityContext,
    );
  }

  build() {
    if (this.templateResourceFetcher) {
      LynxView({
        url: 'main.lynx.bundle',
        templateResourceFetcher: this.templateResourceFetcher,
        behaviors: this.behaviors,
        clients: this.clients,
      })
        .width('100%')
        .height('100%');
    }
  }
}
