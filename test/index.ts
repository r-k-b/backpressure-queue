process.env.NODE_ENV = 'test'

import {delay, generatorFromArray} from '../lib/utils'
import {Readable} from 'stream'
import * as test from 'tape'
import {writableQueue} from '../index'

/*
Shorthand for the `a` arrays:

⎀1
  item`1` was read into memory, from the source, by the readable stream

␙
  The source of the readable stream was exhausted

↑1
  "work was started" on item`1`

↓1
  "work was completed" on item`1`

⏲50
  50ms has passed since the test began

*/

test('16-buffer 1-wide 1-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: appendTo(a),
    limitConcurrent: 1,
  })

  wq.addListener('finish', () => {
    t.equal(a.join(' '), '⎀1 ␙ 1')
    // t.end()
  })

  const source = debugReadableFromArray(a, ['1'])
  source.pipe(wq)
})

test('16-buffer 1-wide 6-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: appendTo(a),
    limitConcurrent: 1,
  })

  wq.addListener('finish', () => {
    t.equal(a.join(' '), '⎀1 ⎀2 ⎀3 ⎀4 ⎀5 ⎀6 ␙ 1 2 3 4 5 6')
  })

  const source = debugReadableFromArray(a, ['1', '2', '3', '4', '5', '6'])

  source.pipe(wq)
})

test('slow 16-buffer 1-wide 1-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: slowlyAppendTo(a, 10),
    limitConcurrent: 1,
  })

  wq.addListener('finish', () => {
    t.equal(a.join(' '), '⎀1 ␙ ↑1 ↓1')
  })

  const source = debugReadableFromArray(a, ['1'])

  source.pipe(wq)
})

test('slow 16-buffer 1-wide 2-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: slowlyAppendTo(a, 50),
    limitConcurrent: 1,
  })

  wq.addListener('finish', () => {
    t.equal(a.join(' '), '⎀1 ⎀2 ␙ ↑1 ↓1 ↑2 ↓2')
  })

  const source = debugReadableFromArray(a, ['1', '2'])

  source.pipe(wq)
})

test('slow 16-buffer 2-wide 2-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: slowlyAppendTo(a, 50),
    limitConcurrent: 2,
  })

  wq.addListener('finish', () => {
    t.equal(a.join(' '), '⎀1 ⎀2 ␙ ↑1 ↑2 ⏲25 ↓1 ↓2')
  })

  const source = debugReadableFromArray(a, ['1', '2'])

  markAtTime(a, 25).catch(noop)

  source.pipe(wq)
})

test('slow 1-buffer 1-wide 6-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: slowlyAppendTo(a, 50),
    limitConcurrent: 1,
  })

  wq.addListener('finish', () => {
    t.equal(
      a.join(' '),
      '⎀1 ⎀2 ⎀3 ↑1 ⏲25 ↓1 ↑2 ⎀4 ⏲75 ↓2 ↑3 ⎀5 ⏲125 ↓3 ↑4 ⎀6 ⏲175 ↓4 ↑5 ␙ ⏲225 ↓5 ↑6 ⏲275 ↓6',
    )
  })

  const source = debugReadableFromArray(a, ['1', '2', '3', '4', '5', '6'], {
    highWaterMark: 1,
  })

  Promise.all([
    markAtTime(a, 25),
    markAtTime(a, 75),
    markAtTime(a, 125),
    markAtTime(a, 175),
    markAtTime(a, 225),
    markAtTime(a, 275),
  ]).catch(noop)

  source.pipe(wq)
})

test('delayed slow 1-buffer 1-wide 6-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: variableDelayAppendTo(a),
    limitConcurrent: 1,
  })

  wq.addListener('finish', () => {
    t.equal(
      a.join(' '),
      '⎀1r10ms ↑1w10ms ↓1w10ms ' +
        '⎀2r20ms ↑2w20ms ↓2w20ms ' +
        '⎀3r30ms ↑3w30ms ↓3w30ms ' +
        '⎀4r40ms ↑4w40ms ↓4w40ms ' +
        '⎀5r50ms ↑5w50ms ↓5w50ms ' +
        '⎀6r60ms ␙ ↑6w60ms ↓6w60ms',
    )
  })

  const source = debugDelayableReadableFromArray(
    a,
    [
      {s: '1', workMS: 10, readMS: 10},
      {s: '2', workMS: 20, readMS: 20},
      {s: '3', workMS: 30, readMS: 30},
      {s: '4', workMS: 40, readMS: 40},
      {s: '5', workMS: 50, readMS: 50},
      {s: '6', workMS: 60, readMS: 60},
    ],
    {
      highWaterMark: 1,
    },
  )

  source.pipe(wq)
})

