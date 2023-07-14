import type { Accessor, Setter } from 'solid-js'
import { createEffect, createSignal, on, onCleanup } from 'solid-js'
import type {
  DetectResOption,
  KeepInstancesOption,
  RenderTextDirOption,
  ScriptLangOption,
  TargetLangOption,
  TextDetectorOption,
  TranslatorOption,
} from '../settings'

export type GMSignal<T> = [
  Accessor<T> & {
    ready: Promise<void>
    isReady: Accessor<boolean>
  },
  Setter<T | null | undefined>,
]

export function createGMSignal<T = string>(key: string): GMSignal<T | undefined>
export function createGMSignal<T = string>(key: string, initialValue: T): GMSignal<T>
export function createGMSignal<T>(key: string, initialValue?: T) {
  const [signal, setSignal] = createSignal(initialValue) as GMSignal<T>

  let listener: number | undefined

  Promise.resolve()
    .then(() => GMP.addValueChangeListener?.(key, (name, oldValue, newValue, remote) => {
      if (name === key && (remote === undefined || remote === true))
        read(newValue)
    }))
    .then(l => listener = l)

  let effectPaused = false
  createEffect(on(signal, () => {
    if (effectPaused)
      return
    if (signal() == null) {
      GMP.deleteValue(key)
      effectPaused = true
      setSignal(() => initialValue)
      effectPaused = false
    }
    else {
      GMP.setValue(key, signal())
    }
  }, { defer: true }))

  async function read(newValue?: string) {
    effectPaused = true

    const rawValue = newValue ?? (await GMP.getValue(key))
    if (rawValue == null)
      setSignal(() => initialValue)
    else
      setSignal(() => rawValue as T)

    effectPaused = false
  }

  const [isReady, setIsReady] = createSignal(false)
  signal.isReady = isReady
  signal.ready = read()
    .then(() => {
      setIsReady(true)
    })

  onCleanup(() => {
    if (listener)
      GMP.removeValueChangeListener?.(listener)
  })

  return [signal, setSignal]
}

export const [detectionResolution, setDetectionResolution] = createGMSignal<DetectResOption>('detectionResolution', 'M')
export const [textDetector, setTextDetector] = createGMSignal<TextDetectorOption>('textDetector', 'default')
export const [translatorService, setTranslatorService] = createGMSignal<TranslatorOption>('translator', 'gpt3.5')
export const [renderTextOrientation, setRenderTextOrientation] = createGMSignal<RenderTextDirOption>('renderTextOrientation', 'auto')
export const [targetLang, setTargetLang] = createGMSignal<TargetLangOption>('targetLang', '')
export const [scriptLang, setScriptLang] = createGMSignal<ScriptLangOption>('scriptLanguage', '')
export const [keepInstances, setKeepInstances] = createGMSignal<KeepInstancesOption>('keepInstances', 'until-reload')

export const storageReady = Promise.all([
  detectionResolution.ready,
  textDetector.ready,
  translatorService.ready,
  renderTextOrientation.ready,
  targetLang.ready,
  scriptLang.ready,
  keepInstances.ready,
])
