import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDf, parseNvidiaSmi } from './machine.ts'

test('df: reads free and total from POSIX output, on Linux and macOS alike', () => {
  const linux = 'Filesystem     1024-blocks      Used Available Capacity Mounted on\n/dev/nvme0n1p2  959786032 412345678 498765432      46% /\n'
  assert.deepEqual(parseDf(linux), { freeGb: 475.7, totalGb: 915.3 })
  const mac = 'Filesystem    1024-blocks      Used Available Capacity  Mounted on\n/dev/disk3s1s1  971350180  10457896 541227540     2%    /System/Volumes/Data\n'
  assert.deepEqual(parseDf(mac), { freeGb: 516.2, totalGb: 926.4 })
})

test('df: garbage is null, not NaN', () => {
  assert.equal(parseDf(''), null)
  assert.equal(parseDf('Filesystem\n'), null)
})

test('nvidia-smi: the first GPU, as numbers', () => {
  assert.deepEqual(parseNvidiaSmi('NVIDIA GeForce RTX 3060, 34, 5120, 12288, 61\nother, 1, 2, 3, 4\n'), {
    name: 'NVIDIA GeForce RTX 3060',
    utilization: 34,
    memoryUsedMb: 5120,
    memoryTotalMb: 12288,
    temperatureC: 61,
  })
  assert.equal(parseNvidiaSmi('NVIDIA-SMI has failed'), null)
  assert.equal(parseNvidiaSmi('GPU, [N/A], 1, 2, 3'), null)
})
