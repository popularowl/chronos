import express from 'express'

const PORT = parseInt(process.env.PORT ?? '8001', 10)
const CALLBACK_TOKEN = process.env.CALLBACK_TOKEN ?? ''

const stamp = () => new Date().toISOString()
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(`[example-agent ${stamp()}]`, ...args)

const app = express()
app.use(express.json({ limit: '10mb' }))

// One-line request log per inbound call so operators watching `docker compose
// logs example-agent` can see traffic arriving during demos.
app.use((req, _res, next) => {
    log(`${req.method} ${req.originalUrl}`)
    next()
})

app.get('/health', (_req, res) => {
    res.json({ ok: true })
})

app.post('/v1/chat/completions', async (req, res) => {
    const body = req.body ?? {}
    const messages: Array<{ role?: string; content?: string }> = Array.isArray(body.messages) ? body.messages : []
    const callbackUrl: string | undefined = body.x_chronos_callback_url ?? (req.header('x-chronos-callback-url') ?? undefined)
    const callId: string | undefined = body.x_chronos_call_id ?? (req.header('x-chronos-call-id') ?? undefined)

    const lastUser = [...messages].reverse().find((m) => m?.role === 'user')
    const userText = String(lastUser?.content ?? '')
    log(`chat/completions: callId=${callId ?? '(none)'} user=${JSON.stringify(userText)}`)
    const match = userText.match(/(\d+)\s*\+\s*(\d+)/)

    let assistantText: string
    if (match && callbackUrl && CALLBACK_TOKEN) {
        const a = parseInt(match[1], 10)
        const b = parseInt(match[2], 10)
        try {
            const callbackResp = await fetch(callbackUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${CALLBACK_TOKEN}`
                },
                body: JSON.stringify({
                    tool: 'reference.add',
                    params: { a, b },
                    callId
                })
            })
            const json = (await callbackResp.json().catch(() => ({}))) as Record<string, unknown>
            if (!callbackResp.ok) {
                assistantText = `Tool callback failed (${callbackResp.status}): ${JSON.stringify(json)}`
            } else {
                const result = (json.result ?? {}) as { content?: Array<{ type?: string; text?: string }> }
                const text = result.content?.find((c) => c?.type === 'text')?.text ?? JSON.stringify(result)
                assistantText = `${a} + ${b} = ${text}`
            }
        } catch (err) {
            assistantText = `Tool callback error: ${(err as Error).message ?? String(err)}`
        }
    } else if (match && !CALLBACK_TOKEN) {
        assistantText = `(no CALLBACK_TOKEN configured — set it from the Agent detail page) Echo: ${userText}`
    } else {
        assistantText = `Echo: ${userText}`
    }

    log(`chat/completions: replying assistant=${JSON.stringify(assistantText)}`)

    res.json({
        id: `chatcmpl-${callId ?? Math.random().toString(36).slice(2)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'example-agent',
        choices: [
            {
                index: 0,
                message: { role: 'assistant', content: assistantText },
                finish_reason: 'stop'
            }
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    })
})

app.listen(PORT, () => {
    log(`listening on :${PORT} (callback ${CALLBACK_TOKEN ? 'configured' : 'NOT configured'})`)
})
