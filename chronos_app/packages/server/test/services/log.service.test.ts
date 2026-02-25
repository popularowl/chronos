export function logServiceTest() {
    describe('Log Service', () => {
        const service = require('../../src/services/log').default

        describe('getLogs', () => {
            it('should throw when start date is not provided', async () => {
                await expect(service.getLogs(undefined, '2024-01-01-12')).rejects.toThrow(
                    'Error: logService.getLogs - No start date or end date provided'
                )
            })

            it('should throw when end date is not provided', async () => {
                await expect(service.getLogs('2024-01-01-12', undefined)).rejects.toThrow(
                    'Error: logService.getLogs - No start date or end date provided'
                )
            })

            it('should throw when both dates are not provided', async () => {
                await expect(service.getLogs()).rejects.toThrow('Error: logService.getLogs - No start date or end date provided')
            })

            it('should throw when start date is greater than end date', async () => {
                await expect(service.getLogs('2024-12-31-23', '2024-01-01-00')).rejects.toThrow(
                    'Error: logService.getLogs - Start date is greater than end date'
                )
            })

            it('should return empty array when no log files exist', async () => {
                // Use dates where no log files will exist on disk
                const result = await service.getLogs('2099-01-01-00', '2099-01-01-01')
                expect(result).toEqual([])
            })
        })
    })
}
