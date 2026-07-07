# useWorkerTimeout

A React hook that runs a one-shot `setTimeout` inside a Web Worker, so the timeout still fires reliably even when your browser tab is in the background.

Requires React 19 or newer.

## Why use this?

Browsers throttle `setTimeout` in inactive tabs, so a timeout scheduled for a few seconds can fire much later (or feel "stuck") while the tab is hidden. By moving the timer into a Web Worker, `useWorkerTimeout` keeps an accurate countdown no matter which tab is in focus, then runs your callback once on the main thread when the time is up.

## Quick start

```tsx
import { useState } from 'react'
import { useWorkerTimeout } from 'use-worker'

const Toast = () => {
  const [visible, setVisible] = useState(true)

  useWorkerTimeout({
    callback: () => setVisible(false),
    delay: 3000,
    onError: (error) => console.error('Worker failed:', error),
    workerName: 'toast-timer',
  })

  return visible ? <div className="toast">Saved!</div> : null
}
```

## Options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `callback` | `() => void` | Yes | Runs once on the main thread when the timeout elapses. |
| `delay` | `number \| null` | Yes | Time to wait in milliseconds before firing. Use `null` to disarm. `0` fires as soon as possible. |
| `onError` | `(error: Error) => void` | No | Called when the worker fails, or when Web Workers are not supported. |
| `workerName` | `string` | No | A label for the worker, shown in browser DevTools. |

## How re-arming works

`delay` is the only control. Each time `delay` changes to a new value, any pending worker is torn down and a fresh timeout is armed.

- Set `delay` to `null` to cancel a pending timeout.
- Change `delay` to a new number to restart the countdown with that duration.
- To fire again with the **same** number, toggle through `null` first (for example `1000 → null → 1000`), because React only re-runs the timer when the `delay` value actually changes.

## Examples

### Cancelling a pending timeout

Set `delay` to `null` to stop the timeout before it fires.

```tsx
import { useState } from 'react'
import { useWorkerTimeout } from 'use-worker'

const AutoLogout = ({ active }: { active: boolean }) => {
  const [loggedOut, setLoggedOut] = useState(false)

  useWorkerTimeout({
    callback: () => setLoggedOut(true),
    delay: active ? 60000 : null,
  })

  return loggedOut ? <p>Session expired</p> : <p>You are signed in</p>
}
```

### Debouncing a value

Restart the countdown every time the input changes by feeding a fresh `delay`.

```tsx
import { type ChangeEvent, useState } from 'react'
import { useWorkerTimeout } from 'use-worker'

interface SearchResult {
  id: string
  label: string
}

const Search = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

  useWorkerTimeout({
    // A new `query` re-renders and re-arms the 400ms timeout.
    callback: async () => {
      const res = await fetch(`/api/search?q=${query}`)
      setResults(await res.json())
    },
    delay: query ? 400 : null,
  })

  return (
    <div>
      <input
        value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
      />
      <ul>
        {results.map((r) => (
          <li key={r.id}>{r.label}</li>
        ))}
      </ul>
    </div>
  )
}
```

### Handling errors

```tsx
import { useWorkerTimeout } from 'use-worker'

....

useWorkerTimeout({
  callback: doWork,
  delay: 2000,
  onError: (error: Error) => {
    console.error('Worker failed:', error)
  },
})

...
```

## Things to know

- **The timeout fires exactly once.** After the callback runs, the worker is terminated automatically. There is no recurring tick — use `useWorkerInterval` for repeating timers.
- **`delay` is the only trigger.** Changing `callback`, `onError`, or `workerName` updates them in place without restarting the worker. Only a new `delay` value arms a fresh timeout.
- **No sleep detection.** Unlike `useWorkerInterval`, `useWorkerTimeout` has no sleep detection mechanism. If the computer sleeps through the delay, the callback simply fires once on wakeup.
- **Cleanup is automatic.** When the component unmounts or `delay` changes, the pending worker is terminated and its blob URL is revoked.
