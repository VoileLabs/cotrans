import './prefight'

import { throttle } from '@solid-primitives/scheduled'
import { createRoot } from 'solid-js'
import { DelegatedEvents } from 'solid-js/web'
import { changeLangEl } from './i18n'
import { storageReady } from './utils/storage'

// https://github.com/solidjs/solid/issues/334#issuecomment-773807937
DelegatedEvents.clear()

export interface TranslatorInstance {
  canKeep?: (url: string) => unknown
  onURLChange?: (url: string) => unknown
}
export interface Translator {
  match: (url: URL) => unknown
  mount: () => TranslatorInstance
}

export interface SettingsInjectorInstance {
  canKeep?: (url: string) => unknown
  onURLChange?: (url: string) => unknown
}
export interface SettingsInjector {
  match: (url: URL) => unknown
  mount: () => SettingsInjectorInstance
}

type ScopedInstance<T> = Omit<T, 'dispose'> & {
  dispose: () => void
}

function createScopedInstance<T>(cb: () => T): ScopedInstance<T> {
  return createRoot((dispose) => {
    const instance = cb()
    return {
      ...instance,
      dispose,
    }
  })
}

let currentURL: string | undefined
let translator: ScopedInstance<TranslatorInstance> | undefined
let settingsInjector: ScopedInstance<SettingsInjectorInstance> | undefined

export async function start(translators: Translator[], settingsInjectors: SettingsInjector[]) {
  await storageReady

  async function onUpdate() {
    await new Promise<void>(resolve => (queueMicrotask ?? setTimeout)(resolve))

    if (currentURL !== location.href) {
      currentURL = location.href

      // there is a navigation in the page

      // update i18n element
      changeLangEl(document.documentElement as HTMLHtmlElement)

      // update translator
      // only if the translator needs to be updated
      if (translator?.canKeep?.(currentURL)) {
        translator.onURLChange?.(currentURL)
      }
      else {
        // unmount previous translator
        translator?.dispose()
        translator = undefined

        // check if the page is a image page
        const url = new URL(location.href)

        // find the first translator that matches the url
        const matched = translators.find(t => t.match(url))
        if (matched)
          translator = createScopedInstance(matched.mount)
      }

      /* update settings page */
      if (settingsInjector?.canKeep?.(currentURL)) {
        settingsInjector.onURLChange?.(currentURL)
      }
      else {
        // unmount previous settings injector
        settingsInjector?.dispose()
        settingsInjector = undefined

        // check if the page is a settings page
        const url = new URL(location.href)

        // find the first settings injector that matches the url
        const matched = settingsInjectors.find(t => t.match(url))
        if (matched)
          settingsInjector = createScopedInstance(matched.mount)
      }
    }
  }

  if (window.onurlchange === null) {
    window.addEventListener('urlchange', onUpdate)
  }
  else {
    const installObserver = new MutationObserver(throttle(onUpdate, 200))
    installObserver.observe(document.body, { childList: true, subtree: true })
  }
  onUpdate()
}
