/* eslint-disable */
/**
 * Copies non-TypeScript preset assets (SVG icons) from src/ to dist/ after
 * `tsc` runs. The MCP-server preset loader reads icon SVGs synchronously
 * from `<__dirname>/icons/<file>.svg` at module init — in dev mode
 * `__dirname` resolves into the source tree so the SVGs are reachable,
 * but a production build runs from `dist/` and `tsc` does not copy
 * non-`.ts` files. Run as part of the `build` script.
 */
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SRC_ICONS = path.join(PROJECT_ROOT, 'src', 'services', 'mcp-gateway', 'presets', 'icons')
const DST_ICONS = path.join(PROJECT_ROOT, 'dist', 'services', 'mcp-gateway', 'presets', 'icons')

if (!fs.existsSync(SRC_ICONS)) {
    console.warn(`[copy-preset-assets] source icons folder missing: ${SRC_ICONS}`)
    process.exit(0)
}

fs.mkdirSync(DST_ICONS, { recursive: true })
fs.cpSync(SRC_ICONS, DST_ICONS, { recursive: true })
console.log(`[copy-preset-assets] copied preset icons → ${path.relative(PROJECT_ROOT, DST_ICONS)}`)
