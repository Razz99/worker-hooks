# useWorkerInterval

A React hook that runs a `setInterval` inside a Web Worker, so the timer keeps ticking at a steady pace even when your browser tab is in the background.

Requires React 19 or newer.

## Why use this?

Browsers slow down `setInterval` in inactive tabs. A timer set to run every second can drift to once a minute or longer when the tab is hidden for a long time. By moving the timer into a Web Worker, `useWorkerInterval` keeps a steady pace no matter which tab is in focus.

## Quick start

```tsx
import { useState } from 'react'
import { useWorkerInterval } from 'use-worker'

const Counter = () => {
  const [count, setCount] = useState(0)

  useWorkerInterval({
    callback: () => setCount((c) => c + 1),
    delay: 1000,
    onError: (error, sleepDetected) => {
      if (sleepDetected) {
        console.log('Computer sleep detected, timer stopped.')
      } else {
        console.error('Worker failed:', error)
      }
    },
    continueOnWakeup: false,
    workerName: 'counter-timer',
  })

  return <p>{count}</p>
}
```

## Options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `callback` | `() => void` | Yes | Runs on the main thread on every tick. |
| `delay` | `number \| null` | Yes | Time between ticks in milliseconds. Use `null` to pause. |
| `onError` | `(error: Error, sleepDetected: boolean) => void` | No | Called when the worker fails, or when sleep stops the timer. `sleepDetected` is `true` only when machine sleep is detected. |
| `continueOnWakeup` | `boolean` | No | Whether to keep ticking after the computer wakes from sleep. Defaults to `true`. |
| `workerName` | `string` | No | A label for the worker, shown in browser DevTools. |

## Examples

### Pausing the timer

Set `delay` to `null` to stop ticking, and back to a number to start again.

```tsx
import { useState } from 'react'
import { useWorkerInterval } from 'use-worker'

const Timer = ({ paused }: { paused: boolean }) => {
  const [count, setCount] = useState(0)

  useWorkerInterval({
    callback: () => setCount((c) => c + 1),
    delay: paused ? null : 1000,
  })

  return <p>{count}</p>
}
```

### Polling an API

```tsx
import { useState } from 'react'
import { useWorkerInterval } from 'use-worker'

const LivePrice = () => {
  const [price, setPrice] = useState<number>()

  useWorkerInterval({
    callback: async () => {
      const res = await fetch('/api/price')
      setPrice(await res.json())
    },
    delay: 5000,
  })

  return <p>{price ?? 'Loading...'}</p>
}
```

### Handling errors

```tsx
import { useState } from 'react'
import { useWorkerInterval } from 'use-worker'

const TickCounter = () => {
  const [count, setCount] = useState(0)
  const [paused, setPaused] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useWorkerInterval({
    callback: () => setCount((c) => c + 1),
    delay: paused ? null : 1000,
    onError: (err, sleepDetected) => {
      if (sleepDetected) {
        setMessage('Timer stopped — computer went to sleep.')
      } else {
        setMessage(`Timer failed: ${err.message}`)
      }
    },
  })

  return (
    <div>
      <p>Ticks: {count}</p>
      {message && <p>{message}</p>}
      <button onClick={() => setPaused((p) => !p)}>
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  )
}
```

## Sleep and wakeup

When a computer goes to sleep, all timers pause. When it wakes up, `useWorkerInterval` notices the long gap and decides what to do based on `continueOnWakeup`:

- **`continueOnWakeup: true` (default)** — the timer quietly keeps ticking. Ticks missed during sleep are skipped, but the next tick fires normally.
- **`continueOnWakeup: false`** — the timer stops. `onError` is called with `sleepDetected: true`, so you can refresh data or restart whatever you need.

Choose `true` for things that just repeat (a clock, an animation). Choose `false` when a long pause makes the data stale and you want to react.

## Things to know

- **Changing `continueOnWakeup` does not restart the timer.** Its value is locked in when the timer starts. To apply a new value, change `delay` or remount the component.
- **After stopping on sleep, the timer stays off.** With `continueOnWakeup: false`, the timer will not restart on its own. Change `delay` to start it again.
- **Only changing `delay` creates a new worker.** Changing `callback`, `onError`, or `workerName` updates them in place without restarting the worker.
- **Cleanup is automatic.** When the timer stops, the component unmounts, or `delay` changes, the worker is terminated. Terminating the worker also clears its internal interval, so nothing is left running.
- **Sleep detection needs a long enough delay.** Sleep is detected by comparing how much time actually passed against how much was expected. With a very short `delay` (under ~300ms), normal jitter can look like a sleep gap, causing false positives. Use sleep detection with delays of at least a few seconds for reliable results.
