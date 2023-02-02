import type { Accessor, Component } from 'solid-js'
import { For, Show, createMemo, createRoot, createSignal, onCleanup } from 'solid-js'
import { Dynamic, Match, Switch, render } from 'solid-js/web'
import { createMutationObserver } from '@solid-primitives/mutation-observer'
import { throttle } from '@solid-primitives/scheduled'
import type { Translator, TranslatorInstance } from '../main'
import type { TranslateOptionsOverwrite } from '../utils/core'
import {
  downloadBlob,
  pullTranslationStatus,
  resizeToSubmit,
  submitTranslate,
} from '../utils/core'
import { t } from '../i18n'
import { formatProgress } from '../utils'
import {
  detectionResolution,
  renderTextOrientation,
  textDetector,
  translatorService,
} from '../composables/storage'
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
import IconCarbonTranslate from '~icons/carbon/translate'
import IconCarbonReset from '~icons/carbon/reset'
import IconCarbonChevronLeft from '~icons/carbon/chevron-left'
import IconCarbonChevronRight from '~icons/carbon/chevron-right'

function mount(): TranslatorInstance {
  interface Instance {
    imageNode: HTMLImageElement
    dispose: () => void
    enable: () => Promise<void>
    disable: () => void
    isEnabled: () => boolean
  }

  const images = new Set<HTMLImageElement>()
  const instances = new Map<HTMLImageElement, Instance>()
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

    const [buttonProcessing, setButtonProcessing] = createSignal(false)
    const [buttonTranslated, setButtonTranslated] = createSignal(false)
    const [buttonText, setButtonText] = createSignal<Accessor<string | undefined>>(() => undefined)
    const [buttonHint, setButtonHint] = createSignal('')

    // create a translate botton
    parent.style.position = 'relative'
    const container = document.createElement('div')
    parent.appendChild(container)
    onCleanup(() => {
      parent.removeChild(container)
    })

    const disposeButton = render(() => {
      const content = createMemo(() => buttonText() + buttonHint())

      const [advancedMenuOpen, setAdvancedMenuOpen] = createSignal(false)

      const [advDetectRes, setAdvDetectRes] = createSignal(detectionResolution())
      const advDetectResIndex = createMemo(() => detectResOptions.indexOf(advDetectRes()))
      const [advRenderTextDir, setAdvRenderTextDir] = createSignal(renderTextOrientation())
      const advRenderTextDirIndex = createMemo(() => renderTextDirOptions.indexOf(advRenderTextDir()))
      const [advTextDetector, setAdvTextDetector] = createSignal(textDetector())
      const advTextDetectorIndex = createMemo(() => textDetectorOptions.indexOf(advTextDetector()))
      const [advTranslator, setAdvTranslator] = createSignal(translatorService())
      const advTranslatorIndex = createMemo(() => translatorOptions.indexOf(advTranslator()))

      return (
        <div style={{
          'position': 'absolute',
          'z-index': '1',
          'bottom': '4px',
          'left': '8px',
        }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              'font-size': '16px',
              'line-height': '16px',
              'padding': '2px',
              'padding-left': translateMounted() ? '2px' : '24px',
              'border': '2px solid #D1D5DB',
              'border-radius': '6px',
              'background': '#fff',
              'cursor': 'default',
            }}>
              <Switch>
                <Match when={content()}>
                  {content()}
                </Match>
                <Match when={translateMounted()}>
                  <div style={{
                    width: '1px',
                    height: '16px',
                  }} />
                </Match>
                <Match when={true}>
                  <Show
                    when={advancedMenuOpen()}
                    fallback={(
                      <IconCarbonChevronRight
                        style={{ cursor: 'pointer' }}
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
                        'justify-content': 'space-between',
                        'align-items': 'center',
                        'padding-bottom': '2px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()

                        setAdvancedMenuOpen(false)
                      }}
                    >
                      <div>{t('settings.inline-options-title')()}</div>
                      <IconCarbonChevronLeft
                        style={{
                          'vertical-align': 'middle',
                          'cursor': 'pointer',
                        }}
                      />
                      <div style={{
                        'display': 'flex',
                        'flex-direction': 'column',
                        'gap': '4px',
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
                      </div>
                    </div>
                  </Show>
                </Match>
              </Switch>
              <div style={{
                'position': 'absolute',
                'left': '-5px',
                'top': '-2px',
                'background': '#fff',
                'border-radius': '24px',
              }}>
                {/* button */}
                <Dynamic
                  component={buttonTranslated() ? IconCarbonReset : IconCarbonTranslate}
                  style={{
                    'font-size': '18px',
                    'line-height': '18px',
                    'width': '18px',
                    'height': '18px',
                    'padding': '6px',
                    'cursor': 'pointer',
                  }}
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
                  style={{
                    'position': 'absolute',
                    'top': '0',
                    'left': '0',
                    'right': '0',
                    'bottom': '0',
                    'border': '2px solid #D1D5DB',
                    ...(buttonProcessing()
                      ? {
                          'border-top': '2px solid #7DD3FC',
                          'animation': 'imgtrans-spin 1s linear infinite',
                        }
                      : {}),
                    'border-radius': '24px',
                    'pointer-events': 'none',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )
    }, container)
    onCleanup(() => {
      disposeButton()
    })

    async function getTranslatedImage(optionsOverwrite?: TranslateOptionsOverwrite): Promise<string> {
      if (!optionsOverwrite && translatedImage)
        return translatedImage
      buttonDisabled = true
      const text = buttonText()
      setButtonHint('')
      setButtonProcessing(true)

      const status = (t: Accessor<string | undefined>) => setButtonText(() => t)

      status(t('common.source.download-image'))
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
              status(t('common.source.download-image-progress', {
                progress: formatProgress(e.loaded, e.total),
              }))
            }
          },
        }).catch((e) => {
          status(t('common.source.download-image-error'))
          throw e
        })
        originalImage = result.response as Blob
      }

      status(t('common.client.resize'))
      await new Promise<void>(resolve => queueMicrotask(resolve))
      const { blob: resizedImage, suffix: resizedSuffix } = await resizeToSubmit(originalImage, originalSrcSuffix)

      status(t('common.client.submit'))
      const task = await submitTranslate(
        resizedImage,
        resizedSuffix,
        {
          onProgress(progress) {
            status(t('common.client.submit-progress', { progress }))
          },
        },
        optionsOverwrite,
      ).catch((e) => {
        status(t('common.client.submit-error'))
        throw e
      })

      let maskUrl = task.result?.translation_mask
      if (!maskUrl) {
        status(t('common.status.pending'))
        const res = await pullTranslationStatus(task.id, (s) => {
          status(s)
        }).catch((e) => {
          status(e)
          throw e
        })
        maskUrl = res.translation_mask
      }

      status(t('common.client.download-image'))
      const mask = await downloadBlob(maskUrl, {
        onProgress(progress) {
          status(t('common.client.download-image-progress', { progress }))
        },
      }).catch((e) => {
        status(t('common.client.download-image-error'))
        throw e
      })
      const maskUri = URL.createObjectURL(mask)

      status(t('common.client.merging'))
      // layer translation_mask on top of original image
      const canvas = document.createElement('canvas')
      const canvasCtx = canvas.getContext('2d')!
      // draw original image
      const img = new Image()
      img.src = URL.createObjectURL(originalImage)
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

      status(text)
      setButtonProcessing(false)
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
        setButtonTranslated(true)
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
      setButtonTranslated(false)
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
      isEnabled: translateMounted,
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
        style={{
          'display': 'inline-block',
          'margin-right': '13px',
          'padding': '0',
          'color': 'inherit',
          'height': '32px',
          'line-height': '32px',
          'cursor': 'pointer',
          'font-weight': '700',
        }}
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
            {t('common.control.batch')}
          </Match>
          <Match when={finished() !== total()}>
            {t('common.batch.progress', {
              count: finished(),
              total: total(),
            })}
          </Match>
          <Match when={finished() === total()}>
            <Show
              when={!erred()}
              fallback={t('common.batch.error')}
            >
              {t('common.batch.finish')}
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
        section.removeChild(container)
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
        mangaViewer.removeChild(container)
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
    instances.forEach(instance => instance.dispose())
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
