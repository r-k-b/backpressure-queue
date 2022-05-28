'use strict'

import {Writable, WritableOptions} from 'stream'
import * as async from 'async'

const defaultConcurrencyLimit = 3

export interface WritableQueueOpts {
  doWork: (streamItem: any) => Promise<void>
  limitConcurrent: number | 3
}

/**
 * Returns a Writable ObjectMode Stream that allows a certain number of
 * simultaneous promises, and triggers stream backpressure when the
 * concurrency limit is hit.
 *
 * Errors are swallowed.
 *
 * The return value of doWork() is ignored, and cannot be retrieved.
 *
 * Usage:
 *
 *    async function foo(someItem) {
 *      console.log('work done on ' + someItem)
 *      return
 *    }
 *
 *    const w = writableQueue({doWork: foo, limitConcurrent: 2})
 *
 *    someSourceStream.pipe(w)
 */
export function writableQueue(opts: WritableQueueOpts) {
  const limitConcurrent = opts.limitConcurrent || defaultConcurrencyLimit
  const q = async.queue(opts.doWork, limitConcurrent)

  const wOpts: WritableOptions = {
    objectMode: true,
    highWaterMark: 1,
    write,
    // typescript error; refer <https://github.com/DefinitelyTyped/DefinitelyTyped/issues/19708>
    // workaround: <https://github.com/r-k-b/DefinitelyTyped/compare/2673835592c232aa26db99b5f4d147b165b036ba...10b661ed6c987a9eebbdf9629e5a92027f42493f>
    final: onFinalWritable,
  }

  let expectedDesaturations = 0
  let writerCallback = (errorOrNull: Error | null) => {}

  q.unsaturated(function () {
    // this probably does bad things if multiple Writables overwrite the func
    // we're safe, since a single Writable is strictly sequential
    try {
      if (expectedDesaturations > 0) {
        expectedDesaturations--
        writerCallback(null)
      }
    } catch (error) {
      // we're doing something wrong here
    }
  })

  function write(
    chunk: any,
    encoding: string,
    callback: (errorOrNull: Error | null) => void,
  ): void {
    try {
      writerCallback = callback
      q.push(chunk)
      expectedDesaturations++
      const waiting = q.length()
      const running = q.running()
      const limit = q.concurrency

      if (running + waiting <= limit) {
        // queue is free to accept next; no backpressure
        expectedDesaturations--
        callback(null)
        return
      }
    } catch (error) {
      callback(isError(error) ? error : null)
    }
  }

  function onFinalWritable(callback: (error: Error | null) => void): void {
    if (q.idle()) {
      // no need to wait for drain event
      callback(null)
      return
    }

    q.drain(() => {
      callback(null)
    })
  }

  return new Writable(wOpts)
}

function isError(e: unknown): e is Error {
  if (e == null) return false
  if (typeof e != 'object') return false

  if (!hasKeys(['name', 'message'])(e)) return false

  return typeof e.name == 'string' && typeof e.message == 'string'
}

const hasKeys =
  <K extends string>(ks: K[]) =>
  (o: object): o is Record<K, unknown> =>
    ks.every((k) => k in o)
