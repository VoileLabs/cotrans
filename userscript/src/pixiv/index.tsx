import { ReactiveMap } from '@solid-primitives/map'
import { createMutationObserver } from '@solid-primitives/mutation-observer'
import { throttle } from '@solid-primitives/scheduled'
import type { Accessor, Component } from 'solid-js'
import { For, Show, createMemo, createRoot, createSignal, onCleanup } from 'solid-js'
import { Dynamic, Match, Switch, render } from 'solid-js/web'
import { tw } from 'twind'
import { t } from '../i18n'
import type { Translator, TranslatorInstance } from '../main'
import {
  detectResOptions,
  detectResOptionsMap,
  renderTextDirOptions,
  renderTextDirOptionsMap,
  textDetectorOptions,
  textDetectorOptionsMap,
  translatorOptions,
  translatorOptionsMap,
} from '../settings'
import { formatProgress } from '../utils'
import type { TranslateOptionsOverwrite } from '../utils/core'
import {
  downloadBlob,
  pullTranslationStatus,
  resizeToSubmit,
  submitTranslate,
} from '../utils/core'
import {
  detectionResolution,
  renderTextOrientation,
  textDetector,
  translatorService,
} from '../utils/storage'
import IconCarbonTranslate from '~icons/carbon/translate'
import IconCarbonReset from '~icons/carbon/reset'
import IconCarbonChevronRight from '~icons/carbon/chevron-right'
import IconCarbonChevronLeft from '~icons/carbon/chevron-left'
import IconCarbonChevronDown from '~icons/carbon/chevron-down'

