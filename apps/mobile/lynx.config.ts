import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginVueLynx } from 'vue-lynx/plugin'

loadDotenv({ path: fileURLToPath(new URL('./.env', import.meta.url)) })

function getLanIPv4(): string | undefined {
  const preferredInterface = /^(wi-?fi|wlan|ethernet|eth\d+|en\d+|eno\d+|ens\d+|wlp|wlx)/i
  const virtualInterface = /(virtual|vmware|virtualbox|hyper-v|vEthernet|wsl|docker|podman|tailscale|zerotier|wireguard|vpn|bridge)/i
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) => {
    if (virtualInterface.test(name)) return []

    return (addresses ?? [])
      .filter(({ address, family, internal }) => {
        if (internal || family !== 'IPv4') return false

        const octets = address.split('.').map(Number)
        const [first, second] = octets
        return first === 10 ||
          (first === 172 && second >= 16 && second <= 31) ||
          (first === 192 && second === 168)
      })
      .map(({ address }) => ({ address, preferred: preferredInterface.test(name) }))
  })

  candidates.sort((left, right) => Number(right.preferred) - Number(left.preferred))
  return candidates[0]?.address
}

const configuredWebUrl = process.env.EOTION_WEB_URL?.trim()
const lanIPv4 = getLanIPv4()
const eotionWebUrl = configuredWebUrl || `http://${lanIPv4 ?? '127.0.0.1'}:5173`

if (!configuredWebUrl && !lanIPv4) {
  console.warn('[mobile] No LAN IPv4 found; EOTION_WEB_URL defaults to http://127.0.0.1:5173.')
}

export default defineConfig({
  environments: {
    lynx: {},
    web: {},
  },
  source: {
    define: {
      __EOTION_WEB_URL__: JSON.stringify(eotionWebUrl),
    },
  },
  tools: {
    rspack: {
      experiments: {
        layers: true,
      },
    },
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`
      },
    }),
    pluginVueLynx({
      optionsApi: false,
      enableCSSInlineVariables: true,
      enableCSSInheritance: true,
    }),
  ],
})
