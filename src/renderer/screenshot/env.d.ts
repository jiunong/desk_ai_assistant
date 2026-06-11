export type ScreenshotSendPayload = {
  dataUrl: string
  text?: string
}

export interface ScreenshotApi {
  complete: (bounds: { x: number; y: number; width: number; height: number }) => void
  send: (payload: ScreenshotSendPayload) => void
  cancel: () => void
  onPreview: (
    cb: (data: {
      dataUrl: string
      bounds: { x: number; y: number; width: number; height: number }
    }) => void
  ) => () => void
  onCapturing: (cb: () => void) => () => void
}

declare global {
  interface Window {
    screenshotApi: ScreenshotApi
  }
}

export {}
