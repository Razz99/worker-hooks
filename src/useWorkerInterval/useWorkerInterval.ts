import { useEffect, useRef } from 'react'

const WORKER_CODE = `
    self.onmessage = (event) => {
        const { delay, continueOnWakeup } = event.data

        let lastTickTime = Date.now()

        setInterval(() => {
            const now = Date.now()
            const elapsedTime = now - lastTickTime

            // 300ms grace period absorbs normal timer jitter so we only flag a
            // genuine system sleep, not elapsedTime calculation drift. When
            // continueOnWakeup is true, sleep detection is skipped and the interval silently resumes.
            if (!continueOnWakeup && elapsedTime > delay + 300) {
                postMessage({ type: 'sleepDetected' })
                return
            }

            self.postMessage({ type: 'tick' })
            lastTickTime = now
        }, delay)
    }
`

/**
 * Options for the `useWorkerInterval` hook.
 */
interface useWorkerIntervalOptions {
  /** Called on the main thread on every interval tick. */
  callback: () => void
  /** Interval duration in milliseconds. Pass `null` to pause the interval. */
  delay: number | null
  /**
   * Called when the worker encounters an error, or when system sleep stops the
   * interval (only when `continueOnWakeup` is `false`).
   *
   * @param error - The error from the worker or sleep detection.
   * @param sleepDetected - `true` when the cause of the error was system sleep; `false` for all other worker errors.
   */
  onError?: (error: Error, sleepDetected: boolean) => void
  /**
   * When `true` (default value is `true`), the interval silently resumes after system sleep.
   * When `false`, the interval stops on wakeup and `onError` is called with
   * `sleepDetected = true`.
   *
   * Note: changing this value after mount does not restart the worker. The
   * value is captured when the worker is created and only takes effect on the
   * next worker start (i.e. when `delay` changes).
   */
  continueOnWakeup?: boolean
  /** Optional label for the worker, visible in browser DevTools. */
  workerName?: string
}

enum WorkerMessage {
  Tick = 'tick',
  SleepDetected = 'sleepDetected',
}

interface WorkerMessageEvent {
  type: WorkerMessage
}

/**
 * Runs a repeated callback at a fixed interval using `setInterval` running inside a
 * Web Worker, preventing the browser from throttling the timer in background
 * or inactive tabs.
 *
 * The callback always executes on the main thread. By default, if the system
 * wakes from sleep the interval silently resumes. Set `continueOnWakeup` to
 * `false` to stop the interval on wakeup and receive a notification via
 * `onError` with `sleepDetected = true`.
 *
 * @param callback - Called on the main thread on every interval tick.
 * @param delay - Interval duration in milliseconds. Pass `null` to pause.
 * @param onError - Called when the worker encounters an error, or when system sleep
 *   stops the interval. The second argument
 *   `sleepDetected` distinguishes sleep events from other worker errors.
 * @param continueOnWakeup - When `true`, the interval silently
 *   resumes after system wake. When `false`, the interval stops on wakeup
 *   and `onError` is called with `sleepDetected = true`. Defaults value is `true`.
 * @param workerName - Optional label passed to the `Worker` constructor.
 *   Useful for identifying the worker in browser DevTools.
 */
export const useWorkerInterval = ({
  callback,
  delay,
  onError,
  continueOnWakeup = true,
  workerName,
}: useWorkerIntervalOptions) => {
  const savedCallback = useRef(callback)
  const savedOnError = useRef(onError)
  const workerNameRef = useRef(workerName)
  const continueOnWakeupRef = useRef(continueOnWakeup)

  useEffect(() => {
    savedCallback.current = callback
    savedOnError.current = onError
    workerNameRef.current = workerName
    continueOnWakeupRef.current = continueOnWakeup
  }, [callback, onError, workerName, continueOnWakeup])

  useEffect(() => {
    if (delay === null || delay < 0 || !Number.isFinite(delay)) {
      return
    }

    if (typeof Worker === 'undefined') {
      savedOnError.current?.(
        new Error('Web Workers are not supported in this environment.'),
        false,
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
      if (event.data.type === WorkerMessage.SleepDetected) {
        cleanup()
        savedOnError.current?.(
          new Error('System sleep detected. The interval has stopped.'),
          true,
        )
        return
      }

      savedCallback.current()
    }

    worker.onerror = (error) => {
      cleanup()
      savedOnError.current?.(new Error(`Worker error: ${error.message}`), false)
    }

    worker.postMessage({ delay, continueOnWakeup: continueOnWakeupRef.current })

    return () => cleanup()
  }, [delay])
}
