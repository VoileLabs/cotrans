import type { MaybeAccessor } from '@solid-primitives/utils'
import { access } from '@solid-primitives/utils'
import type { Accessor } from 'solid-js'
import { createMemo, createSignal } from 'solid-js'
import { scriptLang } from '../utils/storage'

import zhCN from './zh-CN.yml'
import enUS from './en-US.yml'

const messages: Record<string, any> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

function tryMatchLang(lang: string): string {
  if (lang.startsWith('zh'))
    return 'zh-CN'
  if (lang.startsWith('en'))
    return 'en-US'
  return 'en-US'
}

export const [realLang, setRealLang] = createSignal(navigator.language)
export const lang = createMemo(() => scriptLang() || tryMatchLang(realLang()))

export const t = (key_: MaybeAccessor<string>, props: MaybeAccessor<Record<string, MaybeAccessor<unknown>>> = {}): Accessor<string> =>
  createMemo(() => {
    const key = access(key_)
    const segments = key.split('.')
    const msg: string = segments.reduce((obj, k) => obj[k], messages[lang()]) ?? segments.reduce((obj, k) => obj[k], messages['zh-CN'])
    if (!msg)
      return key
    return msg.replace(/\{([^}]+)\}/g, (_, k) => String(access(access(props)[k])) ?? '')
  })

let langEL: HTMLHtmlElement | undefined
let langObserver: MutationObserver | undefined

export const changeLangEl = (el: HTMLHtmlElement) => {
  if (langEL === el)
    return

  if (langObserver)
    langObserver.disconnect()

  langObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'lang') {
        const target = mutation.target as HTMLHtmlElement
        if (target.lang)
          setRealLang(target.lang)
        break
      }
    }
  })
  langObserver.observe(el, { attributes: true })

  langEL = el
  setRealLang(el.lang)
}

export function BCP47ToISO639(code: string): string {
  try {
    const lo = new Intl.Locale(code)
    switch (lo.language) {
      case 'zh': {
        switch (lo.script) {
          case 'Hans':
            return 'CHS'
          case 'Hant':
            return 'CHT'
        }
        switch (lo.region) {
          case 'CN':
            return 'CHS'
          case 'HK':
          case 'TW':
            return 'CHT'
        }
        return 'CHS'
      }
      case 'ja':
        return 'JPN'
      case 'en':
        return 'ENG'
      case 'ko':
        return 'KOR'
      case 'vi':
        return 'VIE'
      case 'cs':
        return 'CSY'
      case 'nl':
        return 'NLD'
      case 'fr':
        return 'FRA'
      case 'de':
        return 'DEU'
      case 'hu':
        return 'HUN'
      case 'it':
        return 'ITA'
      case 'pl':
        return 'PLK'
      case 'pt':
        return 'PTB'
      case 'ro':
        return 'ROM'
      case 'ru':
        return 'RUS'
      case 'es':
        return 'ESP'
      case 'tr':
        return 'TRK'
      case 'uk':
        return 'UKR'
    }
    return 'ENG'
  }
  catch (e) {
    return 'ENG'
  }
}
