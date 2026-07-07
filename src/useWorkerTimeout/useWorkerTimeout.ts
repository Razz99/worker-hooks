import { useEffect, useRef } from 'react'

const WORKER_CODE = `
    self.onmessage = (event) => {
        const { delay } = event.data

        setTimeout(() => {
            self.postMessage({ type: 'timeout' })
        }, delay)
    }
`

/**
 * Options for the `useWorkerTimeout` hook.
 */
interface useWorkerTimeoutOptions {
  /** Called on the main thread once the timeout elapses. */
  callback: () => void
  /** Timeout duration in milliseconds. Pass `null` to disarm the timeout. */
  delay: number | null
  /**
   * Called when the worker encounters an error, or when Web Workers are not
   * supported in the current environment.
   *
   * @param error - The error from the worker.
   */
  onError?: (error: Error) => void
  /** Optional label for the worker, visible in browser DevTools. */
  workerName?: string
}

enum WorkerMessage {
  Timeout = 'timeout',
}

interface WorkerMessageEvent {
  type: WorkerMessage
}

/**
 * Runs a callback once after a delay using `setTimeout` running inside a Web
 * Worker, preventing the browser from throttling the timer in background or
 * inactive tabs.
 *
 * The callback always executes on the main thread. The timeout fires exactly
 * once; the worker is terminated immediately afterwards. `delay` is the sole
 * trigger: changing it tears down any pending worker and arms a fresh timeout.
 * To re-fire with the same numeric delay, toggle through `null`
 * (e.g. `1000 → null → 1000`).
 *
 * @param callback - Called on the main thread once the timeout elapses.
 * @param delay - Timeout duration in milliseconds. Pass `null` to disarm.
 * @param onError - Called when the worker encounters an error, or when Web
 *   Workers are not supported.
 * @param workerName - Optional label passed to the `Worker` constructor.
 *   Useful for identifying the worker in browser DevTools.
 */
export const useWorkerTimeout = ({
  callback,
  delay,
  onError,
  workerName,
}: useWorkerTimeoutOptions) => {
  const savedCallback = useRef(callback)
  const savedOnError = useRef(onError)
  const workerNameRef = useRef(workerName)

  useEffect(() => {
    savedCallback.current = callback
    savedOnError.current = onError
    workerNameRef.current = workerName
  }, [callback, onError, workerName])

  useEffect(() => {
    if (delay === null || delay < 0 || !Number.isFinite(delay)) {
      return
    }

    if (typeof Worker === 'undefined') {
      savedOnError.current?.(
        new Error('Web Workers are not supported in this environment.'),
      )
      return
    }

    const blobUrl = URL.createObjectURL(
      new Blob([WORKER_CODE], { type: 'application/javascript' }),
    )
    const worker = new Worker(
      blobUrl,
      workerNameRef.current ? { name: workerNameRef.current } : undefined,
    )

    let cleanedUp = false

    const cleanup = () => {
      if (cleanedUp) return

      worker.terminate()
      URL.revokeObjectURL(blobUrl)
      cleanedUp = true
    }

    worker.onmessage = (event: MessageEvent<WorkerMessageEvent>) => {
      if (event.data.type === WorkerMessage.Timeout) {
        savedCallback.current()
        cleanup()
      }
    }

    worker.onerror = (error) => {
      cleanup()
      savedOnError.current?.(new Error(`Worker error: ${error.message}`))
    }

    worker.postMessage({ delay })

    return () => cleanup()
  }, [delay])
}
