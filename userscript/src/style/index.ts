const css = `
@keyframes imgtrans-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
`
const cssEl = document.createElement('style')
cssEl.innerHTML = css

export function checkCSS() {
  if (!document.head.contains(cssEl))
    document.head.appendChild(cssEl)
}
