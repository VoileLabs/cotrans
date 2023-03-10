import { createMutationObserver } from '@solid-primitives/mutation-observer'
import { throttle } from '@solid-primitives/scheduled'
import { onCleanup } from 'solid-js'
import { render } from 'solid-js/web'
import { t } from '../i18n'
import type { SettingsInjector, SettingsInjectorInstance } from '../main'
import { Settings } from '../settings'

function mount(): SettingsInjectorInstance {
  let settingsTab: HTMLElement | undefined
  let disposeText: (() => void) | undefined
  const checkTab = () => {
    const tablist = document.querySelector('[role="tablist"]')
      || document.querySelector('[data-testid="loggedOutPrivacySection"]')
    if (!tablist) {
      if (disposeText) {
        disposeText()
        disposeText = undefined
      }
      return
    }

    if (tablist.querySelector(`div[data-imgtrans-settings-${EDITION}]`))
      return

    const inactiveRefrenceEl = Array.from(tablist.children)
      .find(el => el.children.length < 2 && el.querySelector('a'))
    if (!inactiveRefrenceEl)
      return

    settingsTab = inactiveRefrenceEl.cloneNode(true) as HTMLElement
    settingsTab.setAttribute(`data-imgtrans-settings-${EDITION}`, 'true')

    const textEl = settingsTab.querySelector('span')
    if (textEl) {
      while (textEl.firstChild)
        textEl.removeChild(textEl.firstChild)
      disposeText = render(() => t('settings.title')(), textEl)
      onCleanup(disposeText)
    }

    const linkEl = settingsTab.querySelector('a')
    if (linkEl)
      linkEl.href = `/settings/__imgtrans_${EDITION}`

    tablist.appendChild(settingsTab)
  }

  let disposeSettings: (() => void) | undefined
  const checkSettings = () => {
    const section = document.querySelector('[data-testid="error-detail"]')
      ?.parentElement?.parentElement as HTMLElement | null
    if (!section?.querySelector(`[data-imgtrans-settings-${EDITION}-section]`)) {
      if (disposeSettings) {
        disposeSettings()
        disposeSettings = undefined
      }
      if (!section)
        return
    }

    const title = `${t('settings.title')()} / Twitter`
    if (document.title !== title)
      document.title = title

    if (disposeSettings)
      return

    const errorPage = section.firstChild! as HTMLElement
    errorPage.style.display = 'none'

    const settingsContainer = document.createElement('div')
    settingsContainer.setAttribute(`data-imgtrans-settings-${EDITION}-section`, 'true')
    section.appendChild(settingsContainer)
    const disposeSettingsApp = render(() => {
      onCleanup(() => {
        errorPage.style.display = ''
      })

      return (
        <div style={{
          'padding-left': '16px',
          'padding-right': '16px',
        }}>
          <div style={{
            'display': 'flex',
            'height': '53px',
            'align-items': 'center',
          }}>
            <h2 style={{
              'font-size': '20px',
              'line-height': '24px',
            }}>
              {t('settings.title')()}
            </h2>
          </div>
          <Settings />
        </div>
      )
    }, settingsContainer)
    disposeSettings = () => {
      disposeSettingsApp()
      settingsContainer.remove()
    }
    onCleanup(disposeSettings)
  }

  createMutationObserver(
    document.body,
    { childList: true, subtree: true },
    throttle(() => {
      // since this throttled fn can be called after page navigation,
      // we need to check if the page is still the settings page.
      if (!location.pathname.startsWith('/settings'))
        return

      checkTab()

      if (location.pathname.match(`/settings/__imgtrans_${EDITION}`)) {
        if (settingsTab && settingsTab.children.length < 2) {
          settingsTab.style.backgroundColor = '#F7F9F9'
          const activeIndicator = document.createElement('div')
          activeIndicator.style.position = 'absolute'
          activeIndicator.style.zIndex = '1'
          activeIndicator.style.top = '0'
          activeIndicator.style.left = '0'
          activeIndicator.style.bottom = '0'
          activeIndicator.style.right = '0'
          activeIndicator.style.borderRight = '2px solid #1D9Bf0'
          activeIndicator.style.pointerEvents = 'none'
          settingsTab.appendChild(activeIndicator)
        }
        checkSettings()
      }
      else {
        if (settingsTab && settingsTab.children.length > 1) {
          settingsTab.style.backgroundColor = ''
          settingsTab.removeChild(settingsTab.lastChild!)
        }
        if (disposeSettings) {
          disposeSettings()
          disposeSettings = undefined
        }
      }
    }, 200),
  )

  return {
    canKeep(url) {
      return url.includes('twitter.com') && url.includes('/settings')
    },
  }
}

const settingsInjector: SettingsInjector = {
  match(url) {
    // https://twitter.com/settings/<tab>
    return url.hostname.endsWith('twitter.com')
      && (url.pathname === '/settings' || url.pathname.match(/^\/settings\//))
  },
  mount,
}

export default settingsInjector
