import { readFileSync } from 'fs'
import { join } from 'path'

import { MCPServerTransport } from '../../../Interface'

import { MCPPreset } from './types'
import githubPreset from './github'
import postgresqlPreset from './postgresql'
import memoryPreset from './memory'
import timePreset from './time'
import fetchPreset from './fetch'
import { isExecutableOnPath } from './probe'

export type { MCPPreset, PresetArgItem, PresetEnvValue, PresetArgCredentialRef, PresetEnvCredentialRef } from './types'
export { isExecutableOnPath, __resetPathProbeCache } from './probe'

/**
 * Source-of-truth preset list. Order is the order rendered on the preset
 * picker grid. New presets are added by dropping a `<id>.ts` file under
 * this directory, an `icons/<id>.svg` file beside it, and a line here.
 */
const PRESETS: MCPPreset[] = [githubPreset, postgresqlPreset, memoryPreset, timePreset, fetchPreset]

/**
 * Cache of inlined icon SVG content keyed by preset id. Populated lazily
 * on the first `getPresets()` / `getPreset()` call; survives the process
 * lifetime so we read each SVG once. Missing icon files yield an empty
 * string rather than throwing — the catalogue still loads and the UI
 * falls back to a generic placeholder.
 */
const iconCache = new Map<string, string>()

const loadIconSvg = (preset: MCPPreset): string => {
    const cached = iconCache.get(preset.id)
    if (cached !== undefined) return cached
    try {
        const svg = readFileSync(join(__dirname, 'icons', preset.icon), 'utf8')
        iconCache.set(preset.id, svg)
        return svg
    } catch {
        iconCache.set(preset.id, '')
        return ''
    }
}

/**
 * Resolves whether a preset's spawn command exists on the server's
 * PATH. Non-stdio presets (HTTP/SSE) are always available — no spawn
 * step. For stdio presets with no `command` declared (shouldn't happen
 * in practice but the type allows it) we err on the side of "available"
 * so the UI doesn't grey out a misconfigured-but-non-stdio entry.
 */
const probePresetAvailability = (preset: MCPPreset): { available: boolean; unavailableReason?: string } => {
    if (preset.transport !== MCPServerTransport.STDIO) return { available: true }
    if (!preset.command) return { available: true }
    if (isExecutableOnPath(preset.command)) return { available: true }
    return {
        available: false,
        unavailableReason: `Requires \`${preset.command}\` on the Chronos host PATH`
    }
}

/**
 * Returns the full preset catalogue with each preset's `iconSvg`
 * populated from disk and `available` / `unavailableReason` resolved
 * from a PATH probe over the declared `command`. Frozen copies are
 * returned so callers cannot mutate the cached list.
 */
export const getPresets = (): MCPPreset[] =>
    PRESETS.map((preset) => Object.freeze({ ...preset, iconSvg: loadIconSvg(preset), ...probePresetAvailability(preset) }))

/**
 * Returns one preset by id, or `undefined` if no preset with that id is
 * registered. Used by future per-preset endpoints if/when they're needed.
 */
export const getPreset = (id: string): MCPPreset | undefined => {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return undefined
    return Object.freeze({ ...preset, iconSvg: loadIconSvg(preset), ...probePresetAvailability(preset) })
}
