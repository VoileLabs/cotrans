import { defineBuildConfig } from 'unbuild'
import { version } from './package.json'
import { dbEnum } from './src/db'

function flattenObject(
  obj: Record<string, any>,
  parentKey = '',
  result: Record<string, unknown> = {},
) {
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const propName = parentKey ? `${parentKey}.${key}` : key
      if (
        (typeof obj[key] === 'object' && obj[key] !== null)
        || typeof obj[key] === 'function'
      )
        flattenObject(obj[key], propName, result)
      else
        result[propName] = JSON.stringify(obj[key])
    }
  }
  return result
}

export default defineBuildConfig({
  entries: [
    { input: 'src/index.ts', name: 'index' },
    { input: 'src/mitWorker/dObject.ts', name: 'doMitWorker' },
  ],
  declaration: true,
  replace: {
    'import.meta.env.VERSION': JSON.stringify(version),
    'import.meta.env.BUILD_TIME': JSON.stringify(new Date().toISOString()),
    ...flattenObject(dbEnum, 'dbEnum'),
  },
  rollup: {
    inlineDependencies: true,
    resolve: {
      exportConditions: ['browser'],
    },
  },
  hooks: {
    'rollup:options': (ctx, opt) => {
      const external = opt.external
      opt.external = []
      ctx.hooks.hook('rollup:dts:options', (ctx, opt) => {
        opt.external = external
      })
    },
  },
})
