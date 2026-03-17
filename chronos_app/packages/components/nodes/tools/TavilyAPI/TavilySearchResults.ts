/**
 * Local implementation of TavilySearchResults tool.
 *
 * This replaces the deprecated `@langchain/community/tools/tavily_search` module
 * which was removed in @langchain/community v1.x. The recommended upstream replacement
 * is the `@langchain/tavily` package. This local shim provides a compatible Tool
 * subclass that calls the Tavily Search API directly.
 */
import { Tool, type ToolParams } from '@langchain/core/tools'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getEnvironmentVariable } from '@langchain/core/utils/env'

/** Configuration options for the TavilySearchResults tool. */
export interface TavilySearchResultsConfig extends ToolParams {
    /** Maximum number of search results to return. Defaults to 5. */
    maxResults?: number
    /** Tavily API key. Falls back to TAVILY_API_KEY env var. */
    apiKey?: string
    /** Include images in results. */
    includeImages?: boolean
    /** Include image descriptions. */
    includeImageDescriptions?: boolean
    /** Include an LLM-generated answer. */
    includeAnswer?: boolean
    /** Include raw HTML content. */
    includeRawContent?: boolean
    /** Domains to include in results. */
    includeDomains?: string[]
    /** Domains to exclude from results. */
    excludeDomains?: string[]
    /** Search depth: "basic" or "advanced". */
    searchDepth?: 'basic' | 'advanced'
    /** Search topic category. */
    topic?: string
    /** Number of days back for news topic. */
    days?: number
    /** Time range filter for results. */
    timeRange?: string
    /** Number of content chunks per source. */
    chunksPerSource?: number
    /** Additional keyword arguments for the API. */
    kwargs?: Record<string, unknown>
}

/**
 * Tool that calls the Tavily Search API and returns JSON results.
 * Compatible with the removed @langchain/community TavilySearchResults class.
 */
export class TavilySearchResults extends Tool {
    static lc_name(): string {
        return 'TavilySearchResults'
    }

    name = 'tavily_search_results_json'

    description =
        'A search engine optimized for comprehensive, accurate, and trusted results. ' +
        'Useful for when you need to answer questions about current events. ' +
        'Input should be a search query.'

    protected maxResults: number
    protected apiKey?: string
    protected kwargs: Record<string, unknown>
    protected includeImages?: boolean
    protected includeImageDescriptions?: boolean
    protected includeAnswer?: boolean
    protected includeRawContent?: boolean
    protected includeDomains?: string[]
    protected excludeDomains?: string[]
    protected searchDepth?: 'basic' | 'advanced'
    protected topic?: string
    protected days?: number
    protected timeRange?: string
    protected chunksPerSource?: number

    constructor(fields?: TavilySearchResultsConfig) {
        super(fields ?? {})
        this.maxResults = fields?.maxResults ?? 5
        this.apiKey = fields?.apiKey ?? getEnvironmentVariable('TAVILY_API_KEY')
        this.kwargs = fields?.kwargs ?? {}
        this.includeImages = fields?.includeImages
        this.includeImageDescriptions = fields?.includeImageDescriptions
        this.includeAnswer = fields?.includeAnswer
        this.includeRawContent = fields?.includeRawContent
        this.includeDomains = fields?.includeDomains
        this.excludeDomains = fields?.excludeDomains
        this.searchDepth = fields?.searchDepth
        this.topic = fields?.topic
        this.days = fields?.days
        this.timeRange = fields?.timeRange
        this.chunksPerSource = fields?.chunksPerSource
    }

    /** @internal */
    async _call(input: string, _runManager?: CallbackManagerForToolRun): Promise<string> {
        const body: Record<string, unknown> = {
            query: input,
            max_results: this.maxResults,
            api_key: this.apiKey,
            ...this.kwargs
        }

        if (this.includeImages) body.include_images = this.includeImages
        if (this.includeImageDescriptions) body.include_image_descriptions = this.includeImageDescriptions
        if (this.includeAnswer) body.include_answer = this.includeAnswer
        if (this.includeRawContent) body.include_raw_content = this.includeRawContent
        if (this.includeDomains?.length) body.include_domains = this.includeDomains
        if (this.excludeDomains?.length) body.exclude_domains = this.excludeDomains
        if (this.searchDepth) body.search_depth = this.searchDepth
        if (this.topic) body.topic = this.topic
        if (this.days) body.days = this.days
        if (this.timeRange) body.time_range = this.timeRange
        if (this.chunksPerSource) body.chunks_per_source = this.chunksPerSource

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })

        if (!response.ok) {
            throw new Error(`Tavily API error: ${response.status} ${response.statusText}`)
        }

        const json = await response.json()
        return JSON.stringify(json.results ?? json)
    }
}
