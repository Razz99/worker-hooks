# worker-hooks

A small collection of React hooks that run timers inside a Web Worker, so they keep working even when your browser tab is in the background.

## Why use this?

Browsers throttle `setInterval` and `setTimeout` in inactive tabs. By moving the timer into a Web Worker, these hooks keep an accurate pace no matter which tab is in focus, then run your callback on the main thread.

Requires React 19 or newer.

## Hooks

| Hook | Description | Docs |
| --- | --- | --- |
| `useWorkerInterval` | Repeating timer (`setInterval`) that keeps a steady pace in background tabs. | [Docs](https://github.com/Razz99/worker-hooks/blob/main/src/useWorkerInterval/doc.md) |
| `useWorkerTimeout` | One-shot timer (`setTimeout`) that fires reliably in background tabs. | [Docs](https://github.com/Razz99/worker-hooks/blob/main/src/useWorkerTimeout/doc.md) |

## Contributing

See [CONTRIBUTING.md](https://github.com/Razz99/worker-hooks/blob/main/CONTRIBUTING.md).

## License

[Apache 2.0](https://github.com/Razz99/worker-hooks/blob/main/LICENSE)
