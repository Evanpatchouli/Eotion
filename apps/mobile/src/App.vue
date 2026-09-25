<script setup lang="ts">
import {
  isMobileStorageRequest,
  MOBILE_P1_CHANNEL,
  type MobileP1Ping,
  type MobileP1Pong,
  type MobileStorageUnavailableResponse,
} from '@eotion/contracts'

import { EOTION_WEB_URL } from './config.js'

type WebviewMessageEvent = { detail?: { msg?: unknown }; msg?: unknown }

function onWebMessage(event: WebviewMessageEvent) {
  const raw = event.detail?.msg ?? event.msg
  if (typeof raw !== 'string') return

  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return
  }

  if (isMobileStorageRequest(message)) {
    const response: MobileStorageUnavailableResponse = {
      channel: message.channel,
      kind: 'response',
      id: message.id,
      method: message.method,
      ok: false,
      error: {
        code: 'unavailable',
        message: 'Mobile local storage is unavailable: this Lynx shell has no registered native storage module.',
      },
    }

    lynx.createSelectorQuery()
      .select('#eotion-webview')
      .invoke({
        method: 'eval',
        params: {
          func: `window.__eotionMobileStorageReceive?.(${JSON.stringify(response)})`,
        },
        success: () => console.info('[mobile] storage unavailable response sent', response.id),
        fail: (error: unknown) => console.warn('[mobile] storage response delivery failed', error),
      })
      .exec()
    return
  }

  if (!message || typeof message !== 'object') return
  const candidate = message as Partial<MobileP1Ping>
  if (
    candidate.channel !== MOBILE_P1_CHANNEL ||
    candidate.kind !== 'ping' ||
    typeof candidate.id !== 'string' ||
    candidate.id.length > 128 ||
    typeof candidate.sentAt !== 'number'
  ) return

  console.info('[mobile] P1 ping received', candidate.id)
  const pong: MobileP1Pong = {
    channel: MOBILE_P1_CHANNEL,
    kind: 'pong',
    id: candidate.id,
    sentAt: candidate.sentAt,
    receivedAt: Date.now(),
  }

  lynx.createSelectorQuery()
    .select('#eotion-webview')
    .invoke({
      method: 'eval',
      params: {
        func: `window.__eotionMobileP1Receive?.(${JSON.stringify(pong)})`,
      },
      success: () => console.info('[mobile] P1 pong sent', pong.id),
      fail: (error: unknown) => console.warn('[mobile] P1 pong delivery failed', error),
    })
    .exec()
}
</script>

<template>
  <view class="mobile-shell">
    <webview
      id="eotion-webview"
      class="eotion-webview"
      :src="EOTION_WEB_URL"
      :enable-debug="true"
      @message="onWebMessage"
    />
  </view>
</template>
