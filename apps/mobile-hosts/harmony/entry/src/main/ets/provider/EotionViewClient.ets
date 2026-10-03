import { hilog } from '@kit.PerformanceAnalysisKit';
import {
  LynxContext,
  LynxError,
  LynxPipelineInfo,
  LynxViewClient,
} from '@lynx/lynx';

const DOMAIN = 0xE071;
const TAG = 'EotionHost';

export class EotionViewClient extends LynxViewClient {
  onPageStarted(_lynxContext: LynxContext, _pipelineInfo: LynxPipelineInfo): void {
    hilog.info(DOMAIN, TAG, 'Lynx onPageStarted');
  }

  onLoadSuccess(url: string): void {
    hilog.info(DOMAIN, TAG, 'Lynx onLoadSuccess: %{public}s', url);
  }

  onFirstScreen(): void {
    hilog.info(DOMAIN, TAG, 'Lynx onFirstScreen');
  }

  onRuntimeReady(): void {
    hilog.info(DOMAIN, TAG, 'Lynx onRuntimeReady');
  }

  onReceivedError(error: LynxError): void {
    hilog.error(DOMAIN, TAG, 'Lynx onReceivedError: %{public}d %{public}s', error.getErrorCode(), error.getSummaryMessage());
  }
}
