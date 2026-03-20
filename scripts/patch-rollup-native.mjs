import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const nativeJsPath = new URL('../node_modules/rollup/dist/native.js', import.meta.url);

if (!existsSync(nativeJsPath)) {
  process.exit(0);
}

const source = readFileSync(nativeJsPath, 'utf8');
const needle =
  /const \{ parse, parseAsync, xxhashBase64Url, xxhashBase36, xxhashBase16 \} = requireWithFriendlyError\(\s*existsSync\(path\.join\(__dirname, localName\)\) \? localName : `@rollup\/rollup-\$\{packageBase\}`\s*\);/;

const replacement =
  "let rollupNative;\n" +
  "try {\n" +
  "\trollupNative = requireWithFriendlyError(\n" +
  "\t\texistsSync(path.join(__dirname, localName)) ? localName : `@rollup/rollup-${packageBase}`\n" +
  "\t);\n" +
  "} catch (error) {\n" +
  "\trollupNative = require('@rollup/wasm-node/dist/native.js');\n" +
  "}\n" +
  "\n" +
  "const { parse, parseAsync, xxhashBase64Url, xxhashBase36, xxhashBase16 } = rollupNative;";

if (
  !needle.test(source) &&
  !source.includes("rollupNative = require('@rollup/wasm-node');") &&
  !source.includes("rollupNative = require('@rollup/wasm-node/dist/native.js');")
) {
  process.exit(0);
}

if (source.includes("rollupNative = require('@rollup/wasm-node/dist/native.js');")) {
  process.exit(0);
}

writeFileSync(
  nativeJsPath,
  source
    .replace("rollupNative = require('@rollup/wasm-node');", "rollupNative = require('@rollup/wasm-node/dist/native.js');")
    .replace(needle, replacement)
);
