# backpressure-queue

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
