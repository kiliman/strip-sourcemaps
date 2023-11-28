# Sourcemap Stripping CLI for Meta-Frameworks

Many meta-frameworks, such as Remix, incorporate both server-side and client-side code within a single file. Despite being organized into separate bundles, the resulting sourcemap still contains the original source code, which could potentially end up on the client-side.

This Command Line Interface (CLI) is designed to scan client-side sourcemaps and remove any server-side code references.

By default, it will remove ALL `import` statements and the following named `exports`: `loader` and `action`. However, you can customize these settings using the CLI options.

## Usage

To use this script, execute the following command:

```bash
npx strip-sourcemaps [options]
```

### Options

- `-h, --help`: Display help information.
- `-b, --build-path <path>`: Specify the path to the client build directory (default: `./public/build`).
- `-o, --output <path>`: Specify the path to the directory where the stripped sourcemaps will be saved (default: none). This can be useful for verifying that the code is stripped correctly.
- `-e, --exports <string>` (default: `loader,action`): Define a comma-separated list of exports to strip.
- `-i, --imports <string>` (default: `*`): Define a comma-separated list of imports to strip (supports `*` or an empty string).

Feel free to customize the CLI options to suit your specific requirements.

## Caveats

This initial version has the following limitations.

- Only the exported functions (default `loader` and `action`) are stripped. Any
  functions defined outside of these will not be stripped even if they are called
  by the `loader` or `action`
- Comments are not stripped that are outside of the exported function, so any
  secrets that are in comments may be exposed

```ts
// this comment will NOT be stripped out

function getMessage() {
  // this function will NOT be stripped out even though it's called by the loader
  return 'Hello World'
}

export function loader() {
  // the loader function WILL be stripped out
  const message = getMessage()
  return json({ message })
}
```

To verify what is removed, use the `--output` CLI argument to save the stripped
source files for review.

```bash
npx strip-sourcemaps --output ./stripped
```

## Work in progress

Future versions should eliminate these limitations. All comments outside of
functions will be removed by default. The tool will also trace external references
and strip functions and expressions that are only referenced by the server code.
