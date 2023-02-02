import { onCleanup } from 'solid-js'
import { render } from 'solid-js/web'
import { t } from '../i18n'
import type { SettingsInjector, SettingsInjectorInstance } from '../main'
import { Settings } from '../settings'

function mount(): SettingsInjectorInstance {
  const wrapper = document.getElementById('wrapper')
  if (!wrapper)
    return {}

  const adFooter = wrapper.querySelector('.ad-footer')
  if (!adFooter)
    return {}

  const settingsContainer = document.createElement('div')
  onCleanup(() => {
    settingsContainer.remove()
  })

  const disposeSettings = render(() => (
    <div style={{
      'padding': '10px 20px 15px',
      'margin-bottom': '10px',
      'background': '#fff',
      'border': '1px solid #d6dee5',
    }}>
      <h2 style={{
        'font-size': '18px',
        'font-weight': 'bold',
      }}>
        {t('settings.title')()}
      </h2>
      <div style={{
        width: '665px',
        margin: '10px auto',
      }}>
        <Settings
          itemOrientation="horizontal"
          textStyle={{
            'width': '185px',
            'font-weight': 'bold',
          }}
        />
      </div>
    </div>
  ), settingsContainer)
  onCleanup(disposeSettings)

  wrapper.insertBefore(settingsContainer, adFooter)

  return {}
}

const settingsInjector: SettingsInjector = {
  match(url) {
    // https://www.pixiv.net/setting_user.php
    return url.hostname.endsWith('pixiv.net') && url.pathname.match(/\/setting_user\.php/)
  },
  mount,
}

export default settingsInjector
