const getDataSourceExports = require('../../src/DataSource')

export function initializeUserUtilTest() {
    describe('initializeUser util', () => {
        const origEnv = process.env.CHRONOS_INITIAL_USER
        const origGetDataSource = getDataSourceExports.getDataSource

        afterEach(() => {
            if (origEnv === undefined) {
                delete process.env.CHRONOS_INITIAL_USER
            } else {
                process.env.CHRONOS_INITIAL_USER = origEnv
            }
            getDataSourceExports.getDataSource = origGetDataSource
        })

        const { initializeInitialUser } = require('../../src/utils/initializeUser')

        it('should skip when CHRONOS_INITIAL_USER is not set', async () => {
            delete process.env.CHRONOS_INITIAL_USER

            // Should not throw
            await initializeInitialUser()
        })

        it('should skip when CHRONOS_INITIAL_USER has invalid format (no colon)', async () => {
            process.env.CHRONOS_INITIAL_USER = 'invalidemail'

            await initializeInitialUser()
        })

        it('should skip when users already exist in database', async () => {
            process.env.CHRONOS_INITIAL_USER = 'test@example.com:password123'

            const mockRepo = { count: jest.fn().mockResolvedValue(5) }
            getDataSourceExports.getDataSource = jest.fn().mockReturnValue({
                getRepository: jest.fn().mockReturnValue(mockRepo)
            })

            await initializeInitialUser()

            expect(mockRepo.count).toHaveBeenCalled()
        })

        it('should skip when password is too short', async () => {
            process.env.CHRONOS_INITIAL_USER = 'test@example.com:short'

            const mockRepo = { count: jest.fn().mockResolvedValue(0) }
            getDataSourceExports.getDataSource = jest.fn().mockReturnValue({
                getRepository: jest.fn().mockReturnValue(mockRepo)
            })

            await initializeInitialUser()
        })

        it('should skip when email or password is empty', async () => {
            process.env.CHRONOS_INITIAL_USER = ':password123'

            await initializeInitialUser()
        })
    })
}
