import { existsSync, statSync } from 'fs'
import { delimiter, isAbsolute, join } from 'path'

/**
 * Cache of PATH-probe results keyed by command name. The host's PATH
 * is fixed for the process lifetime so one lookup per binary is enough.
 * Exported for tests that need to reset the cache between cases.
 */
const pathCache = new Map<string, boolean>()

/**
 * Returns true when `command` resolves to an executable file via the
 * server's PATH, false otherwise. Absolute commands (`/usr/bin/foo`)
 * are checked directly; bare names are searched across PATH entries.
 * The check is synchronous so the catalogue endpoint stays a single
 * round-trip — PATH lookups for a handful of presets are negligible.
 *
 * Windows note: PATHEXT is not consulted because Chronos's supported
 * Docker images and reference deployments are POSIX. A future Windows
 * runtime would need to iterate `[''] + PATHEXT.split(';')`.
 */
export const isExecutableOnPath = (command: string): boolean => {
    if (!command) return false
    const cached = pathCache.get(command)
    if (cached !== undefined) return cached

    let found = false
    if (isAbsolute(command)) {
        try {
            found = existsSync(command) && statSync(command).isFile()
        } catch {
            found = false
        }
    } else {
        const dirs = (process.env.PATH || '').split(delimiter)
        for (const dir of dirs) {
            if (!dir) continue
            const candidate = join(dir, command)
            try {
                if (existsSync(candidate) && statSync(candidate).isFile()) {
                    found = true
                    break
                }
            } catch {
                // unreadable PATH entry — fall through to the next
            }
        }
    }

    pathCache.set(command, found)
    return found
}

/** Test-only — clears the PATH cache so probe assertions can be deterministic. */
export const __resetPathProbeCache = (): void => {
    pathCache.clear()
}
