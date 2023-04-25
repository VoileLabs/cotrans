import type { Accessor, Component, JSX } from 'solid-js'
import { For, Show } from 'solid-js'
import { tw } from 'twind'
import { t } from '../i18n'
import {
  detectionResolution,
  keepInstances,
  renderTextOrientation,
  scriptLang,
  setDetectionResolution,
  setKeepInstances,
  setRenderTextOrientation,
  setScriptLang,
  setTargetLang,
  setTextDetector,
  setTranslatorService,
  targetLang,
  textDetector,
  translatorService,
} from '../utils/storage'

type OptionsMap = Record<string, Accessor<string>>

export const detectResOptionsMap = {
  S: () => '1024px',
  M: () => '1536px',
  L: () => '2048px',
  X: () => '2560px',
} satisfies OptionsMap
export const detectResOptions = Object.keys(detectResOptionsMap)
export type DetectResOption = keyof typeof detectResOptionsMap

export const renderTextDirOptionsMap = {
  auto: t('settings.render-text-orientation-options.auto'),
  h: t('settings.render-text-orientation-options.horizontal'),
  v: t('settings.render-text-orientation-options.vertical'),
} satisfies OptionsMap
export const renderTextDirOptions = Object.keys(renderTextDirOptionsMap)
export type RenderTextDirOption = keyof typeof renderTextDirOptionsMap

export const textDetectorOptionsMap = {
  default: t('settings.text-detector-options.default'),
  ctd: () => 'Comic Text Detector',
} satisfies OptionsMap
export const textDetectorOptions = Object.keys(textDetectorOptionsMap)
export type TextDetectorOption = keyof typeof textDetectorOptionsMap

export const translatorOptionsMap = {
  youdao: () => 'Youdao',
  baidu: () => 'Baidu',
  google: () => 'Google',
  deepl: () => 'DeepL',
  papago: () => 'Papago',
  offline: () => 'Sugoi / NLLB',
  none: t('settings.translator-options.none'),
  // offline_big: () => 'Sugoi / NLLB (Big)',
  // nnlb: () => 'NLLB',
  // nnlb_big: () => 'NLLB (Big)',
  // sugoi: () => 'Sugoi',
  // sugoi_small: () => 'Sugoi (Small)',
  // sugoi_big: () => 'Sugoi (Big)',
} satisfies OptionsMap
export const translatorOptions = Object.keys(translatorOptionsMap)
export type TranslatorOption = keyof typeof translatorOptionsMap

export const targetLangOptionsMap = {
  '': t('settings.target-language-options.auto'),
  'CHS': () => '简体中文',
  'CHT': () => '繁體中文',
  'JPN': () => '日本語',
  'ENG': () => 'English',
  'KOR': () => '한국어',
  'VIN': () => 'Tiếng Việt',
  'CSY': () => 'čeština',
  'NLD': () => 'Nederlands',
  'FRA': () => 'français',
  'DEU': () => 'Deutsch',
  'HUN': () => 'magyar nyelv',
  'ITA': () => 'italiano',
  'PLK': () => 'polski',
  'PTB': () => 'português',
  'ROM': () => 'limba română',
  'RUS': () => 'русский язык',
  'UKR': () => 'українська мова',
  'ESP': () => 'español',
  'TRK': () => 'Türk dili',
} satisfies OptionsMap
export const targetLangOptions = Object.keys(targetLangOptionsMap)
export type TargetLangOption = keyof typeof targetLangOptionsMap

export const scriptLangOptionsMap = {
  '': t('settings.script-language-options.auto'),
  'zh-CN': () => '简体中文',
  'en-US': () => 'English',
} satisfies OptionsMap
export const scriptLangOptions = Object.keys(scriptLangOptionsMap)
export type ScriptLangOption = keyof typeof scriptLangOptionsMap

export const keepInstancesOptionsMap = {
  'until-reload': t('settings.keep-instances-options.until-reload'),
  'until-navigate': t('settings.keep-instances-options.until-navigate'),
} satisfies OptionsMap
export const keepInstancesOptions = Object.keys(keepInstancesOptionsMap)
export type KeepInstancesOption = keyof typeof keepInstancesOptionsMap

export const Settings: Component<{
  itemOrientation?: 'vertical' | 'horizontal'
  textStyle?: JSX.HTMLAttributes<HTMLDivElement>['style']
}> = (props) => {
  const itemOrientation = () => props.itemOrientation ?? 'vertical'
  const textStyle = () => props.textStyle ?? {}

  return (
    <div class={tw`flex flex-col gap-2`}>
      {/* Meta */}
      <div>{EDITION} edition, v{VERSION}</div>
      {/* Sponsor */}
      <div>
        {t('sponsor.text')()}
      </div>
      <div>
        <For each={[
          ['ko-fi', 'https://ko-fi.com/voilelabs'],
          ['Patreon', 'https://patreon.com/voilelabs'],
          ['爱发电', 'https://afdian.net/@voilelabs'],
        ]}>{([name, url]) => (
          <>
            {' '}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              class={tw`no-underline text-blue-600`}
            >{name}</a>
          </>
        )}</For>
      </div>
      {/* Settings */}
      <For each={[
        [
          t('settings.detection-resolution'),
          detectionResolution, setDetectionResolution, detectResOptionsMap,
          t('settings.detection-resolution-desc'),
        ] as const,
        [
          t('settings.text-detector'),
          textDetector, setTextDetector, textDetectorOptionsMap,
          t('settings.text-detector-desc'),
        ] as const,
        [
          t('settings.translator'),
          translatorService, setTranslatorService, translatorOptionsMap,
          t('settings.translator-desc'),
        ] as const,
        [
          t('settings.render-text-orientation'),
          renderTextOrientation, setRenderTextOrientation, renderTextDirOptionsMap,
          t('settings.render-text-orientation-desc'),
        ] as const,
        [
          t('settings.target-language'),
          targetLang, setTargetLang, targetLangOptionsMap,
          t('settings.target-language-desc'),
        ] as const,
        [
          t('settings.script-language'),
          scriptLang, setScriptLang, scriptLangOptionsMap,
          t('settings.script-language-desc'),
        ] as const,
        [
          t('settings.keep-instances'),
          keepInstances, setKeepInstances, keepInstancesOptionsMap,
          t('settings.keep-instances-desc'),
        ] as const,
      ]}>{([title, opt, setOpt, optMap, desc]) => (
        <div class={itemOrientation() === 'horizontal' ? tw`flex items-center` : ''}>
          <div style={textStyle()}>{title()}</div>
          <div>
            <select
              value={opt()}
              // @ts-expect-error setOpt are incompatible with each other
              onChange={e => setOpt((e.target as HTMLSelectElement).value)}
            >
              {Object.entries(optMap).map(([value, label]) => (
                <option value={value}>{label()}</option>
              ))}
            </select>
            <Show when={desc()}>
              <div class={tw`text-sm`}>{desc()}</div>
            </Show>
          </div>
        </div>
      )}</For>
      {/* Reset */}
      <div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()

            setDetectionResolution(null)
            setTextDetector(null)
            setTranslatorService(null)
            setRenderTextOrientation(null)
            setTargetLang(null)
            setScriptLang(null)
          }}
        >{t('settings.reset')()}</button>
      </div>
    </div>
  )
}