test('slow 1-buffer 2-wide 6-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: slowlyAppendTo(a, 50),
    limitConcurrent: 2,
  })

  wq.addListener('finish', () => {
    // how to be more deterministic here? Seems to end up in one of these two states in node 8.x, 10.x:
    const sample1 =
      '⎀1 ⎀2 ⎀3 ⎀4 ↑1 ↑2 ⏲25 ↓1 ↓2 ⎀5 ↑3 ⎀6 ↑4 ⏲75 ↓3 ␙ ↑5 ↓4 ↑6 ⏲125 ↓5 ↓6'
    const sample2 =
      '⎀1 ⎀2 ⎀3 ⎀4 ↑1 ↑2 ⏲25 ↓1 ↓2 ⎀5 ↑3 ⎀6 ↑4 ⏲75 ↓3 ↓4 ␙ ↑5 ↑6 ⏲125 ↓5 ↓6'

    // node 12.x has this behaviour:
    const sample3 =
      '⎀1 ⎀2 ⎀3 ⎀4 ↑1 ↑2 ⏲25 ↓1 ⎀5 ↑3 ↓2 ⎀6 ↑4 ⏲75 ↓3 ␙ ↑5 ↓4 ↑6 ⏲125 ↓5 ↓6'

    // node 14
    const sample4 =
      '⎀1 ⎀2 ⎀3 ⎀4 ↑1 ↑2 ⏲25 ↓1 ↑3 ⎀5 ↓2 ↑4 ⎀6 ⏲75 ↓3 ↑5 ␙ ↓4 ↑6 ⏲125 ↓5 ↓6'

    const joined = a.join(' ')
    let expectedOneOf = [sample1, sample2, sample3, sample4]
    let anyMatch = expectedOneOf.some((sample) => joined === sample)
    t.true(anyMatch, 'result matches any expected outcome (non-deterministic?)')
    if (!anyMatch) {
      console.warn({expectedOneOf, got: joined})
    }
  })

  const source = debugReadableFromArray(a, ['1', '2', '3', '4', '5', '6'], {
    highWaterMark: 1,
  })

  Promise.all([markAtTime(a, 25), markAtTime(a, 75), markAtTime(a, 125)]).catch(
    noop,
  )

  source.pipe(wq)
})

test('slow 16-buffer 10-wide 6-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: slowlyAppendTo(a, 50),
    limitConcurrent: 10,
  })

  wq.addListener('finish', () => {
    t.equal(
      a.join(' '),
      '⎀1 ⎀2 ⎀3 ⎀4 ⎀5 ⎀6 ␙ ↑1 ↑2 ↑3 ↑4 ↑5 ↑6 ⏲25 ↓1 ↓2 ↓3 ↓4 ↓5 ↓6',
    )
  })

  const source = debugReadableFromArray(a, ['1', '2', '3', '4', '5', '6'], {
    highWaterMark: 16,
  })

  markAtTime(a, 25).catch(noop)

  source.pipe(wq)
})

test('slow sequential 2-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: slowlyAppendTo(a, 10),
    limitConcurrent: 1,
  })

  wq.addListener('finish', () => {
    t.equal(
      a.join(' '),
      '⎀1 ⎀2 ⎀3 ⎀4 ⎀5 ⎀6 ␙ ↑1 ↓1 ↑2 ↓2 ↑3 ↓3 ↑4 ↓4 ↑5 ↓5 ↑6 ↓6',
    )
  })

  const source = debugReadableFromArray(a, ['1', '2', '3', '4', '5', '6'])

  source.pipe(wq)
})

test('out-of-order 1-buffer 6-wide 6-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: variableDelayAppendTo(a),
    limitConcurrent: 6,
  })

  wq.addListener('finish', () => {
    t.equal(
      a.join(' '),
      '⎀1 ⎀2 ⎀3 ⎀4 ⎀5 ⎀6 ␙ ↑1w30ms ↑2w20ms ↑3w10ms ↑4w15ms ↑5w25ms ↑6w35ms ↓3w10ms ↓4w15ms ↓2w20ms ↓5w25ms ↓1w30ms ↓6w35ms',
    )
  })

  // 3 4 2 5 1 6
  const delayables: Delayable[] = [
    {s: '1', workMS: 30, readMS: null},
    {s: '2', workMS: 20, readMS: null},
    {s: '3', workMS: 10, readMS: null},
    {s: '4', workMS: 15, readMS: null},
    {s: '5', workMS: 25, readMS: null},
    {s: '6', workMS: 35, readMS: null},
  ]
  const source = debugDelayableReadableFromArray(a, delayables, {
    highWaterMark: 1,
  })

  source.pipe(wq)
})

