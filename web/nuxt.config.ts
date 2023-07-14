// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  ssr: false,

  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    'nuxt-headlessui',
  ],

  typescript: {
    strict: true,
  },

  runtimeConfig: {
    public: {
      apiBase: 'https://api.cotrans.touhou.ai',
      wsBase: 'wss://api.cotrans.touhou.ai',
    },
  },

  unocss: {
    preflight: true,
    uno: true,
    icons: {
      scale: 1.2,
      extraProperties: {
        'color': 'inherit',
        // Avoid crushing of icons in crowded situations
        'min-width': '1.2em',
      },
    },
    webFonts: {
      provider: 'google',
      fonts: {
        quicksand: 'Quicksand:300,400,500,600,700',
      },
    },
    shortcuts: [
      [
        'nav-link',
        [
          'absolute',
          'content-empty',
          'left-0',
          'bottom-0',
          'w-full',
          'h-px',
          'opacity-0',
          'bg-gradient-to-r',
          'from-fuchsia-600',
          'to-pink-600',
          'transform',
          '-translate-y-1',
          'transition-all',
          'ease-out',
          'hover:opacity-60',
          'hover:translate-y-0',
        ]
          .map(c => `after:${c}`)
          .concat([
            'relative',
          ])
          .join(' '),
      ],
    ],
  },

  headlessui: {
    prefix: 'H',
  },
})
