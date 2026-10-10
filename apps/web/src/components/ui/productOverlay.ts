export type ProductLayoutMode = 'desktop' | 'tablet' | 'mobile'
export type ProductOverlayMode = 'drawer' | 'right-drawer' | 'bottom-drawer' | 'modal' | 'page'
export type DeviceOpeningConfig = {
  desktop: 'drawer' | 'modal' | 'page'
  tablet: 'drawer' | 'modal' | 'page'
  mobile: 'right-drawer' | 'bottom-drawer' | 'modal' | 'page'
}

export const defaultDeviceOpeningConfig: Readonly<DeviceOpeningConfig> = Object.freeze({
  desktop: 'drawer',
  tablet: 'drawer',
  mobile: 'bottom-drawer',
})

export const openingOptions: Readonly<Record<ProductLayoutMode, readonly ProductOverlayMode[]>> = Object.freeze({
  desktop: ['drawer', 'modal', 'page'],
  tablet: ['drawer', 'modal', 'page'],
  mobile: ['right-drawer', 'bottom-drawer', 'modal', 'page'],
})

export function isOpeningMode(layout: ProductLayoutMode, mode: unknown): mode is ProductOverlayMode {
  return openingOptions[layout].includes(mode as ProductOverlayMode)
}

export function normalizeOpeningConfig(value: unknown): DeviceOpeningConfig {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    desktop: isOpeningMode('desktop', candidate.desktop) ? candidate.desktop as DeviceOpeningConfig['desktop'] : defaultDeviceOpeningConfig.desktop,
    tablet: isOpeningMode('tablet', candidate.tablet) ? candidate.tablet as DeviceOpeningConfig['tablet'] : defaultDeviceOpeningConfig.tablet,
    mobile: isOpeningMode('mobile', candidate.mobile) ? candidate.mobile as DeviceOpeningConfig['mobile'] : defaultDeviceOpeningConfig.mobile,
  }
}

export function resolveOpeningMode(config: DeviceOpeningConfig, layout: ProductLayoutMode): ProductOverlayMode {
  return isOpeningMode(layout, config[layout]) ? config[layout] : defaultDeviceOpeningConfig[layout]
}
