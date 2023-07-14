import { createMutationObserver } from '@solid-primitives/mutation-observer'
import { throttle } from '@solid-primitives/scheduled'
import type { Accessor, Setter } from 'solid-js'
import { For, Match, Show, Switch, createEffect, createMemo, createRoot, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic, render } from 'solid-js/web'
import { tw } from '../utils/twind'
import { t } from '../i18n'
import type { Translator, TranslatorInstance } from '../main'
import { detectResOptions, detectResOptionsMap, renderTextDirOptions, renderTextDirOptionsMap, textDetectorOptions, textDetectorOptionsMap, translatorOptions, translatorOptionsMap } from '../settings'
import { assert, formatProgress } from '../utils'
import type { TranslateOptionsOverwrite } from '../utils/core'
import {
  downloadBlob,
  pullTranslationStatusPolling,
  resizeToSubmit,
  submitTranslate,
} from '../utils/core'
import { detectionResolution, keepInstances, renderTextOrientation, textDetector, translatorService } from '../utils/storage'
import IconCarbonTranslate from '~icons/carbon/translate'
import IconCarbonReset from '~icons/carbon/reset'
import IconCarbonChevronRight from '~icons/carbon/chevron-right'
import IconCarbonChevronLeft from '~icons/carbon/chevron-left'
import IconCarbonChevronDown from '~icons/carbon/chevron-down'

function mount(): TranslatorInstance {
  const mountAuthorId = location.pathname.split('/', 2)[1]
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
      .firstElementChild!.firstElementChild!

    const getImages = () => {
      try {
        const cont = buttonParent.firstElementChild!
        assert(cont.nodeName === 'DIV')
        const ul = cont.firstElementChild!.firstElementChild!.nextElementSibling!.firstElementChild!.firstElementChild!
        assert(ul.nodeName === 'UL')
        const images = []
        let li = ul.firstElementChild!
        do {
          const img = li.firstElementChild!.firstElementChild!.firstElementChild!.firstElementChild!.lastElementChild!
          assert(img.nodeName === 'IMG')
          images.push(img as HTMLImageElement)
        // eslint-disable-next-line no-cond-assign
        } while (li = li.nextElementSibling!)
        return images
      }
      catch (e) {
        return [].slice.call((buttonParent.firstElementChild!).querySelectorAll('img')) as HTMLImageElement[]
      }
    }
    const [images, setImages] = createSignal(getImages(), {
      equals: (a, b) => a.length === b.length && a.every((img, i) => img === b[i]),
    })
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
        <div class={tw('absolute inset-0 border-1 border-solid border-x-transparent border-b-transparent border-t-gray-400 rounded-full animate-spin')} />
      </Show>
    ), spinnerContainer)
    onCleanup(disposeProcessingSpinner)

    const svg = container.querySelector('svg')!
    const svgParent = svg.parentElement!
    const buttonIconContainer = document.createElement('div')
    svgParent.insertBefore(buttonIconContainer, svg)
    svg.remove()
    const disposeButtonIcon = render(() => (
      <Dynamic
        component={isEnabled() ? IconCarbonReset : IconCarbonTranslate}
        class={tw('w-5 h-5 mt-1')}
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
          class={tw('flex flex-col -mr-3 pl-1 pr-2 text-white rounded-2xl cursor-default')}
          style={{ 'background-color': backgroundColor() }}
        >
          <Switch>
            <Match when={status()}>
              <div class={tw('px-2 py-1')}>
                {status()}
              </div>
            </Match>
            <Match when={currentImg() && !translateEnabledMap[currentImg()!]}>
              <Show
                when={advancedMenuOpen()}
                fallback={(
                  <IconCarbonChevronLeft
                    class={tw('py-1 align-middle cursor-pointer')}
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
                <div class={tw('flex flex-col w-48 gap-2 ml-2')}>
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
      for (const img of images()) {
        if (img.hasAttribute('data-transurl')) {
          const transurl = img.getAttribute('data-transurl')!
          img.src = transurl
          img.removeAttribute('data-transurl')
        }
      }
      setImages([])
    })

    return {
      setActive,
      update() {
        if (referenceChild.style.backgroundColor)
          setBackgroundColor(child.style.backgroundColor = referenceChild.style.backgroundColor)
        setImages(getImages())
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
      switch (keepInstances()) {
        case 'until-reload':
          return url.startsWith('https://twitter.com/')
        case 'until-navigate':
          return url.startsWith(`https://twitter.com/${mountAuthorId}`)
        default:
          return false
      }
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