function mount(): TranslatorInstance {
  interface Instance {
    imageNode: HTMLImageElement
    dispose: () => void
    enable: () => Promise<void>
    disable: () => void
    isEnabled: () => boolean
  }

  const images = new Set<HTMLImageElement>()
  const instances = new ReactiveMap<HTMLImageElement, Instance>()
  const translatedMap = new Map<string, string>()
  const translateEnabledMap = new Map<string, boolean>()

  function findImageNodes(node: HTMLElement) {
    return Array.from(node.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
      .filter(node =>
        node.hasAttribute('srcset')
          || node.hasAttribute('data-trans')
          || node.parentElement?.classList.contains('sc-1pkrz0g-1')
          || node.parentElement?.classList.contains('gtm-expand-full-size-illust'),
      )
  }

  function rescanImages() {
    const imageNodes = findImageNodes(document.body)
    const removedImages = new Set(images)
    for (const node of imageNodes) {
      removedImages.delete(node)
      if (images.has(node))
        continue
      // new image
      // console.log('new', node)
      try {
        instances.set(node, createRoot((dispose) => {
          const instance = createInstance(node)
          return {
            ...instance,
            dispose,
          }
        }))
        images.add(node)
      }
      catch (e) {
        // ignore
      }
    }
    for (const node of removedImages) {
      // removed image
      // console.log('remove', node)
      if (!instances.has(node))
        continue
      const instance = instances.get(node)!
      instance.dispose()
      instances.delete(node)
      images.delete(node)
    }
  }

  function createInstance(imageNode: HTMLImageElement): Omit<Instance, 'dispose'> {
    // get current displayed image
    const src = imageNode.getAttribute('src')!
    const srcset = imageNode.getAttribute('srcset')

    // get original image
    const parent = imageNode.parentElement
    if (!parent)
      throw new Error('no parent')
    const originalSrc = parent.getAttribute('href') || src
    const originalSrcSuffix = originalSrc.split('.').pop()!

    // console.log(src, originalSrc)

    let originalImage: Blob | undefined
    let translatedImage = translatedMap.get(originalSrc)
    const [translateMounted, setTranslateMounted] = createSignal(false)
    let buttonDisabled = false

    const [processing, setProcessing] = createSignal(false)
    const [translated, setTranslated] = createSignal(false)
    const [transStatus, setTransStatus] = createSignal<Accessor<string | undefined>>(() => undefined)

    // create a translate botton
    parent.style.position = 'relative'
    const container = document.createElement('div')
    parent.appendChild(container)
    onCleanup(() => {
      container.remove()
    })

    const disposeButton = render(() => {
      const status = createMemo(() => transStatus()())

      const [advancedMenuOpen, setAdvancedMenuOpen] = createSignal(false)

      const [advDetectRes, setAdvDetectRes] = createSignal(detectionResolution())
      const [advRenderTextDir, setAdvRenderTextDir] = createSignal(renderTextOrientation())
      const [advTextDetector, setAdvTextDetector] = createSignal(textDetector())
      const [advTranslator, setAdvTranslator] = createSignal(translatorService())
      const [forceRetry, setForceRetry] = createSignal(false)

      const [mouseInside, setMouseInside] = createSignal(false)
      let mouseInsideTimeout: number | undefined
      const fullOpacity = createMemo(() => mouseInside() || advancedMenuOpen() || processing())

      return (
        <div
          class={tw`absolute z-1 flex top-1 left-2 transition-opacity duration-80`}
          classList={{
            [tw`opacity-100`]: fullOpacity(),
            [tw`opacity-30`]: !fullOpacity(),
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onMouseOver={() => {
            if (mouseInsideTimeout) {
              window.clearTimeout(mouseInsideTimeout)
              mouseInsideTimeout = undefined
            }
            setMouseInside(true)
          }}
          onMouseOut={() => {
            if (!mouseInsideTimeout) {
              mouseInsideTimeout = window.setTimeout(() => {
                setMouseInside(false)
                mouseInsideTimeout = undefined
              }, 400)
            }
          }}
        >
          {/* button */}
          <div>
            <div class={tw`relative rounded-full bg-white`}>
              <Dynamic
                component={translated() ? IconCarbonReset : IconCarbonTranslate}
                class={tw`w-6 h-6 p-2 align-middle cursor-pointer`}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  e.preventDefault()

                  // prevent misclick
                  if (advancedMenuOpen())
                    return

                  toggle()
                }}
                onContextMenu={(e: MouseEvent) => {
                  e.stopPropagation()
                  e.preventDefault()

                  if (translateMounted())
                    setAdvancedMenuOpen(false)
                  else setAdvancedMenuOpen(v => !v)
                }}
              />
              <div
                class={tw`absolute inset-0 border-1 border-solid border-gray-300 rounded-full pointer-events-none`}
                classList={{
                  [tw`border-t-gray-600 animate-spin`]: processing(),
                }}
              />
            </div>
          </div>
          {/* advanced menu */}
          <div class={tw`-ml-2 mt-1.5`}>
            <Show when={!translateMounted()}>
              <div class={tw`flex flex-col text-base px-1 border-1 border-solid border-gray-300 rounded-2xl bg-white cursor-default`}>
                <Switch>
                  <Match when={status()}>
                    <div class={tw`px-1`}>{status()}</div>
                  </Match>
                  <Match when={advancedMenuOpen()}>
                    <div
                      class={tw`flex items-center py-1`}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()

                        setAdvancedMenuOpen(false)
                      }}
                    >
                      <IconCarbonChevronLeft class={tw`align-middle cursor-pointer`} />
                      <div>{t('settings.inline-options-title')()}</div>
                    </div>
                    <div class={tw`flex flex-col w-48 gap-2 mx-2`}>
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
                          <div class={tw`relative px-1`}>
                            <select
                              class={tw`w-full py-1 appearance-none text-black border-0 border-b border-gray-600 bg-transparent`}
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
                            <IconCarbonChevronDown class={tw`absolute top-1 right-1 pointer-events-none`} />
                          </div>
                        </div>
                      )}</For>
                      <label
                        class={tw`flex items-center cursor-pointer`}
                        onClick={(e) => {
                          e.stopImmediatePropagation()
                        }}
                      >
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
                      class={tw`w-full mt-2 mb-1 py-1 border border-solid border-gray-600 rounded-full text-center cursor-pointer`}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()

                        if (buttonDisabled)
                          return
                        if (translateMounted())
                          return
                        enable({
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
                  </Match>
                  <Match when={true}>
                    <IconCarbonChevronRight
                      class={tw`py-1 align-middle cursor-pointer`}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()

                        setAdvancedMenuOpen(true)
                      }}
                    />
                  </Match>
                </Switch>
              </div>
            </Show>
          </div>
        </div>
      )
    }, container)
    onCleanup(disposeButton)

    async function getTranslatedImage(optionsOverwrite?: TranslateOptionsOverwrite): Promise<string> {
      if (!optionsOverwrite && translatedImage)
        return translatedImage
      buttonDisabled = true
      const text = transStatus()
      setProcessing(true)

      const setStatus = (t: Accessor<string | undefined>) => setTransStatus(() => t)

      setStatus(t('common.source.download-image'))
      if (!originalImage) {
        // fetch original image
        const result = await GMP.xmlHttpRequest({
          method: 'GET',
          responseType: 'blob',
          url: originalSrc,
          headers: { referer: 'https://www.pixiv.net/' },
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
        originalImage = result.response as Blob
      }

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
        const res = await pullTranslationStatus(task.id, setStatus)
          .catch((e) => {
            setStatus(e)
            throw e
          })
        maskUrl = res.translation_mask
      }

      setStatus(t('common.client.download-image'))
      const mask = await downloadBlob(maskUrl, {
        onProgress(progress) {
          setStatus(t('common.client.download-image-progress', { progress }))
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

      translatedImage = translatedUri
      translatedMap.set(originalSrc, translatedUri)

      setStatus(text)
      setProcessing(false)
      buttonDisabled = false
      return translatedUri
    }

    async function enable(optionsOverwrite?: TranslateOptionsOverwrite) {
      try {
        const translated = await getTranslatedImage(optionsOverwrite)
        imageNode.setAttribute('data-trans', src)
        imageNode.setAttribute('src', translated)
        imageNode.removeAttribute('srcset')

        setTranslateMounted(true)
        setTranslated(true)
      }
      catch (e) {
        buttonDisabled = false
        setTranslateMounted(false)
        throw e
      }
    }
    function disable() {
      imageNode.setAttribute('src', src)
      if (srcset)
        imageNode.setAttribute('srcset', srcset)
      imageNode.removeAttribute('data-trans')
      setTranslateMounted(false)
      setTranslated(false)
    }

    // called on click
    function toggle() {
      if (buttonDisabled)
        return
      if (!translateMounted()) {
        translateEnabledMap.set(originalSrc, true)
        enable()
      }
      else {
        translateEnabledMap.delete(originalSrc)
        disable()
      }
    }

    // enable if enabled
    if (translateEnabledMap.get(originalSrc))
      enable()

    onCleanup(() => {
      if (translateMounted())
        disable()
    })

    return {
      imageNode,
      async enable() {
        translateEnabledMap.set(originalSrc, true)
        return await enable()
      },
      disable() {
        translateEnabledMap.delete(originalSrc)
        return disable()
      },
      isEnabled: createMemo(() => processing() || translateMounted()),
    }
  }

  const TranslateAll: Component = () => {
    const [started, setStarted] = createSignal(false)
    const [total, setTotal] = createSignal(0)
    const [finished, setFinished] = createSignal(0)
    const [erred, setErred] = createSignal(false)

    return (
      <div
        data-transall="true"
        class={tw`inline-block mr-3 p-0 h-8 text-inherit leading-8 font-bold cursor-pointer`}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()

          if (started())
            return

          setStarted(true)
          setTotal(instances.size)

          const inc = () => {
            setFinished(finished() + 1)
          }
          const err = () => {
            setErred(true)
            inc()
          }

          for (const instance of instances.values()) {
            if (instance.isEnabled())
              inc()
            else instance.enable().then(inc).catch(err)
          }
        }}
      >
        <Switch>
          <Match when={!started()}>
            {t('common.control.batch', { count: instances.size })()}
          </Match>
          <Match when={finished() !== total()}>
            {t('common.batch.progress', {
              count: finished(),
              total: total(),
            })()}
          </Match>
          <Match when={finished() === total()}>
            <Show
              when={!erred()}
              fallback={t('common.batch.error')()}
            >
              {t('common.batch.finish')()}
            </Show>
          </Match>
        </Switch>
      </div>
    )
  }

  let disposeTransAll: (() => void) | undefined
  function refreshTransAll() {
    if (document.querySelector('.sc-emr523-2'))
      return
    const section = document.querySelector('.sc-181ts2x-0')
    if (section) {
      if (section.querySelector('[data-transall]'))
        return

      const container = document.createElement('div')
      section.appendChild(container)
      const dispose = render(() => <TranslateAll />, container)
      disposeTransAll = () => {
        dispose()
        container.remove()
      }
    }
    else {
      if (disposeTransAll) {
        disposeTransAll()
        disposeTransAll = undefined
      }
    }
  }
  onCleanup(() => {
    disposeTransAll?.()
  })

  let disposeMangaViewerTransAll: (() => void) | undefined
  function refreshManagaViewerTransAll() {
    const mangaViewer = document.querySelector('.gtm-manga-viewer-change-direction')?.parentElement?.parentElement
    if (mangaViewer) {
      if (disposeMangaViewerTransAll)
        return

      const container = document.createElement('div')
      mangaViewer.prepend(container)
      const dispose = render(() => <TranslateAll />, container)
      disposeMangaViewerTransAll = () => {
        dispose()
        container.remove()
      }
    }
    else {
      if (disposeMangaViewerTransAll) {
        disposeMangaViewerTransAll()
        disposeMangaViewerTransAll = undefined
      }
    }
  }
  onCleanup(() => {
    disposeMangaViewerTransAll?.()
  })

  createMutationObserver(
    document.body,
    { childList: true, subtree: true },
    throttle(() => {
      rescanImages()
      refreshTransAll()
      refreshManagaViewerTransAll()
    }, 200),
  )
  rescanImages()
  refreshTransAll()

  onCleanup(() => {
    images.clear()
    instances.forEach(instance => instance.dispose())
    instances.clear()
  })

  return {}
}

const translator: Translator = {
  match(url) {
    // https://www.pixiv.net/(en/)artworks/<id>
    return url.hostname.endsWith('pixiv.net') && url.pathname.match(/\/artworks\//)
  },
  mount,
}

export default translator
