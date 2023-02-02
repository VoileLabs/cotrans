import type { Translator, TranslatorInstance } from '../main'

function mount(): TranslatorInstance {
  return {}
}

const translator: Translator = {
  match(url) {
    // https://e-hentai.org/s/<token>/<id>-<num>
    // https://exhentai.org/s/<token>/<id>-<num>
    // https://exhentai55ld2wyap5juskbm67czulomrouspdacjamjeloj7ugjbsad.onion/s/<token>/<id>-<num>
    return false
  },
  mount,
}

export default translator
