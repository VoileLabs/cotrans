import type { Accessor, Setter } from 'solid-js'
import { For, Match, Show, Switch, createEffect, createMemo, createRoot, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic, render } from 'solid-js/web'
import { createMutationObserver } from '@solid-primitives/mutation-observer'
import { throttle } from '@solid-primitives/scheduled'
import type { Translator, TranslatorInstance } from '../main'
import { t } from '../i18n'
import type { TranslateOptionsOverwrite } from '../utils/core'
import {
  downloadBlob,
  pullTranslationStatusPolling,
  resizeToSubmit,
  submitTranslate,
} from '../utils/core'
import { formatProgress } from '../utils'
import { detectionResolution, renderTextOrientation, textDetector, translatorService } from '../composables/storage'
import { detectResOptions, detectResOptionsMap, renderTextDirOptions, renderTextDirOptionsMap, textDetectorOptions, textDetectorOptionsMap, translatorOptions, translatorOptionsMap } from '../settings'
import IconCarbonTranslate from '~icons/carbon/translate'
import IconCarbonReset from '~icons/carbon/reset'
import IconCarbonChevronLeft from '~icons/carbon/chevron-left'
import IconCarbonChevronRight from '~icons/carbon/chevron-right'

function mount(): TranslatorInstance {
  const [statusId, setStatusId] = createSignal(location.pathname.match(/\/status\/(\d+)/)?.[1])

  const [translatedMap, setTranslatedMap] = createStore<Record<string, string>>({})
  const [translateStatusMap, setTranslateStatusMap] = createStore<Record<string, Accessor<string | undefined>>>({})
  const [translateEnabledMap, setTranslateEnabledMap] = createStore<Record<string, boolean>>({})
  const originalImageMap: Record<string, Blob> = {}

  const [layers, setLayers] = createSignal<HTMLDivElement | null>(null)

  let dialog: HTMLElement | undefined
  interface DialogInstance {
    setActive: Setter<number>
    update: () => void
  }
  const createDialog = (): DialogInstance => {
    const [active, setActive] = createSignal(0)
    const buttonParent = dialog!.querySelector('[aria-labelledby="modal-header"][role="dialog"]')!
      .firstChild!.firstChild as HTMLElement

    const images = createMemo(() => [].slice.call((buttonParent.firstChild! as HTMLElement).querySelectorAll('img')) as HTMLImageElement[])
    const currentImg = createMemo(() => {
      const img = images()[active()]
      if (!img)
        return undefined
      return img.getAttribute('data-transurl') || img.src
    })
    createEffect(() => {
      for (const img of images()) {
        const div = img.previousSibling as HTMLElement
        if (img.hasAttribute('data-transurl')) {
          const transurl = img.getAttribute('data-transurl')!
          if (!translateEnabledMap[transurl]) {
            if (div)
              div.style.backgroundImage = `url("${transurl}")`
            img.src = transurl
            img.removeAttribute('data-transurl')
          }
        }
        else if (translateEnabledMap[img.src] && translatedMap[img.src]) {
          const ori = img.src
          img.setAttribute('data-transurl', ori)
          img.src = translatedMap[ori]!
          if (div)
            div.style.backgroundImage = `url("${translatedMap[ori]!}")`
        }
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
          headers: { referer: 'https://twitter.com/' },
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

    const referenceEl = buttonParent.children[2] as HTMLElement
    const container = referenceEl.cloneNode(true) as HTMLElement
    container.style.top = '48px'
    // container.style.display = 'flex'
    createEffect(() => {
      container.style.display = currentImg() ? 'flex' : 'none'
      container.style.alignItems = advancedMenuOpen() ? 'start' : 'center'
    })
    container.style.flexDirection = 'row'
    container.style.flexWrap = 'nowrap'
    const child = container.firstChild as HTMLElement
    const referenceChild = referenceEl.firstChild as HTMLElement
    const [backgroundColor, setBackgroundColor] = createSignal(referenceChild.style.backgroundColor)
    buttonParent.appendChild(container)

    const submitTranslateTest = () => {
      const img = currentImg()
      return img && !translateStatusMap[img]?.()
    }
    container.onclick = (e) => {
      e.preventDefault()
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

    const spinnerContainer = container.firstChild!
    const disposeProcessingSpinner = render(() => (
      <Show when={isProcessing()}>
        <div style={{
          'position': 'absolute',
          'top': '0',
          'left': '0',
          'bottom': '0',
          'right': '0',
          'border-top': '1px solid #A1A1AA',
          'border-radius': '9999px',
          'animation': 'imgtrans-spin 1s linear infinite',
        }} />
      </Show>
    ), spinnerContainer)
    onCleanup(disposeProcessingSpinner)

    const svg = container.querySelector('svg')!
    const svgParent = svg.parentElement!
    const buttonIconContainer = document.createElement('div')
    svgParent.insertBefore(buttonIconContainer, svg)
    svgParent.removeChild(svg)
    const disposeButtonIcon = render(() => (
      <Dynamic
        component={isEnabled() ? IconCarbonReset : IconCarbonTranslate}
        style={{
          'width': '20px',
          'height': '20px',
          'margin-top': '4px',
        }}
      />
    ), buttonIconContainer)
    onCleanup(disposeButtonIcon)

    const buttonStatusContainer = document.createElement('div')
    container.insertBefore(buttonStatusContainer, container.firstChild)
    const disposeButtonStatus = render(() => {
      const status = createMemo(() => transStatus())

      const borderRadius = createMemo(() => (advancedMenuOpen() || transStatus()) ? '4px' : '16px')

      const [advDetectRes, setAdvDetectRes] = createSignal(detectionResolution())
      const advDetectResIndex = createMemo(() => detectResOptions.indexOf(advDetectRes()))
      const [advRenderTextDir, setAdvRenderTextDir] = createSignal(renderTextOrientation())
      const advRenderTextDirIndex = createMemo(() => renderTextDirOptions.indexOf(advRenderTextDir()))
      const [advTextDetector, setAdvTextDetector] = createSignal(textDetector())
      const advTextDetectorIndex = createMemo(() => textDetectorOptions.indexOf(advTextDetector()))
      const [advTranslator, setAdvTranslator] = createSignal(translatorService())
      const advTranslatorIndex = createMemo(() => translatorOptions.indexOf(advTranslator()))

      createEffect((prev) => {
        const img = currentImg()
        if (prev !== img) {
          setAdvDetectRes(detectionResolution())
          setAdvRenderTextDir(renderTextOrientation())
        }
        return img
      })

      return (
        <div style={{
          'margin-right': '-12px',
          'padding': '2px 8px 2px 4px',
          'color': '#fff',
          'background-color': backgroundColor(),
          'border-radius': `${borderRadius()} 4px 4px ${borderRadius()}`,
          'cursor': 'default',
        }}>
          <Switch>
            <Match when={status()}>
              <div style={{ 'padding-right': '8px' }}>
                {status()}
              </div>
            </Match>
            <Match when={currentImg() && !translateEnabledMap[currentImg()!]}>
              <Show
                when={advancedMenuOpen()}
                fallback={(
                  <IconCarbonChevronLeft
                    style={{
                      'vertical-align': 'middle',
                      'padding-bottom': '3px',
                      'cursor': 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()

                      setAdvancedMenuOpen(true)
                    }}
                  />
                )}
              >
                <div
                  style={{
                    'display': 'flex',
                    'flex-direction': 'row',
                    'align-items': 'center',
                    'padding-right': '8px',
                    'padding-bottom': '2px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()

                    setAdvancedMenuOpen(false)
                  }}
                >
                  <IconCarbonChevronRight
                    style={{
                      'vertical-align': 'middle',
                      'cursor': 'pointer',
                    }}
                  />
                  <div>{t('settings.inline-options-title')()}</div>
                </div>
                <div style={{
                  'display': 'flex',
                  'flex-direction': 'column',
                  'gap': '4px',
                  'margin-left': '18px',
                }}>
                  <For
                    each={[
                      [t('settings.detection-resolution'),
                        advDetectRes, setAdvDetectRes, advDetectResIndex,
                        detectResOptions, detectResOptionsMap,
                      ] as const,
                      [t('settings.text-detector'),
                        advTextDetector, setAdvTextDetector, advTextDetectorIndex,
                        textDetectorOptions, textDetectorOptionsMap,
                      ] as const,
                      [t('settings.translator'),
                        advTranslator, setAdvTranslator, advTranslatorIndex,
                        translatorOptions, translatorOptionsMap,
                      ] as const,
                      [
                        t('settings.render-text-orientation'),
                        advRenderTextDir, setAdvRenderTextDir, advRenderTextDirIndex,
                        renderTextDirOptions, renderTextDirOptionsMap,
                      ] as const,
                    ]}
                  >{([title, opt, setOpt, optIndex, opts, optMap]) => (
                    <div>
                      <div style={{ 'font-size': '12px' }}>{title()}</div>
                      <div style={{
                        'display': 'flex',
                        'flex-direction': 'row',
                        'justify-content': 'space-between',
                        'align-items': 'center',
                        'user-select': 'none',
                      }}>
                        <Show
                          when={optIndex() > 0}
                          fallback={<div style={{ width: '1.2em' }} />}
                        >
                          <IconCarbonChevronLeft
                            style={{
                              width: '1.2em',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()

                              if (optIndex() <= 0)
                                return
                              setOpt(opts[optIndex() - 1])
                            }}
                          />
                        </Show>
                        <div>{optMap[opt()]()}</div>
                        <Show
                          when={optIndex() < opts.length - 1}
                          fallback={<div style={{ width: '1.2em' }} />}
                        >
                          <IconCarbonChevronRight
                            style={{
                              width: '1.2em',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()

                              if (optIndex() >= opts.length - 1)
                                return
                              setOpt(opts[optIndex() + 1])
                            }}
                          />
                        </Show>
                      </div>
                    </div>
                  )}</For>
                  <div
                    style={{
                      'padding': '2px 0px 1px 0px',
                      'border': '1px solid #A1A1AA',
                      'border-radius': '2px',
                      'text-align': 'center',
                      'cursor': 'pointer',
                    }}
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
                      })
                      setAdvancedMenuOpen(false)
                    }}
                  >
                    {t('common.control.translate')()}
                  </div>
                </div>
              </Show>
            </Match>
          </Switch>
        </div>
      )
    }, buttonStatusContainer)
    onCleanup(disposeButtonStatus)

    onCleanup(() => {
      buttonParent.removeChild(container)
      for (const img of images()) {
        if (img.hasAttribute('data-transurl')) {
          const transurl = img.getAttribute('data-transurl')!
          img.src = transurl
          img.removeAttribute('data-transurl')
        }
      }
    })

    return {
      setActive,
      update() {
        if (referenceChild.style.backgroundColor)
          setBackgroundColor(child.style.backgroundColor = referenceChild.style.backgroundColor)
      },
    }
  }

  let dialogInstance: DialogInstance & { dispose: () => void } | undefined
  const rescanLayers = () => {
    const [newDialog] = Array.from(layers()!.children)
      .filter(el =>
        el.querySelector('[aria-labelledby="modal-header"][role="dialog"]')
          ?.firstChild?.firstChild?.childNodes[2]) as HTMLElement[]
    if (newDialog !== dialog || !newDialog) {
      dialogInstance?.dispose()
      dialogInstance = undefined
      dialog = newDialog
      if (!dialog)
        return
      dialogInstance = createRoot((dispose) => {
        const dialog = createDialog()
        return {
          ...dialog,
          dispose,
        }
      })
    }

    const newIndex = Number(location.pathname.match(/\/status\/\d+\/photo\/(\d+)/)?.[1]) - 1
    dialogInstance!.setActive(newIndex)

    dialogInstance!.update()
  }
  onCleanup(() => {
    dialogInstance?.dispose()
  })

  let stopLayersObserver: (() => void) | undefined
  const onLayersUpdate = () => {
    stopLayersObserver?.()
    const [,{ stop }] = createMutationObserver(
      () => layers()!,
      { childList: true, subtree: true },
      throttle(() => rescanLayers(), 200),
    )
    stopLayersObserver = stop
    rescanLayers()
  }

  createEffect((prev) => {
    const id = statusId()

    if (!id)
      stopLayersObserver?.()

    if (id && id !== prev) {
      const layers = document.getElementById('layers') as HTMLDivElement | null
      setLayers(layers)
      if (layers) {
        onLayersUpdate()
      }
      else {
        const [,{ stop }] = createMutationObserver(
          document.body,
          { childList: true, subtree: true },
          throttle(() => {
            const layers = document.getElementById('layers') as HTMLDivElement | null
            setLayers(layers)
            if (layers) {
              onLayersUpdate()
              stop()
            }
          }, 200),
        )
      }
    }

    return id
  })

  return {
    canKeep(url) {
      return url.startsWith('https://twitter.com/')
    },
    onURLChange(url) {
      setStatusId(url.match(/\/status\/(\d+)/)?.[1])
    },
  }
}

const translator: Translator = {
  // https://twitter.com/<user>/status/<id>
  match(url) {
    return url.hostname.endsWith('twitter.com') && url.pathname.match(/\/status\//)
  },
  mount,
}

export default translator
