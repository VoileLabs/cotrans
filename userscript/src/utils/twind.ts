import { dom, twind } from '@twind/core'
import presetAutoprefix from '@twind/preset-autoprefix'
import presetTailwind from '@twind/preset-tailwind'

export const tw = twind({
  preflight: false,
  hash: (className, defaultHash) => {
    return `tw-${defaultHash(className).slice(1)}`
  },
  presets: [
    presetAutoprefix(),
    presetTailwind({
      disablePreflight: true,
    }),
  ],
}, dom())
