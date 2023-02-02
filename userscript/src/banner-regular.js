// ==UserScript==
// @name              Cotrans Manga Translator (Regular Edition)
// @name:zh-CN        Cotrans 图片翻译器 (常规版)
// @namespace         https://cotrans.touhou.ai/userscript/#regular
// @version           {{version}}
// @description       (WIP) Translate texts in images on Pixiv, Twitter
// @description:zh-CN (WIP) 一键翻译图片内文字，支持 Pixiv、Twitter
// @author            QiroNT
// @license           GPL-3.0
// @contributionURL   https://ko-fi.com/voilelabs
// @supportURL        https://github.com/VoileLabs/cotrans/issues
// @source            https://github.com/VoileLabs/cotrans
// @include http*://www.pixiv.net/*
// @match http://www.pixiv.net/
// @include http*://twitter.com/*
// @match http://twitter.com/
// @connect pixiv.net
// @connect pximg.net
// @connect twitter.com
// @connect twimg.com
// @connect api.cotrans.touhou.ai
// @connect cotrans-r2.moe.ci
// @connect *
// @grant GM.xmlHttpRequest
// @grant GM_xmlhttpRequest
// @grant GM.setValue
// @grant GM_setValue
// @grant GM.getValue
// @grant GM_getValue
// @grant GM.deleteValue
// @grant GM_deleteValue
// @grant GM.addValueChangeListener
// @grant GM_addValueChangeListener
// @grant GM.removeValueChangeListener
// @grant GM_removeValueChangeListener
// @grant window.onurlchange
// @run-at document-end
// ==/UserScript==

/* eslint-disable no-undef, unused-imports/no-unused-vars */
const VERSION = '{{version}}'
const EDITION = 'regular'
let GMP
{
  // polyfill functions
  const GMPFunctionMap = {
    xmlHttpRequest: typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : undefined,
    setValue: typeof GM_setValue !== 'undefined' ? GM_setValue : undefined,
    getValue: typeof GM_getValue !== 'undefined' ? GM_getValue : undefined,
    deleteValue: typeof GM_deleteValue !== 'undefined' ? GM_deleteValue : undefined,
    addValueChangeListener: typeof GM_addValueChangeListener !== 'undefined' ? GM_addValueChangeListener : undefined,
    removeValueChangeListener: typeof GM_removeValueChangeListener !== 'undefined' ? GM_removeValueChangeListener : undefined,
  }
  const xmlHttpRequest = GM.xmlHttpRequest.bind(GM) || GMPFunctionMap.xmlHttpRequest
  GMP = new Proxy(GM, {
    get(target, prop) {
      if (prop === 'xmlHttpRequest') {
        return (context) => {
          return new Promise((resolve, reject) => {
            xmlHttpRequest({
              ...context,
              onload(event) {
                context.onload?.()
                resolve(event)
              },
              onerror(event) {
                context.onerror?.()
                reject(event)
              },
            })
          })
        }
      }
      if (prop in target) {
        const v = target[prop]
        return typeof v === 'function' ? v.bind(target) : v
      }
      if (prop in GMPFunctionMap && typeof GMPFunctionMap[prop] === 'function')
        return GMPFunctionMap[prop]

      console.error(`[Cotrans Manga Translator] GM.${prop} isn't supported in your userscript engine and it's required by this script. This may lead to unexpected behavior.`)
    },
  })
}
