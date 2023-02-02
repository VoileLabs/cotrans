import type { SettingsInjector, SettingsInjectorInstance } from '../main'

function mount(): SettingsInjectorInstance {
  return {}
}

const settingsInjector: SettingsInjector = {
  match(url) {
    return false
  },
  mount,
}

export default settingsInjector
