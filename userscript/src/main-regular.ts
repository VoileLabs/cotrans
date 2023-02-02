import { start } from './main'
import pixiv from './pixiv'
import twitter from './twitter'
import pixivSettings from './pixiv/settings'
import twitterSettings from './twitter/settings'

start(
  [
    pixiv,
    twitter,
  ],
  [
    pixivSettings,
    twitterSettings,
  ],
)
