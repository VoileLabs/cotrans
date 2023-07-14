import type { Accessor } from 'solid-js'
import { For, Match, Show, Switch, createEffect, createMemo, createRoot, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic, render } from 'solid-js/web'
import { createMutationObserver } from '@solid-primitives/mutation-observer'
import { makeEventListener } from '@solid-primitives/event-listener'
import { tw } from '../utils/twind'
import { t } from '../i18n'
import type { Translator, TranslatorInstance } from '../main'
import { detectResOptions, detectResOptionsMap, renderTextDirOptions, renderTextDirOptionsMap, textDetectorOptions, textDetectorOptionsMap, translatorOptions, translatorOptionsMap } from '../settings'
import { formatProgress } from '../utils'
import type { TranslateOptionsOverwrite } from '../utils/core'
import {
  downloadBlob,
  pullTranslationStatusPolling,
  resizeToSubmit,
  submitTranslate,
} from '../utils/core'
import { detectionResolution, keepInstances, renderTextOrientation, textDetector, translatorService } from '../utils/storage'
import IconCarbonChevronRight from '~icons/carbon/chevron-right'
import IconCarbonChevronLeft from '~icons/carbon/chevron-left'
import IconCarbonChevronDown from '~icons/carbon/chevron-down'
import IconFluentTranslate24Filled from '~icons/fluent/translate-24-filled'
import IconFluentArrowReset24Filled from '~icons/fluent/arrow-reset-24-filled'

