import * as fs from 'fs'

export function versionsServiceTest() {
    describe('Versions Service', () => {
        const origExistsSync = fs.existsSync
        const origReadFile = fs.promises.readFile

        beforeEach(() => {
            // eslint-disable-next-line no-import-assign
            Object.defineProperty(fs, 'existsSync', { value: jest.fn(), writable: true, configurable: true })
            Object.defineProperty(fs.promises, 'readFile', { value: jest.fn(), writable: true, configurable: true })
        })

        afterEach(() => {
            // eslint-disable-next-line no-import-assign
            Object.defineProperty(fs, 'existsSync', { value: origExistsSync, writable: true, configurable: true })
            Object.defineProperty(fs.promises, 'readFile', { value: origReadFile, writable: true, configurable: true })
        })

        const versionsService = require('../../src/services/versions').default

        describe('getVersion', () => {
            it('should return version from package.json', async () => {
                const mockPackageJson = JSON.stringify({ version: '1.2.3' })
                ;(fs.existsSync as jest.Mock).mockReturnValue(true)
                ;(fs.promises.readFile as jest.Mock).mockResolvedValue(mockPackageJson)

                const result = await versionsService.getVersion()
                expect(result).toHaveProperty('version', '1.2.3')
            })

            it('should check multiple paths to find package.json', async () => {
                const mockPackageJson = JSON.stringify({ version: '2.0.0' })
                ;(fs.existsSync as jest.Mock).mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true)
                ;(fs.promises.readFile as jest.Mock).mockResolvedValue(mockPackageJson)

                const result = await versionsService.getVersion()
                expect(result).toHaveProperty('version', '2.0.0')
                expect(fs.existsSync).toHaveBeenCalledTimes(3)
            })

            it('should throw error when package.json not found', async () => {
                ;(fs.existsSync as jest.Mock).mockReturnValue(false)
                await expect(versionsService.getVersion()).rejects.toThrow('Version not found')
            })

            it('should throw error when package.json cannot be read', async () => {
                ;(fs.existsSync as jest.Mock).mockReturnValue(true)
                ;(fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('Read error'))
                await expect(versionsService.getVersion()).rejects.toThrow('Version not found')
            })

            it('should throw error when package.json has invalid JSON', async () => {
                ;(fs.existsSync as jest.Mock).mockReturnValue(true)
                ;(fs.promises.readFile as jest.Mock).mockResolvedValue('invalid json')
                await expect(versionsService.getVersion()).rejects.toThrow()
            })
        })
    })
}
