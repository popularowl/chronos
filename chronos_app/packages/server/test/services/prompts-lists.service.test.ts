import axios from 'axios'

export function promptsListsServiceTest() {
    describe('Prompts Lists Service', () => {
        const origAxiosGet = axios.get

        beforeEach(() => {
            axios.get = jest.fn() as any
        })

        afterEach(() => {
            axios.get = origAxiosGet
        })

        const promptsListsService = require('../../src/services/prompts-lists').default

        describe('createPromptsList', () => {
            it('should return repos from LangChain Hub API', async () => {
                const mockRepos = [
                    { id: 'repo-1', name: 'prompt-template-1' },
                    { id: 'repo-2', name: 'prompt-template-2' }
                ]
                ;(axios.get as jest.Mock).mockResolvedValue({ data: { repos: mockRepos } })

                const result = await promptsListsService.createPromptsList({})

                expect(result).toEqual({ status: 'OK', repos: mockRepos })
                expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('https://api.hub.langchain.com/repos/'))
            })

            it('should include tags parameter when provided', async () => {
                const mockRepos = [{ id: 'repo-1', name: 'tagged-prompt' }]
                ;(axios.get as jest.Mock).mockResolvedValue({ data: { repos: mockRepos } })

                const result = await promptsListsService.createPromptsList({ tags: 'qa,chat' })

                expect(result).toEqual({ status: 'OK', repos: mockRepos })
                expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('tags=qa,chat'))
            })

            it('should return ERROR status when API call fails', async () => {
                ;(axios.get as jest.Mock).mockRejectedValue(new Error('Network error'))

                const result = await promptsListsService.createPromptsList({})

                expect(result).toEqual({ status: 'ERROR', repos: [] })
            })

            it('should return undefined when response has no repos', async () => {
                ;(axios.get as jest.Mock).mockResolvedValue({ data: {} })

                const result = await promptsListsService.createPromptsList({})

                expect(result).toBeUndefined()
            })
        })
    })
}
