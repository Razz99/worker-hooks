import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  rs,
} from '@rstest/core'
import { renderHook } from '@testing-library/react'
import { useWorkerInterval } from './useWorkerInterval'

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage = rs.fn()
  terminate = rs.fn()

  constructor(readonly url: string) {
    workerInstances.push(this)
  }
}

Object.defineProperty(window, 'Worker', {
  value: MockWorker,
  writable: true,
})

Object.defineProperty(window.URL, 'createObjectURL', {
  value: rs.fn(),
  writable: true,
})

Object.defineProperty(window.URL, 'revokeObjectURL', {
  value: rs.fn(),
  writable: true,
})

const workerInstances: MockWorker[] = []
const originalWorker = window.Worker

const latestWorkerInstance = () => workerInstances[workerInstances.length - 1]
const tickEvent = () => new MessageEvent('message', { data: { type: 'tick' } })
const sleepDetectedEvent = () =>
  new MessageEvent('message', { data: { type: 'sleepDetected' } })
const workerErrorEvent = new ErrorEvent('error', { message: 'Worker failed' })

describe('useWorkerInterval', () => {
  beforeAll(() => {
    window.Worker = MockWorker as unknown as typeof Worker
  })

  afterAll(() => {
    window.Worker = originalWorker
  })

  beforeEach(() => {
    rs.clearAllMocks()
    workerInstances.length = 0
  })

  it('should not create a worker if delay is null', () => {
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: null,
        onError: rs.fn(),
        workerName: 'test-worker',
      }),
    )

    expect(workerInstances.length).toBe(0)
  })

  it('should not create a worker if delay is negative', () => {
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: -100,
        onError: rs.fn(),
        workerName: 'test-worker',
      }),
    )

    expect(workerInstances.length).toBe(0)
  })

  it('should not create a worker if delay is NaN', () => {
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: Number.NaN,
        onError: rs.fn(),
      }),
    )

    expect(workerInstances.length).toBe(0)
  })

  it('should not create a worker if delay is Infinity', () => {
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: Number.POSITIVE_INFINITY,
        onError: rs.fn(),
      }),
    )

    expect(workerInstances.length).toBe(0)
  })

  it('should call onError if Web Workers are not supported', () => {
    const originalWorker = window.Worker
    Object.defineProperty(window, 'Worker', { value: undefined })

    const onError = rs.fn()
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: 100,
        onError,
        workerName: 'test-worker',
      }),
    )

    expect(onError).toHaveBeenCalledWith(expect.any(Error), false)
    expect(workerInstances.length).toBe(0)

    Object.defineProperty(window, 'Worker', { value: originalWorker })
  })

  it('should not double-terminate when unmounted after sleep detected', () => {
    const onError = rs.fn()
    const { unmount } = renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: 100,
        onError,
        continueOnWakeup: false,
      }),
    )

    latestWorkerInstance().onmessage?.(sleepDetectedEvent())
    unmount()

    // terminate and revokeObjectURL should only be called once despite both
    // sleep handler and effect cleanup running.
    expect(latestWorkerInstance().terminate).toHaveBeenCalledTimes(1)
    expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('should create the worker and post the message', () => {
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: 100,
        onError: rs.fn(),
        workerName: 'test-worker',
      }),
    )

    expect(workerInstances.length).toBe(1)
    expect(latestWorkerInstance().postMessage).toHaveBeenCalledWith({
      delay: 100,
      continueOnWakeup: true,
    })
  })

  it('should call onError with sleepDetected when sleep is detected', () => {
    const onError = rs.fn()
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: 100,
        onError,
        continueOnWakeup: false,
      }),
    )

    latestWorkerInstance().onmessage?.(sleepDetectedEvent())

    expect(latestWorkerInstance().terminate).toHaveBeenCalled()
    expect(window.URL.revokeObjectURL).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), true)
  })

  it('should call onError if worker error occurs', () => {
    const onError = rs.fn()
    renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: 100,
        onError,
        workerName: 'test-worker',
      }),
    )

    latestWorkerInstance().onerror?.(workerErrorEvent)

    expect(latestWorkerInstance().terminate).toHaveBeenCalled()
    expect(window.URL.revokeObjectURL).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), false)
  })

  it('should call the callback on worker tick', () => {
    const callback = rs.fn()
    renderHook(() =>
      useWorkerInterval({
        callback,
        delay: 100,
        onError: rs.fn(),
        workerName: 'test-worker',
      }),
    )

    latestWorkerInstance().onmessage?.(tickEvent())
    latestWorkerInstance().onmessage?.(tickEvent())

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should clean up the worker on unmount', () => {
    const { unmount } = renderHook(() =>
      useWorkerInterval({
        callback: rs.fn(),
        delay: 100,
        onError: rs.fn(),
        workerName: 'test-worker',
      }),
    )

    unmount()

    expect(latestWorkerInstance().terminate).toHaveBeenCalled()
    expect(window.URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('should update the callback and onError references', () => {
    const initialCallback = rs.fn()
    const updatedCallback = rs.fn()
    const initialOnError = rs.fn()
    const updatedOnError = rs.fn()

    const { rerender } = renderHook(
      ({ callback, onError }) =>
        useWorkerInterval({
          callback,
          delay: 100,
          onError,
          workerName: 'test-worker',
        }),
      {
        initialProps: { callback: initialCallback, onError: initialOnError },
      },
    )

    rerender({ callback: updatedCallback, onError: updatedOnError })

    latestWorkerInstance().onmessage?.(tickEvent())
    expect(initialCallback).not.toHaveBeenCalled()
    expect(updatedCallback).toHaveBeenCalledTimes(1)

    latestWorkerInstance().onerror?.(workerErrorEvent)
    expect(initialOnError).not.toHaveBeenCalled()
    expect(updatedOnError).toHaveBeenCalledWith(expect.any(Error), false)
  })

  it('should recreate the worker when delay changes', () => {
    const { rerender } = renderHook(
      ({ delay }) =>
        useWorkerInterval({
          callback: rs.fn(),
          delay,
          onError: rs.fn(),
          workerName: 'test-worker',
        }),
      {
        initialProps: { delay: 100 },
      },
    )

    const firstWorkerInstance = latestWorkerInstance()

    rerender({ delay: 200 })

    const secondWorkerInstance = latestWorkerInstance()

    expect(firstWorkerInstance).not.toBe(secondWorkerInstance)
    expect(firstWorkerInstance.terminate).toHaveBeenCalled()
    expect(window.URL.revokeObjectURL).toHaveBeenCalled()
    expect(secondWorkerInstance.postMessage).toHaveBeenCalledWith({
      delay: 200,
      continueOnWakeup: true,
    })
  })

  it('should not recreate the worker when continueOnWakeup changes', () => {
    const { rerender } = renderHook(
      ({ continueOnWakeup }) =>
        useWorkerInterval({
          callback: rs.fn(),
          delay: 100,
          continueOnWakeup,
        }),
      {
        initialProps: { continueOnWakeup: true },
      },
    )

    const firstWorkerInstance = latestWorkerInstance()

    rerender({ continueOnWakeup: false })

    expect(workerInstances.length).toBe(1)
    expect(latestWorkerInstance()).toBe(firstWorkerInstance)
    expect(firstWorkerInstance.terminate).not.toHaveBeenCalled()
  })

  it('should not recreate the worker when callback changes', () => {
    const { rerender } = renderHook(
      ({ callback }: { callback: () => void }) =>
        useWorkerInterval({ callback, delay: 100 }),
      { initialProps: { callback: rs.fn() } },
    )

    const firstWorkerInstance = latestWorkerInstance()

    rerender({ callback: rs.fn() })

    expect(workerInstances.length).toBe(1)
    expect(latestWorkerInstance()).toBe(firstWorkerInstance)
    expect(firstWorkerInstance.terminate).not.toHaveBeenCalled()
  })

  it('should not recreate the worker when onError changes', () => {
    const { rerender } = renderHook(
      ({ onError }: { onError: () => void }) =>
        useWorkerInterval({ callback: rs.fn(), delay: 100, onError }),
      { initialProps: { onError: rs.fn() } },
    )

    const firstWorkerInstance = latestWorkerInstance()

    rerender({ onError: rs.fn() })

    expect(workerInstances.length).toBe(1)
    expect(latestWorkerInstance()).toBe(firstWorkerInstance)
    expect(firstWorkerInstance.terminate).not.toHaveBeenCalled()
  })

  it('should not recreate the worker when workerName changes', () => {
    const { rerender } = renderHook(
      ({ workerName }: { workerName: string }) =>
        useWorkerInterval({ callback: rs.fn(), delay: 100, workerName }),
      { initialProps: { workerName: 'worker-a' } },
    )

    const firstWorkerInstance = latestWorkerInstance()

    rerender({ workerName: 'worker-b' })

    expect(workerInstances.length).toBe(1)
    expect(latestWorkerInstance()).toBe(firstWorkerInstance)
    expect(firstWorkerInstance.terminate).not.toHaveBeenCalled()
  })
})
