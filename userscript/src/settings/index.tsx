import type { Accessor, Component, JSX } from 'solid-js'
import { For, Show } from 'solid-js'
import {
  detectionResolution,
  renderTextOrientation,
  scriptLang,
  setDetectionResolution,
  setRenderTextOrientation,
  setScriptLang,
  setTargetLang,
  setTextDetector,
  setTranslatorService,
  targetLang,
  textDetector,
  translatorService,
} from '../utils/storage'
import { t } from '../i18n'

type OptionsMap = Record<string, Accessor<string>>

export const detectResOptionsMap: OptionsMap = {
  S: () => '1024px',
  M: () => '1536px',
  L: () => '2048px',
  X: () => '2560px',
}
export const detectResOptions = Object.keys(detectResOptionsMap)
export const renderTextDirOptionsMap: OptionsMap = {
  auto: t('settings.render-text-orientation-options.auto'),
  horizontal: t('settings.render-text-orientation-options.horizontal'),
  vertical: t('settings.render-text-orientation-options.vertical'),
}
export const renderTextDirOptions = Object.keys(renderTextDirOptionsMap)
export const textDetectorOptionsMap: OptionsMap = {
  default: t('settings.text-detector-options.default'),
  ctd: () => 'Comic Text Detector',
}
export const textDetectorOptions = Object.keys(textDetectorOptionsMap)
export const translatorOptionsMap: OptionsMap = {
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
}
export const translatorOptions = Object.keys(translatorOptionsMap)
export const targetLangOptionsMap: OptionsMap = {
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
}
export const targetLangOptions = Object.keys(targetLangOptionsMap)
export const scriptLangOptionsMap: OptionsMap = {
  '': t('settings.script-language-options.auto'),
  'zh-CN': () => '简体中文',
  'en-US': () => 'English',
}
export const scriptLangOptions = Object.keys(scriptLangOptionsMap)

export const Settings: Component<{
  itemOrientation?: 'vertical' | 'horizontal'
  textStyle?: JSX.HTMLAttributes<HTMLDivElement>['style']
}> = (props) => {
  const { itemOrientation = 'vertical', textStyle = {} } = props

  return (
    <div style={{
      'display': 'flex',
      'flex-direction': 'column',
      'gap': '8px',
    }}>
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
              style={{
                'color': '#2563EB',
                'text-decoration': 'none',
              }}
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
      ]}>{([title, opt, setOpt, optMap, desc]) => (
        <div
          style={itemOrientation === 'horizontal'
            ? {
                'display': 'flex',
                'flex-direction': 'row',
                'align-items': 'center',
              }
            : {}}
        >
          <div style={textStyle}>{title()}</div>
          <div>
            <select
              value={opt()}
              onChange={e => setOpt((e.target as HTMLSelectElement).value)}
            >
              {Object.entries(optMap).map(([value, label]) => (
                <option value={value}>{label()}</option>
              ))}
            </select>
            <Show when={desc()}>
              <div style={{ 'font-size': '13px' }}>{desc()}</div>
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
