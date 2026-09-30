export interface EotionBuildInfo {
  readonly version: string;
  readonly buildNumber: number;
  readonly gitSha: string;
}

export function getEotionBuildInfo(): Readonly<EotionBuildInfo>;
