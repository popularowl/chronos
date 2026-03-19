import { createMockQueryBuilder } from '../mocks/appServer.mock'

const getRunningExpressAppExports = require('../../src/utils/getRunningExpressApp')

export function addAgentflowsCountUtilTest() {
    describe('addAgentflowsCount util', () => {
        const mockQueryBuilder = createMockQueryBuilder()
        const mockRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder)
        }
        const mockAppServer = {
            AppDataSource: {
                getRepository: jest.fn().mockReturnValue(mockRepository)
            }
        }
        const origGetRunningExpressApp = getRunningExpressAppExports.getRunningExpressApp

        beforeEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = jest.fn().mockReturnValue(mockAppServer)
            mockQueryBuilder.getMany.mockReset()
        })

        afterEach(() => {
            getRunningExpressAppExports.getRunningExpressApp = origGetRunningExpressApp
        })

        const { addAgentflowsCount } = require('../../src/utils/addAgentflowsCount')

        it('should return keys with agentFlows count', async () => {
            const keys = [{ id: 'key-1', keyName: 'Test' }]
            mockQueryBuilder.getMany.mockResolvedValue([{ name: 'Flow 1', category: 'agentflow', updatedDate: new Date() }])

            const result = await addAgentflowsCount(keys)

            expect(result[0]).toHaveProperty('agentFlows')
            expect(result[0].agentFlows).toHaveLength(1)
        })

        it('should return empty array when no keys', async () => {
            const result = await addAgentflowsCount([])
            expect(result).toEqual([])
        })

        it('should handle undefined keys', async () => {
            const result = await addAgentflowsCount(undefined)
            expect(result).toBeUndefined()
        })

        it('should handle multiple keys with different agentflows', async () => {
            const keys = [
                { id: 'key-1', keyName: 'Key 1' },
                { id: 'key-2', keyName: 'Key 2' }
            ]
            mockQueryBuilder.getMany
                .mockResolvedValueOnce([{ name: 'Flow A', category: 'agentflow', updatedDate: new Date() }])
                .mockResolvedValueOnce([])

            const result = await addAgentflowsCount(keys)

            expect(result).toHaveLength(2)
            expect(result[0].agentFlows).toHaveLength(1)
            expect(result[1].agentFlows).toHaveLength(0)
        })

        it('should throw InternalChronosError on database error', async () => {
            mockQueryBuilder.getMany.mockRejectedValue(new Error('DB error'))

            await expect(addAgentflowsCount([{ id: 'key-1' }])).rejects.toThrow('Error: addAgentflowsCount')
        })
    })
}
