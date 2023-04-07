import fs from 'node:fs'
import glob from 'fast-glob'
import { defineConfig } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import esbuild from 'rollup-plugin-esbuild'
import icons from 'unplugin-icons/rollup'
import yaml from '@rollup/plugin-yaml'
import { babel } from '@rollup/plugin-babel'
import info from './package.json' assert { type: 'json' }

function gennerateConfig(input, output, banner) {
  return defineConfig({
    input,
    output: {
      dir: 'dist',
      entryFileNames: output,
      format: 'iife',
      generatedCode: 'es2015',
      banner: fs
        .readFileSync(banner, 'utf8')
        .replace(/{{version}}/g, info.version),
      footer: `\n${glob.sync([
        '../LICENSE',
        'src/**/LICENSE*',
        'node_modules/solid-js/LICENSE',
        'node_modules/@solid-primitives/**/LICENSE',
      ], { onlyFiles: true })
        .map(file => `/*\n${fs.readFileSync(file, 'utf8').trimEnd()}\n*/`)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join('\n\n')}`,
    },
    treeshake: 'smallest',
    plugins: [
      nodeResolve(),
      commonjs(),
      yaml(),
      icons({
        compiler: 'solid',
      }),
      esbuild({
        charset: 'utf8',
        target: 'es2020',
      }),
      babel({
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        babelHelpers: 'bundled',
        presets: [
          ['babel-preset-solid', {
            delegateEvents: false,
          }],
        ],
      }),
    ],
  })
}

export default [
  gennerateConfig('src/main-regular.ts', 'imgtrans-userscript.user.js', 'src/banner-regular.js'),
  gennerateConfig('src/main-nsfw.ts', 'imgtrans-userscript-nsfw.user.js', 'src/banner-nsfw.js'),
]
