export class TTLSet<T> implements Set<T> {
  private map: Map<T, number> = new Map()
  private generatorPair: () => IterableIterator<[T, T]>
  private generator: () => IterableIterator<T>
  private lastCleanedAt = Date.now()

  constructor(public ttl: number) {
    const map = this.map
    this.generatorPair = function* (): IterableIterator<[T, T]> {
      const l = Date.now() - ttl
      for (const [key, t] of map.entries()) {
        if (t > l)
          yield [key, key]
      }
    }
    this.generator = function* (): IterableIterator<T> {
      const l = Date.now() - ttl
      for (const [key, t] of map.entries()) {
        if (t > l)
          yield key
      }
    }
  }

  add(value: T): this {
    const t = Date.now()

    if (t - this.lastCleanedAt > this.ttl) {
      this.lastCleanedAt = t
      for (const [key, t] of this.map.entries()) {
        if (t + this.ttl < t)
          this.map.delete(key)
      }
    }

    this.map.set(value, t)
    return this
  }

  clear(): void {
    this.map.clear()
  }

  delete(value: T): boolean {
    return this.map.delete(value)
  }

  forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
    this.map.forEach((_, key) => callbackfn(key, key, this), thisArg)
  }

  has(value: T): boolean {
    return (this.map.get(value) ?? 0) + this.ttl > Date.now()
  }

  get size(): number {
    return this.map.size
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.generator()
  }

  entries(): IterableIterator<[T, T]> {
    return this.generatorPair()
  }

  keys(): IterableIterator<T> {
    return this.generator()
  }

  values(): IterableIterator<T> {
    return this.generator()
  }

  [Symbol.toStringTag] = 'TTLSet'
}