test('out-of-order 16-buffer 6-wide 6-item', (t) => {
  t.plan(1)

  let a: string[] = []

  const wq = writableQueue({
    doWork: variableDelayAppendTo(a),
    limitConcurrent: 6,
  })

  wq.addListener('finish', () => {
    t.equal(
      a.join(' '),
      '⎀1 ⎀2 ⎀3 ⎀4 ⎀5 ⎀6 ␙ ↑1w30ms ↑2w20ms ↑3w10ms ↑4w15ms ↑5w25ms ↑6w35ms ↓3w10ms ↓4w15ms ↓2w20ms ⏲25 ↓5w25ms ↓1w30ms ↓6w35ms',
    )
  })

  // 3 4 2 5 1 6
  const delayables: Delayable[] = [
    {s: '1', workMS: 30, readMS: null},
    {s: '2', workMS: 20, readMS: null},
    {s: '3', workMS: 10, readMS: null},
    {s: '4', workMS: 15, readMS: null},
    {s: '5', workMS: 25, readMS: null},
    {s: '6', workMS: 35, readMS: null},
  ]
  const source = debugDelayableReadableFromArray(a, delayables, {
    highWaterMark: 16,
  })

  Promise.all([markAtTime(a, 25), markAtTime(a, 75), markAtTime(a, 125)]).catch(
    noop,
  )

  source.pipe(wq)
})

function appendTo(mutableArray: string[]) {
  return async function mutateString(x: string): Promise<void> {
    mutableArray.push(x)
  }
}

function slowlyAppendTo(mutableArray: string[], delayMS: number) {
  return async function mutateArray(x: string): Promise<void> {
    mutableArray.push(`↑${x}`)
    await delay(delayMS)
    mutableArray.push(`↓${x}`)
  }
}

function variableDelayAppendTo(mutableArray: string[]) {
  return async function mutateArray(x: Delayable): Promise<void> {
    if (x.workMS === null) {
      mutableArray.push(`↑${x.s}`)
      mutableArray.push(`↓${x.s}`)
      return
    }

    mutableArray.push(`↑${x.s}w${x.workMS}ms`)
    await delay(x.workMS)
    mutableArray.push(`↓${x.s}w${x.workMS}ms`)
  }
}

function debugReadableFromArray(
  mutableArray: string[],
  source: string[],
  options: {highWaterMark?: number} = {},
): Readable {
  const generator = generatorFromArray(source)

  function read(this: Readable) {
    let pushResult = true
    do {
      const next = generator.next()
      if (next.done) {
        mutableArray.push('␙')
        this.push(null)
        return
      }
      mutableArray.push(`⎀${next.value}`)
      pushResult = this.push(next.value)
    } while (pushResult)
  }

  return new Readable({
    read,
    objectMode: true,
    highWaterMark: options.highWaterMark,
  })
}

interface Delayable {
  s: string
  readMS: number | null
  workMS: number | null
}

function debugDelayableReadableFromArray(
  mutableArray: string[],
  source: Delayable[],
  options: {highWaterMark?: number} = {},
): Readable {
  let simultaneousReads = 0
  const generator = generatorFromArray(source)

  async function read(this: Readable): Promise<void> {
    if (simultaneousReads > 0) {
      // calm yourself!
      return
    }
    simultaneousReads++
    let pushResult = true
    do {
      const next = generator.next()
      if (next.done) {
        // end of source.
        mutableArray.push('␙')
        this.push(null)
        simultaneousReads--
        return
      }
      if (next.value.readMS === null) {
        mutableArray.push(`⎀${next.value.s}`)
        pushResult = this.push(next.value)
      } else {
        await delay(next.value.readMS).then(() => {
          mutableArray.push(`⎀${next.value.s}r${next.value.readMS}ms`)
          pushResult = this.push(next.value)
        })
      }
    } while (pushResult)
    simultaneousReads--
  }

  return new Readable({
    read,
    objectMode: true,
    highWaterMark: options.highWaterMark,
  })
}

async function markAtTime(mutableArray: string[], ms: number): Promise<void> {
  await delay(ms)
  mutableArray.push(`⏲${ms}`)
}

function noop() {}
