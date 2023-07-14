/**
 * @example
 * const en = createEnum(['!removed', '~deprecated', 'normal'])
 * en.removed // never
 * en.deprecated // never
 * en.normal // 3
 * en(number) // 'normal' | 'deprecated'
 * type Union = keyof typeof en // 'normal'
 * type UnionDeprecated = ReturnType<typeof en> // 'normal' | 'deprecated'
 */
function createEnum<
  const T extends readonly string[],
  K extends T[number],
  U extends Range<T['length']>,
>(values: T):
& { [I in U as Exclude<T[I], `~${string}` | `!${string}`>]: PlusOne<I> }
& ((i: number) => K extends `~${infer S}` ? S : Exclude<K, `!${string}`>) {
  const reverse = values.map(v => v[0] === '!' ? undefined : v[0] === '~' ? v.slice(1) : v)
  return Object.assign(
    (i: number) => reverse[i - 1],
    Object.fromEntries(
      values
        .filter(v => v[0] !== '~' && v[0] !== '!')
        .map((v, i) => [v, i + 1]),
    ),
  ) as never
}
type Range<N, C extends 0[] = [0], I = 0> =
  C['length'] extends N ? I : Range<N, [...C, 0], C['length'] | I>
type PlusOne<N, C extends 0[] = [0], B extends 0[] = []> =
  B['length'] extends N ? C['length'] : PlusOne<N, [...C, 0], C>

export const dbEnum = {
  taskState: createEnum(['pending', 'running', 'done', 'error']),
  taskLanguage: createEnum(['CHS', 'CHT', 'CSY', 'NLD', 'ENG', 'FRA', 'DEU', 'HUN', 'ITA', 'JPN', 'KOR', 'PLK', 'PTB', 'ROM', 'RUS', 'ESP', 'TRK', 'UKR', 'VIN']),
  taskDetector: createEnum(['default', 'ctd']),
  taskDirection: createEnum(['auto', 'h', 'v']),
  taskTranslator: createEnum(['gpt3.5', 'youdao', 'baidu', 'google', 'deepl', 'papago', 'offline', 'none', 'original']),
  taskSize: createEnum(['S', 'M', 'L', 'X']),
}
