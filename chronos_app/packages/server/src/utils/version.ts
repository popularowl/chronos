import { readFileSync } from 'fs'
import { join } from 'path'

let cached: string | null = null

/**
 * Read the running server package's semantic version from `package.json`.
 * Cached after first call. Returns `'0.0.0'` if the lookup fails — this is
 * a best-effort metadata fetch, never load-bearing for request handling.
 */
export const getServerVersion = (): string => {
    if (cached) return cached
    try {
        // package.json sits two levels above the compiled `dist/` (and the
        // source `src/`) directories, both at the package root.
        const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')) as { version?: string }
        cached = typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0'
    } catch {
        cached = '0.0.0'
    }
    return cached
}
