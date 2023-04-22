import { onCleanup } from 'solid-js'
import { render } from 'solid-js/web'
import { tw } from 'twind'
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
    <div class={tw`mb-2.5 pt-2.5 px-5 pb-4 bg-white border border-solid border-[#d6dee5]`}>
      <h2 class={tw`text-lg font-bold`}>
        {t('settings.title')()}
      </h2>
      <div class={tw`w-[665px] my-2.5 mx-auto`}>
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
