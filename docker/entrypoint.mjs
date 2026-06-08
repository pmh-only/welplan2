import { spawn } from 'node:child_process'

let shuttingDown = false

const children = [
  ['webapp', 'node', ['/app/webapp/build/index.js']],
  ['worker', 'node', ['/app/worker/dist/worker/src/index.js']]
].map(([name, command, args]) => {
  const child = spawn(command, args, {
    cwd: '/app',
    stdio: 'inherit',
    env: process.env
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    shuttingDown = true
    const status = code ?? (signal ? 1 : 0)
    stopAll(signal ?? 'SIGTERM')
    process.exitCode = status
  })

  return { name, child }
})

function stopAll(signal = 'SIGTERM') {
  for (const { child } of children) {
    if (!child.killed) child.kill(signal)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    stopAll(signal)
  })
}
