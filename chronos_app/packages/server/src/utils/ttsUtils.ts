import { ICommonObject, convertTextToSpeechStream, IServerSideEventStreamer } from 'chronos-components'
import logger from './logger'
import { getErrorMessage } from '../errors/utils'

export const shouldAutoPlayTTS = (textToSpeechConfig: string | undefined | null): boolean => {
    if (!textToSpeechConfig) return false
    try {
        const config = typeof textToSpeechConfig === 'string' ? JSON.parse(textToSpeechConfig) : textToSpeechConfig
        for (const providerKey in config) {
            const provider = config[providerKey]
            if (provider && provider.status === true && provider.autoPlay === true) {
                return true
            }
        }
        return false
    } catch (error) {
        logger.error(`Error parsing textToSpeechConfig: ${getErrorMessage(error)}`)
        return false
    }
}

export const generateTTSForResponseStream = async (
    responseText: string,
    textToSpeechConfig: string | undefined,
    options: ICommonObject,
    chatId: string,
    chatMessageId: string,
    sseStreamer: IServerSideEventStreamer,
    abortController?: AbortController
): Promise<void> => {
    try {
        if (!textToSpeechConfig) return
        const config = typeof textToSpeechConfig === 'string' ? JSON.parse(textToSpeechConfig) : textToSpeechConfig

        let activeProviderConfig = null
        for (const providerKey in config) {
            const provider = config[providerKey]
            if (provider && provider.status === true) {
                activeProviderConfig = {
                    name: providerKey,
                    credentialId: provider.credentialId,
                    voice: provider.voice,
                    model: provider.model
                }
                break
            }
        }

        if (!activeProviderConfig) return

        await convertTextToSpeechStream(
            responseText,
            activeProviderConfig,
            options,
            abortController || new AbortController(),
            (format: string) => {
                sseStreamer.streamTTSStartEvent(chatId, chatMessageId, format)
            },
            (chunk: Buffer) => {
                const audioBase64 = chunk.toString('base64')
                sseStreamer.streamTTSDataEvent(chatId, chatMessageId, audioBase64)
            },
            () => {
                sseStreamer.streamTTSEndEvent(chatId, chatMessageId)
            }
        )
    } catch (error) {
        logger.error(`[server]: TTS streaming failed: ${getErrorMessage(error)}`)
        sseStreamer.streamTTSEndEvent(chatId, chatMessageId)
    }
}
