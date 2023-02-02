import { start } from './main'
import eHentaiGallery from './eHentai/gallery'
import eHentaiPage from './eHentai/page'
import eHentaiSettings from './eHentai/settings'

start(
  [
    eHentaiGallery,
    eHentaiPage,
  ],
  [
    eHentaiSettings,
  ],
)
