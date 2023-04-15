import eHentaiGallery from './eHentai/gallery'
import eHentaiPage from './eHentai/page'
import eHentaiSettings from './eHentai/settings'
import { start } from './main'

start(
  [
    eHentaiGallery,
    eHentaiPage,
  ],
  [
    eHentaiSettings,
  ],
)
