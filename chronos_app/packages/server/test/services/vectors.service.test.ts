import { Request } from 'express'

const upsertVectorExports = require('../../src/utils/upsertVector')

export function vectorsServiceTest() {
    describe('Vectors Service', () => {
        const origUpsertVector = upsertVectorExports.upsertVector
        let mockUpsertVector: jest.Mock

        beforeEach(() => {
            mockUpsertVector = jest.fn()
            upsertVectorExports.upsertVector = mockUpsertVector
        })

        afterEach(() => {
            upsertVectorExports.upsertVector = origUpsertVector
        })

        const vectorsService = require('../../src/services/vectors').default

        describe('upsertVectorMiddleware', () => {
            it('should call upsertVector with request and isInternal=false by default', async () => {
                const mockRequest = { body: { data: 'test' } } as Request
                const mockResult = { success: true, vectorIds: ['v1', 'v2'] }
                mockUpsertVector.mockResolvedValue(mockResult)

                const result = await vectorsService.upsertVectorMiddleware(mockRequest)

                expect(result).toEqual(mockResult)
                expect(mockUpsertVector).toHaveBeenCalledWith(mockRequest, false)
            })

            it('should call upsertVector with isInternal=true when specified', async () => {
                const mockRequest = { body: { data: 'test' } } as Request
                const mockResult = { success: true }
                mockUpsertVector.mockResolvedValue(mockResult)

                const result = await vectorsService.upsertVectorMiddleware(mockRequest, true)

                expect(result).toEqual(mockResult)
                expect(mockUpsertVector).toHaveBeenCalledWith(mockRequest, true)
            })

            it('should throw InternalChronosError when upsertVector fails', async () => {
                const mockRequest = { body: {} } as Request
                mockUpsertVector.mockRejectedValue(new Error('Vector store error'))

                await expect(vectorsService.upsertVectorMiddleware(mockRequest)).rejects.toThrow('Error: vectorsService.upsertVector')
            })
        })
    })
}
