// k-sortable time based id generator
// with some help from ChatGPT, obviously
// "but it's not used anywhere?!" "shut up."

import { memo } from '../utils'

const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function convertToBase62(num: number) {
  let result = ''
  do {
    result = characters[num % 62] + result
    num = Math.floor(num / 62)
  } while (num > 0)
  return result
}

let sequenceNumber = 0

const machineId = memo(() => {
  // Generating a unique random machine identifier using crypto.getRandomValues
  const array = new Uint8Array(3)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => (`0${b.toString(16)}`).slice(-2)).join('')
})

export function createSortableId() {
  const timestamp = new Date().getTime()

  // Increment sequence number and reset if it's too large
  sequenceNumber = (sequenceNumber + 1) & 0xFFFFFF

  const base62Timestamp = convertToBase62(timestamp)
  const base62Sequence = convertToBase62(sequenceNumber).padStart(2, '0')

  // Combine timestamp, machineId, and sequenceNumber
  return base62Timestamp + machineId() + base62Sequence
}
