#!/usr/bin/env node

import { parseFromFiles } from '@ts-ast-parser/core'
import { parseArgs } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'

type SourceMapType = {
  version: number
  file: string
  sources: string[]
  sourcesContent: string[]
  names: string[]
  mappings: string
}

type SourceMapEntry = {
  sourcePath: string
  mapPath: string
  content: string
}

;(async function () {
  await main()
})()

async function main() {
  const options = {
    help: {
      type: 'boolean',
      short: 'h',
    },
    'build-path': {
      type: 'string',
      short: 'b',
      default: './public/build',
    },
    output: {
      type: 'string',
      short: 'o',
    },
    exports: {
      type: 'string',
      short: 'e',
      default: 'loader,action',
    },
    imports: {
      type: 'string',
      short: 'i',
      default: '*',
    },
  }

  const { values } = parseArgs({ args: process.argv.slice(2), options } as any)

  if (values.help) {
    usage()
    process.exit(0)
  }
  let buildPath = String(values['build-path'])

  if (!fs.existsSync(buildPath)) {
    console.error(`Build path ${buildPath} does not exist.\n\n`)
    usage()
    process.exit(1)
  }

  const sourceMaps = await getSourceMaps(buildPath)

  console.log(`Found ${sourceMaps.length} source maps.`)

  await stripSourceMaps(sourceMaps, values as any)
}

function usage() {
  console.log(
    `USAGE: strip-sourcemaps [options]
This script strips server source code from the sourcemaps in the [build-path].

options:
-h, --help
  show help
-b, --build-path <path>
  path to the client build directory (default: ./public/build)
-o, --output <path>
  path to the stripped output directory (default: none)
  useful for verifying that the code is stripped correctly
-e, --exports <string> (default: loader,action)
  comma-separated list of exports to strip
-i, --imports <string> (default: *)
  comma-separated list of imports to strip (only supports * or empty string)
`,
  )
}

async function getSourceMaps(buildPath: string) {
  const sourceMaps: SourceMapEntry[] = []
  const appDir = path.resolve('./app/') + '/'
  const files = fs.readdirSync(buildPath, { recursive: true }) as string[]
  for (const file of files) {
    if (!file.endsWith('.js.map')) continue
    if (path.basename(file).startsWith('entry.client-')) continue

    const filePath = path.join(buildPath, file)
    const content = fs.readFileSync(filePath, 'utf8')

    // check if the source file is from the app directory
    const sourceMap = JSON.parse(content) as SourceMapType
    const sourcePath = sourceMap.sources
      .map((source: string) => path.resolve(path.dirname(filePath), source))
      .find((source: string) => source.startsWith(appDir))
    if (sourcePath) {
      sourceMaps.push({
        sourcePath,
        mapPath: filePath,
        content,
      })
    }
  }

  return sourceMaps
}

async function stripSourceMaps(
  sourceMaps: SourceMapEntry[],
  options: { output: string; exports: string; imports: string },
) {
  const sourceFiles = sourceMaps.map(({ sourcePath }) => sourcePath)
  console.log(sourceFiles)
  const { project, errors } = await parseFromFiles(sourceFiles, {
    tsConfigFilePath: './tsconfig.json',
    skipDiagnostics: true,
  })

  if (errors.length > 0) {
    console.error(errors[0])
    // Handle the errors
    process.exit(1)
  }

  let modules = project!.getModules()

  for (let i = 0; i < modules.length; i++) {
    let module = modules[i]
    let imports = module.getImports()
    let exports = module.getExports()
    let code = (module as any)._node.text

    // strip specified imports - only supports all (*) or none (empty string)
    if (options.imports === '*') {
      for (let $import of imports) {
        code = stripCode(code, $import)
      }
    }

    // strip specified exports
    let filterExports = (d: any) =>
      options.exports.split(',').includes(d.getName())

    for (let $export of exports.filter(filterExports)) {
      code = stripCode(code, $export)
    }

    // update map file with stripped code
    let sourceMap = JSON.parse(sourceMaps[i].content) as SourceMapType
    for (let i = 0; i < sourceMaps.length; i++) {
      if (sourceMaps[i].sourcePath === (module as any)._node.fileName) {
        sourceMap.sourcesContent[sourceMap.sourcesContent.length - 1] = code
      }
    }

    fs.writeFileSync(sourceMaps[i].mapPath, JSON.stringify(sourceMap))

    // write stripped code to file if output path is specified
    if (options.output) {
      let outputPath = path.join(
        options.output,
        path.relative('.', sourceMaps[i].sourcePath),
      )
      console.log(outputPath)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, code)
    }
  }
}

function stripCode(code: string, declaration: any) {
  let { pos, end } = declaration._node
  let snippet = code.slice(pos, end)
  // replace all characters except newlines with spaces
  let blank = snippet.replace(/[^\n]/g, ' ')
  console.assert(blank.length === snippet.length)
  return code.slice(0, pos) + blank + code.slice(end)
}
