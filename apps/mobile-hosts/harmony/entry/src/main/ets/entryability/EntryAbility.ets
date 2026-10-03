import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { LynxEnv } from '@lynx/lynx';

const DOMAIN = 0xE071;
const TAG = 'EotionHost';

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, 'onCreate: initializing Lynx runtime');
    LynxEnv.initialize(this.context);
    hilog.info(DOMAIN, TAG, 'onCreate: Lynx runtime initialized');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    AppStorage.setOrCreate('lynxWindowStage', windowStage);
    hilog.info(DOMAIN, TAG, 'onWindowStageCreate: loading pages/Index');
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(error));
      } else {
        hilog.info(DOMAIN, TAG, 'onWindowStageCreate: pages/Index loaded');
      }
    });
  }
}
