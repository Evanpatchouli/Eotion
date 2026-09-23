export {}

declare global {
  interface Window {
    eotionDesktop?: {
      platform: string
      versions: {
        electron: string
        chrome: string
        node: string
      }
    }
  }
}