function mount(): TranslatorInstance {
  const appName = (document.querySelector('meta[name~=application-name][content]') as HTMLMetaElement | null)?.content
  const isCalckey = appName === 'Calckey'

  const origUrl = new URL(location.href)

  const [translatedMap, setTranslatedMap] = createStore<Record<string, string>>({})
  const [translateStatusMap, setTranslateStatusMap] = createStore<Record<string, Accessor<string | undefined>>>({})
  const [translateEnabledMap, setTranslateEnabledMap] = createStore<Record<string, boolean>>({})
  const originalImageMap: Record<string, Blob> = {}

  const [pswp, setPswp] = createSignal<HTMLDivElement | null>(null)
  const updatePswp = () =>
    setPswp(Array.from(document.body.children).find(el => el.classList.contains('pswp')) as HTMLDivElement | null)
  updatePswp()
  if (isCalckey) {
    createMutationObserver(
      document.body,
      { childList: true },
      updatePswp,
    )
  }

  const createDialog = () => {
    const [image, setImage] = createSignal<HTMLImageElement | null>(null)
    const [currentImg, setCurrentImage] = createSignal<string | undefined>()
    const firstButton = createMemo(() => pswp()!.querySelector('.pswp__button'))!

    const getImage = () => {
      return pswp()!.querySelector('[aria-hidden="false"] img.pswp__img') as HTMLImageElement
    }
    const updateImage = () => {
      const img = getImage()
      setImage(img)
      setCurrentImage(img ? img.getAttribute('data-transurl') || img.src : undefined)
    }
    updateImage()

    const getActiveContainer = () =>
      pswp()!
        .lastElementChild!
        .firstElementChild!
        .firstElementChild!
        .nextElementSibling!
        .firstElementChild! as HTMLDivElement

    const [activeContainer, setActiveContainer] = createSignal<HTMLDivElement>(getActiveContainer())

    pswp()?.querySelectorAll('.pswp__button--arrow--prev, .pswp__button--arrow--next')
      .forEach(el => makeEventListener(el, 'click', () => {
        setActiveContainer(getActiveContainer())
        updateImage()
      }))

    try {
      createMutationObserver(
        activeContainer,
        { childList: true },
        updateImage,
      )
    }
    catch (e) {}

    createEffect(() => {
      const img = image()
      if (!img)
        return

      if (img.hasAttribute('data-transurl')) {
        const transurl = img.getAttribute('data-transurl')!
        if (!translateEnabledMap[transurl]) {
          img.src = transurl
          img.removeAttribute('data-transurl')
        }
      }
      else if (translateEnabledMap[img.src] && translatedMap[img.src]) {
        const ori = img.src
        img.setAttribute('data-transurl', ori)
        img.src = translatedMap[ori]!
      }
    })

    const getTranslatedImage = async (url: string, optionsOverwrite?: TranslateOptionsOverwrite): Promise<string> => {
      if (!optionsOverwrite && translatedMap[url])
        return translatedMap[url]!

      const setStatus = (t: Accessor<string>) => setTranslateStatusMap(url, () => t)

      setStatus(t('common.source.download-image'))
      if (!originalImageMap[url]) {
        // fetch original image
        const result = await GMP.xmlHttpRequest({
          method: 'GET',
          responseType: 'blob',
          url,
          headers: { referer: `https://${origUrl.hostname}/` },
          overrideMimeType: 'text/plain; charset=x-user-defined',
          onprogress(e) {
            if (e.lengthComputable) {
              setStatus(t('common.source.download-image-progress', {
                progress: formatProgress(e.loaded, e.total),
              }))
            }
          },
        }).catch((e) => {
          setStatus(t('common.source.download-image-error'))
          throw e
        })
        originalImageMap[url] = result.response as Blob
      }
      const originalImage = originalImageMap[url]
      const originalSrcSuffix = new URL(url).searchParams.get('format') || url.split('.')[1] || 'jpg'

      setStatus(t('common.client.resize'))
      await new Promise<void>(resolve => queueMicrotask(resolve))
      const { blob: resizedImage, suffix: resizedSuffix } = await resizeToSubmit(originalImage, originalSrcSuffix)

      setStatus(t('common.client.submit'))
      const task = await submitTranslate(
        resizedImage,
        resizedSuffix,
        {
          onProgress(progress) {
            setStatus(t('common.client.submit-progress', { progress }))
          },
        },
        optionsOverwrite,
      ).catch((e) => {
        setStatus(t('common.client.submit-error'))
        throw e
      })

      let maskUrl = task.result?.translation_mask
      if (!maskUrl) {
        setStatus(t('common.status.pending'))
        const res = await pullTranslationStatusPolling(task.id, setStatus)
          .catch((e) => {
            setStatus(e)
            throw e
          })
        maskUrl = res.translation_mask
      }

      setStatus(t('common.client.download-image'))
      const mask = await downloadBlob(maskUrl, {
        onProgress(progress) {
          t('common.client.download-image-progress', { progress })
        },
      }).catch((e) => {
        setStatus(t('common.client.download-image-error'))
        throw e
      })
      const maskUri = URL.createObjectURL(mask)

      setStatus(t('common.client.merging'))
      // layer translation_mask on top of original image
      const canvas = document.createElement('canvas')
      const canvasCtx = canvas.getContext('2d')!
      // draw original image
      const img = new Image()
      img.src = URL.createObjectURL(resizedImage)
      await new Promise((resolve) => {
        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          canvasCtx.drawImage(img, 0, 0)
          resolve(null)
        }
      })
      // draw translation_mask
      const img2 = new Image()
      img2.src = maskUri
      img2.crossOrigin = 'anonymous'
      await new Promise((resolve) => {
        img2.onload = () => {
          canvasCtx.drawImage(img2, 0, 0)
          resolve(null)
        }
      })
      // export to blob
      const translated = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob!)
        }, 'image/png')
      })
      const translatedUri = URL.createObjectURL(translated)

      setTranslatedMap(url, translatedUri)

      setStatus(() => '')

      return translatedUri
    }

    const enable = async (url: string, optionsOverwrite?: TranslateOptionsOverwrite) => {
      await getTranslatedImage(url, optionsOverwrite)
      setTranslateEnabledMap(url, true)
    }
    const disable = (url: string) => {
      setTranslateEnabledMap(url, false)
    }

    const isEnabled = createMemo(() => {
      const img = currentImg()
      return img ? !!translateEnabledMap[img] : false
    })
    const transStatus = createMemo(() => {
      const img = currentImg()
      return img ? translateStatusMap[img]?.() : ''
    })
    const isProcessing = createMemo(() => !!transStatus())

    // const advancedMenuOpen = ref(false)
    const [advancedMenuOpen, setAdvancedMenuOpen] = createSignal(false)

    const container = firstButton()!.cloneNode(true) as HTMLElement
    container.style.display = 'flex'
    container.style.justifyContent = 'center'
    container.style.alignItems = 'center'
    container.style.flexDirection = 'row'
    container.style.flexWrap = 'nowrap'
    container.style.overflow = 'visible'
    container.removeAttribute('title')
    container.removeAttribute('aria-label')
    firstButton()!.parentElement!.insertBefore(container, firstButton()!)

    const submitTranslateTest = () => {
      const img = currentImg()
      return img && !translateStatusMap[img]?.()
    }
    container.onclick = (e) => {
      e.stopPropagation()

      // prevent misclick
      if (advancedMenuOpen())
        return
      if (!submitTranslateTest())
        return
      if (isEnabled())
        disable(currentImg()!)
      else
        enable(currentImg()!)
    }
    container.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()

      if (isEnabled())
        setAdvancedMenuOpen(false)
      else setAdvancedMenuOpen(v => !v)
    }
    container.onpointerdown = (e) => {
      e.stopPropagation()
    }

    const spinnerContainer = container.appendChild(document.createElement('div'))
    const disposeProcessingSpinner = render(() => (
      <Show when={isProcessing()}>
        <div class={tw('absolute top-1 -left-px w-7 h-7 m-4 border-1 border-solid border-x-transparent border-b-transparent border-t-white rounded-full animate-spin')} />
      </Show>
    ), spinnerContainer)
    onCleanup(disposeProcessingSpinner)

    const buttonIconContainer = document.createElement('div')
    container.firstElementChild!.remove()
    container.appendChild(buttonIconContainer)
    const disposeButtonIcon = render(() => (
      <Dynamic
        component={isEnabled() ? IconFluentArrowReset24Filled : IconFluentTranslate24Filled}
        class={tw('text-white stroke-black w-6 h-6 mx-1 mb-1 mt-1.5')}
        style={{ 'stroke-width': '0.5px' }}
      />
    ), buttonIconContainer)
    onCleanup(disposeButtonIcon)

    const buttonStatusContainer = document.createElement('div')
    container.insertBefore(buttonStatusContainer, container.firstChild)
    const disposeButtonStatus = render(() => {
      const status = createMemo(() => transStatus())

      const [advDetectRes, setAdvDetectRes] = createSignal(detectionResolution())
      const [advRenderTextDir, setAdvRenderTextDir] = createSignal(renderTextOrientation())
      const [advTextDetector, setAdvTextDetector] = createSignal(textDetector())
      const [advTranslator, setAdvTranslator] = createSignal(translatorService())
      const [forceRetry, setForceRetry] = createSignal(false)

      createEffect((prev) => {
        const img = currentImg()
        if (prev !== img) {
          setAdvDetectRes(detectionResolution())
          setAdvRenderTextDir(renderTextOrientation())
        }
        return img
      })

      return (
        <div
          class={tw('absolute top-3.5 right-12 flex flex-col -mr-3 px-1 text-white rounded-2xl cursor-default pointer-events-initial')}
          classList={{ [tw('bg-gray-500/70')]: advancedMenuOpen() }}
        >
          <Switch>
            <Match when={status()}>
              <div class={tw('mt-1.5 mr-2 px-2 py-1 rounded-2xl whitespace-nowrap bg-gray-500/70')}>
                {status()}
              </div>
            </Match>
            <Match when={currentImg() && !translateEnabledMap[currentImg()!]}>
              <Show
                when={advancedMenuOpen()}
                fallback={(
                  <IconCarbonChevronLeft
                    class={tw('mt-2 w-5 h-5 align-middle cursor-pointer')}
                    onClick={(e) => {
                      e.stopPropagation()

                      setAdvancedMenuOpen(true)
                    }}
                  />
                )}
              >
                <div
                  class={tw('flex justify-between items-center pl-2 py-1')}
                  onClick={(e) => {
                    e.stopPropagation()

                    setAdvancedMenuOpen(false)
                  }}
                >
                  <div class={tw('text-lg')}>{t('settings.inline-options-title')()}</div>
                  <IconCarbonChevronRight class={tw('align-middle cursor-pointer')} />
                </div>
                <div class={tw('flex flex-col w-[14rem] gap-2 ml-2')}>
                  <For
                    each={[
                      [t('settings.detection-resolution'),
                        advDetectRes, setAdvDetectRes,
                        detectResOptions, detectResOptionsMap,
                      ] as const,
                      [t('settings.text-detector'),
                        advTextDetector, setAdvTextDetector,
                        textDetectorOptions, textDetectorOptionsMap,
                      ] as const,
                      [t('settings.translator'),
                        advTranslator, setAdvTranslator,
                        translatorOptions, translatorOptionsMap,
                      ] as const,
                      [
                        t('settings.render-text-orientation'),
                        advRenderTextDir, setAdvRenderTextDir,
                        renderTextDirOptions, renderTextDirOptionsMap,
                      ] as const,
                    ]}
                  >{([title, opt, setOpt, opts, optMap]) => (
                    <div>
                      <div>{title()}</div>
                      <div class={tw('relative px-1')}>
                        <select
                          class={tw('w-full py-1 appearance-none text-white border-x-0 border-t-0 border-b border-solid border-gray-300 bg-transparent')}
                          value={opt()}
                          onChange={(e) => {
                            // @ts-expect-error setOpt are incompatible with each other
                            setOpt(e.target.value)
                          }}
                        >
                          <For each={opts}>{opt => (
                            <option value={opt}>{
                              // @ts-expect-error optMap are incompatible with each other
                              optMap[opt]()
                            }</option>
                          )}</For>
                        </select>
                        <IconCarbonChevronDown class={tw('absolute top-1 right-1 pointer-events-none')} />
                      </div>
                    </div>
                  )}</For>
                  <label class={tw('flex items-center cursor-pointer')}>
                    <input
                      type="checkbox"
                      checked={/* @once */ forceRetry()}
                      onChange={(e) => {
                        setForceRetry(e.target.checked)
                      }}
                    />
                    {t('settings.force-retry')()}
                  </label>
                </div>
                <div
                  class={tw('w-full mt-2 mb-1 py-1 border border-solid border-white rounded-full text-center cursor-pointer')}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()

                    if (!submitTranslateTest())
                      return
                    if (translateEnabledMap[currentImg()!])
                      return
                    enable(currentImg()!, {
                      detectionResolution: advDetectRes(),
                      renderTextOrientation: advRenderTextDir(),
                      textDetector: advTextDetector(),
                      translator: advTranslator(),
                      forceRetry: forceRetry(),
                    })
                    setAdvancedMenuOpen(false)
                  }}
                >
                  {t('common.control.translate')()}
                </div>
              </Show>
            </Match>
          </Switch>
        </div>
      )
    }, buttonStatusContainer)
    onCleanup(disposeButtonStatus)

    onCleanup(() => {
      container.remove()
      const img = image()
      if (img?.hasAttribute('data-transurl')) {
        const transurl = img.getAttribute('data-transurl')!
        img.src = transurl
        img.removeAttribute('data-transurl')
      }
      setImage(null)
    })
  }

  let disposeDialog: (() => void) | undefined
  createEffect((prev) => {
    if (pswp() !== prev || !pswp()) {
      disposeDialog?.()
      disposeDialog = undefined
      if (!pswp())
        return null
      disposeDialog = createRoot((dispose) => {
        createDialog()
        return dispose
      })
    }
    return pswp()
  }, null)
  onCleanup(() => {
    disposeDialog?.()
  })

  return {
    canKeep(url) {
      const parsed = new URL(url)
      switch (keepInstances()) {
        case 'until-reload':
          return origUrl.hostname === parsed.hostname
        case 'until-navigate':
          return pswp()
        default:
          return false
      }
    },
    onURLChange(url) {
      const parsed = new URL(url)
      if (parsed.hash === '#pswp' || isCalckey)
        updatePswp()
      else
        setPswp(null)
    },
  }
}

const translator: Translator = {
  // https://misskey.io/<slug>#pswp
  match(url) {
    const appName = (document.querySelector('meta[name~=application-name][content]') as HTMLMetaElement | null)?.content
    return (appName === 'Misskey' && new URL(url).hash === '#pswp')
      || appName === 'Calckey'
  },
  mount,
}

export default translator
