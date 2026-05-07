import { Request } from 'express'
import { getPageAndLimitParams } from '../../src/utils/pagination'

/**
 * Test suite for pagination utility
 * Tests pagination parameter parsing and validation
 */
export function paginationUtilTest() {
    describe('Pagination Utilities', () => {
        describe('getPageAndLimitParams', () => {
            it('should return default -1 values when no params provided', () => {
                const mockReq = { query: {} } as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.page).toBe(-1)
                expect(result.limit).toBe(-1)
            })

            it('should parse page parameter correctly', () => {
                const mockReq = { query: { page: '2' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.page).toBe(2)
                expect(result.limit).toBe(-1)
            })

            it('should parse limit parameter correctly', () => {
                const mockReq = { query: { limit: '10' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.page).toBe(-1)
                expect(result.limit).toBe(10)
            })

            it('should parse both page and limit parameters', () => {
                const mockReq = { query: { page: '1', limit: '20' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.page).toBe(1)
                expect(result.limit).toBe(20)
            })

            it('should accept page=0', () => {
                const mockReq = { query: { page: '0' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.page).toBe(0)
            })

            it('should accept limit=0', () => {
                const mockReq = { query: { limit: '0' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.limit).toBe(0)
            })

            it('should accept page=-1 as the no-pagination sentinel', () => {
                const mockReq = { query: { page: '-1' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.page).toBe(-1)
            })

            it('should accept limit=-1 as the no-pagination sentinel', () => {
                const mockReq = { query: { limit: '-1' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.limit).toBe(-1)
            })

            it('should throw error for page below -1', () => {
                const mockReq = { query: { page: '-2' } } as unknown as Request

                expect(() => getPageAndLimitParams(mockReq)).toThrow('page cannot be negative')
            })

            it('should throw error for limit below -1', () => {
                const mockReq = { query: { limit: '-5' } } as unknown as Request

                expect(() => getPageAndLimitParams(mockReq)).toThrow('limit cannot be negative')
            })

            it('should handle large page numbers', () => {
                const mockReq = { query: { page: '1000000' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.page).toBe(1000000)
            })

            it('should handle large limit numbers', () => {
                const mockReq = { query: { limit: '500' } } as unknown as Request

                const result = getPageAndLimitParams(mockReq)

                expect(result.limit).toBe(500)
            })
        })
    })
}
