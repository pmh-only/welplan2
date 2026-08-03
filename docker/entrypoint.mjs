import { spawn } from 'node:child_process'

let shuttingDown = false
let exitTimer = null
let shutdownStatus = 0

const children = [
  [
    'webapp',
    'node',
    ['--import', '/app/docker/image-indexing.mjs', '/app/webapp/build/index.js']
  ],
  ['worker', 'node', ['/app/worker/dist/worker/src/index.js']]
].map(([name, command, args]) => {
  const child = spawn(command, args, {
    cwd: '/app',
    stdio: 'inherit',
    env: process.env
  })

  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      shuttingDown = true
      shutdownStatus = code ?? (signal ? 1 : 0)
      stopAll(signal ?? 'SIGTERM')
    }
    exitAfterChildren()
  })

  return { name, child }
})

function stopAll(signal = 'SIGTERM') {
  for (const { child } of children) {
    if (!child.killed) child.kill(signal)
  }
}

function exitAfterChildren() {
  exitTimer ??= setTimeout(() => process.exit(shutdownStatus), 5000)
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) return
  }
  if (exitTimer) clearTimeout(exitTimer)
  process.exit(shutdownStatus)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    shutdownStatus = 0
    stopAll(signal)
    exitAfterChildren()
  })
}
