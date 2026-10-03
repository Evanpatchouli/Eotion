import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { pluginQRCode } from "@lynx-js/qrcode-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";
import { pluginVueLynx } from "vue-lynx/plugin";

import { getEotionBuildInfo } from "../../scripts/build-info.mjs";

loadDotenv({ path: fileURLToPath(new URL("./.env", import.meta.url)) });

function getLanIPv4(): string | undefined {
  const preferredInterface =
    /^(wi-?fi|wlan|ethernet|eth\d+|en\d+|eno\d+|ens\d+|wlp|wlx)/i;
  const virtualInterface =
    /(virtual|vmware|virtualbox|hyper-v|vEthernet|wsl|docker|podman|tailscale|zerotier|wireguard|vpn|bridge)/i;
  const candidates = Object.entries(networkInterfaces()).flatMap(
    ([name, addresses]) => {
      if (virtualInterface.test(name)) return [];

      return (addresses ?? [])
        .filter(({ address, family, internal }) => {
          if (internal || family !== "IPv4") return false;

          const octets = address.split(".").map(Number);
          const [first, second] = octets;
          return (
            first === 10 ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168)
          );
        })
        .map(({ address }) => ({
          address,
          preferred: preferredInterface.test(name),
        }));
    },
  );

  candidates.sort(
    (left, right) => Number(right.preferred) - Number(left.preferred),
  );
  return candidates[0]?.address;
}

const buildInfo = getEotionBuildInfo();
const configuredWebUrl = process.env.EOTION_WEB_URL?.trim();
const isProduction = process.env.NODE_ENV === "production";
const lanIPv4 = isProduction ? undefined : getLanIPv4();
const eotionWebUrl =
  configuredWebUrl || (isProduction
    ? "https://eotion.evanpatchouli.space"
    : `http://${lanIPv4 ?? "127.0.0.1"}:7173`);

const parsedWebUrl = new URL(eotionWebUrl);
if (!["http:", "https:"].includes(parsedWebUrl.protocol) || parsedWebUrl.username || parsedWebUrl.password) {
  throw new Error("EOTION_WEB_URL must be an HTTP(S) URL without credentials.");
}

if (!isProduction && !configuredWebUrl && !lanIPv4) {
  console.warn(
    "[mobile] No LAN IPv4 found; EOTION_WEB_URL defaults to http://127.0.0.1:7173.",
  );
}

export default defineConfig({
  environments: {
    lynx: {},
    web: {},
  },
  source: {
    define: {
      __EOTION_WEB_URL__: JSON.stringify(eotionWebUrl),
      __EOTION_WEBVIEW_DEBUG__: JSON.stringify(!isProduction),
      __EOTION_VERSION__: JSON.stringify(buildInfo.version),
      __EOTION_BUILD_NUMBER__: JSON.stringify(buildInfo.buildNumber),
      __EOTION_GIT_SHA__: JSON.stringify(buildInfo.gitSha),
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
        return `${url}?fullscreen=true`;
      },
    }),
    pluginVueLynx({
      optionsApi: false,
      enableCSSInlineVariables: true,
      enableCSSInheritance: true,
    }),
  ],
});
