import { AsyncCallback, BusinessError } from '@ohos.base';
import { hilog } from '@kit.PerformanceAnalysisKit';
import resourceManager from '@ohos.resourceManager';
import {
  LynxResourceRequest,
  LynxTemplateResourceFetcher,
  TemplateProviderResult,
} from '@lynx/lynx';
import { common } from '@kit.AbilityKit';

const DOMAIN = 0xE071;
const TAG = 'EotionHost';

export class EotionTemplateResourceFetcher extends LynxTemplateResourceFetcher {
  private readonly manager: resourceManager.ResourceManager;

  constructor(context: common.UIAbilityContext) {
    super();
    this.manager = context.resourceManager;
  }

  fetchTemplate(
    request: LynxResourceRequest,
    callback: AsyncCallback<TemplateProviderResult>,
  ): void {
    hilog.info(DOMAIN, TAG, 'fetchTemplate: %{public}s', request.url);
    this.manager.getRawFileContent(request.url, (error, data: Uint8Array) => {
      if (error) {
        hilog.error(DOMAIN, TAG, 'getRawFileContent failed: %{public}s', JSON.stringify(error));
        callback(error, { binary: new ArrayBuffer(0) });
        return;
      }

      const binary = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer;
      hilog.info(DOMAIN, TAG, 'fetchTemplate bytes: %{public}d', binary.byteLength);
      callback(error, { binary });
    });
  }

  fetchSSRData(
    request: LynxResourceRequest,
    callback: AsyncCallback<ArrayBuffer>,
  ): void {
    // The shared Vue Lynx shell does not use Lynx SSR; report it explicitly instead of a silent empty payload.
    const unsupported: BusinessError = {
      code: -1,
      name: 'EotionUnsupported',
      message: 'SSR data is not supported by the Eotion native host',
    };
    hilog.warn(DOMAIN, TAG, 'fetchSSRData unsupported: %{public}s', request.url);
    callback(unsupported, new ArrayBuffer(0));
  }
}
