import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "../package.json";

export default defineManifest({
  manifest_version: 3,
  name: "taplink",
  version: packageJson.version,
  description:
    "Prefetches same-origin links when they become visible or look likely to be tapped next.",
  icons: {
    16: "icon-16.png",
    32: "icon-32.png",
    48: "icon-48.png",
    128: "icon-128.png",
  },
  action: {
    default_title: "taplink",
    default_icon: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      run_at: "document_idle",
      js: ["src/content.ts"],
    },
  ],
});
