import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSrtTimestamp,
  stripVttTags,
  vttToSrt,
  createSrtDataUri
} from '../src/utils/subtitle-utils.js';

test('formatSrtTimestamp - formats mm:ss.ms to hh:mm:ss,ms', () => {
  const result = formatSrtTimestamp('01:23.456');
  assert.equal(result, '00:01:23,456');
});

test('formatSrtTimestamp - formats hh:mm:ss.ms to hh:mm:ss,ms', () => {
  const result = formatSrtTimestamp('02:15:30.890');
  assert.equal(result, '02:15:30,890');
});

test('formatSrtTimestamp - handles missing/short millis', () => {
  const result = formatSrtTimestamp('00:05.1');
  assert.equal(result, '00:00:05,100');
});

test('formatSrtTimestamp - returns fallback for invalid input', () => {
  assert.equal(formatSrtTimestamp(null), '00:00:00,000');
  assert.equal(formatSrtTimestamp(''), '00:00:00,000');
  assert.equal(formatSrtTimestamp('invalid'), '00:00:00,000');
});

test('stripVttTags - removes voice and HTML tags', () => {
  const input = '<v Instructor>Hello <b>world</b>, this is <i>Udemy</i>.</v>';
  const output = stripVttTags(input);
  assert.equal(output, 'Hello world, this is Udemy.');
});

test('stripVttTags - removes ruby and class tags', () => {
  const input = '<c.yellow>Highlighted</c> and <ruby>Kanji<rt>ruby</rt></ruby>';
  const output = stripVttTags(input);
  assert.equal(output, 'Highlighted and Kanji');
});

test('vttToSrt - converts standard WebVTT to SRT', () => {
  const vtt = `WEBVTT - Course Intro
Kind: captions
Language: en

NOTE This is a comment block
that spans multiple lines

1
00:00:01.000 --> 00:00:04.500 line:90% align:middle
Welcome to the course!

00:00:05.200 --> 00:00:09.800
In this lecture, we learn <b>Python</b>.
It will be fun.
`;

  const srt = vttToSrt(vtt);

  const expected = `1
00:00:01,000 --> 00:00:04,500
Welcome to the course!

2
00:00:05,200 --> 00:00:09,800
In this lecture, we learn Python.
It will be fun.
`;

  assert.equal(srt, expected);
});

test('vttToSrt - handles mm:ss.ms timestamps in cues', () => {
  const vtt = `WEBVTT

01:10.000 --> 01:15.500
Short timestamp format.
`;

  const srt = vttToSrt(vtt);
  assert.match(srt, /00:01:10,000 --> 00:01:15,500/);
  assert.match(srt, /Short timestamp format\./);
});

test('vttToSrt - returns empty string for empty or null input', () => {
  assert.equal(vttToSrt(''), '');
  assert.equal(vttToSrt(null), '');
  assert.equal(vttToSrt(undefined), '');
});

test('createSrtDataUri - creates valid base64 data uri', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello';
  const uri = createSrtDataUri(srt);
  assert.ok(uri.startsWith('data:text/plain;charset=utf-8;base64,'));
  assert.ok(uri.length > 'data:text/plain;charset=utf-8;base64,'.length);
});
