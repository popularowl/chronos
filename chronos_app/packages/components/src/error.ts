type ErrorWithMessage = {
    message: string
}

const isErrorWithMessage = (error: unknown): error is ErrorWithMessage => {
    return (
        typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string'
    )
}

const toErrorWithMessage = (maybeError: unknown): ErrorWithMessage => {
    if (isErrorWithMessage(maybeError)) return maybeError

    try {
        return new Error(JSON.stringify(maybeError))
    } catch {
        // fallback in case there's an error stringifying the maybeError
        // like with circular references for example.
        return new Error(String(maybeError))
    }
}

export const getErrorMessage = (error: unknown): string => {
    const message = toErrorWithMessage(error).message
    if (typeof error === 'object' && error !== null && 'cause' in error && error.cause) {
        const causeMsg = getErrorMessage(error.cause)
        if (causeMsg && causeMsg !== message) {
            return `${message} [Cause: ${causeMsg}]`
        }
    }
    return message
}
