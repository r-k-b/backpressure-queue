# backpressure-queue

![Node.js CI](https://github.com/r-k-b/backpressure-queue/workflows/Node.js%20CI/badge.svg?branch=master)

Returns a Writable ObjectMode Stream that allows a certain number of
simultaneous promises, and triggers stream backpressure when the
concurrency limit is hit.

Errors are swallowed.

The return value of doWork() is ignored, and cannot be retrieved.

Usage:

    async function foo(someItem) {
      console.log('work done on ' + someItem)
      return
    }
    
    const w = writableQueue({doWork: foo, limitConcurrent: 2})
    
    someSourceStream.pipe(w)
