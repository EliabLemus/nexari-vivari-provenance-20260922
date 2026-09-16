// The `printf` coreutil — an ordinary CommonJS Node program that runs as a
// process inside Vivari, installed as /bin/printf.js (see coreutils.js), so
// from the shell it is just `printf` on PATH.
//
// Minimal POSIX-subset design, with the failure policy the runtime requires of
// every coreutil: anything outside the subset is REFUSED with a typed stderr
// diagnostic and exit 1, never silently mis-formatted output. POSIX printf
// writes format text directly and consumes arguments only where a directive
// appears; the format is reused when arguments remain; `--` ends option
// parsing (GNU prints it, POSIX is silent, the bash builtin prints it).
//
// Supported subset:
//   %%        a literal `%`
//   %s %b %c  string, escaped-string (%b), first-char (%c); missing arg -> ''
//   %d %i %u  integers; missing arg -> 0 (POSIX quiet behavior)
//   %o %x %X  octal / hex / HEX; missing arg -> 0
//   \n \t \r \\ escapes in the FORMAT only; further escapes are left verbatim
//
// Unsupported (typed refusal, exit 1, nothing written to stdout):
//   %e %E %f %F %g %G %a %A and any unrecognized or multi-char directive.
//   Flags, field width and precision (%08.3f) likewise unsupported. Arguments
//   that must be numeric but are not parse as NaN: reported typed, exit 1.
//
// Authoring note: like programs/ruff.js this source is embedded as a template
// string, so it deliberately uses NO backticks, NO ${...} and NO backslashes.
// Newlines come from String.fromCharCode(10).
export const PRINTF_PROGRAM = `
'use strict';
const NL = String.fromCharCode(10);
function out(s) { process.stdout.write(s); }
function err(s) { process.stderr.write(s + NL); }

const ESCAPES = { n: NL, t: String.fromCharCode(9), r: String.fromCharCode(13), '\\\\': '\\\\', '%': '%' };
const INT = /^(\\\\+|-)?[0-9]+$/;

function decodeFormat(raw) {
  let decoded = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      const mapped = ESCAPES[next];
      if (mapped !== undefined) { decoded += mapped; i += 1; continue; }
    }
    decoded += ch;
  }
  return decoded;
}

function toInt(arg, directives) {
  const trimmed = String(arg).trim();
  if (!INT.test(trimmed)) {
    err('printf: ' + "'" + arg + "'" + ': expected integer argument');
    process.exit(1);
  }
  const value = parseInt(trimmed, 10);
  if (directives === 'unsigned' && value < 0) {
    err('printf: ' + "'" + arg + "'" + ': negative argument for unsigned directive');
    process.exit(1);
  }
  return value;
}

function unsigned(value, radix, upper) {
  if (value < 0) {
    const long = value < -2147483648 ? -4294967296 + value : 4294967296 + value;
    return (long >>> 0).toString(radix);
  }
  return (value >>> 0).toString(radix);
}

const args = process.argv.slice(2);
if (!args.length) {
  err('printf: missing format operand');
  process.exit(1);
}

// '--' ends option parsing and is printed verbatim (bash builtin behavior).
const format = args[0] === '--' ? args.slice(1).join(' ') + NL : decodeFormat(args[0]);
if (args[0] === '--') process.exit(0);
const rest = args.slice(1);

let argIndex = 0;
let directiveCount = 0;
let chunk = '';
// POSIX: the format is reused as often as necessary to satisfy the arguments.
// Every supported consuming directive takes exactly one argument per pass, so
// each reuse consumes at least one and the loop always terminates.
do {
for (let position = 0; position < format.length; position += 1) {
  const ch = format[position];
  if (ch !== '%') { chunk += ch; continue; }
  const spec = format[position + 1];
  if (spec === '%') { chunk += '%'; position += 1; continue; }
  if (spec === undefined) { chunk += '%'; continue; }
  // Flush before consuming the argument: on typed refusal nothing after the
  // offending directive (including this chunk) is ever written.
  if (chunk) { out(chunk); chunk = ''; }
  directiveCount += 1;
  if (spec === 's') { chunk += rest[argIndex] === undefined ? '' : String(rest[argIndex]); argIndex += 1; position += 1; continue; }
  if (spec === 'b') {
    const raw = rest[argIndex] === undefined ? '' : String(rest[argIndex]);
    argIndex += 1;
    for (let j = 0; j < raw.length; j += 1) {
      const esc = ESCAPES[raw[j]];
      chunk += esc !== undefined ? esc : raw[j];
    }
    position += 1; continue;
  }
  if (spec === 'c') {
    const value = rest[argIndex] === undefined ? '' : String(rest[argIndex]);
    argIndex += 1;
    if (value.length) chunk += value[0];
    position += 1; continue;
  }
  if (spec === 'd' || spec === 'i') { chunk += String(toInt(rest[argIndex] !== undefined ? rest[argIndex] : 0)); argIndex += 1; position += 1; continue; }
  if (spec === 'u') { chunk += unsigned(toInt(rest[argIndex] !== undefined ? rest[argIndex] : 0, 'unsigned'), 10); argIndex += 1; position += 1; continue; }
  if (spec === 'o') { chunk += unsigned(toInt(rest[argIndex] !== undefined ? rest[argIndex] : 0), 8); argIndex += 1; position += 1; continue; }
  if (spec === 'x' || spec === 'X') { chunk += unsigned(toInt(rest[argIndex] !== undefined ? rest[argIndex] : 0), 16, spec === 'X'); argIndex += 1; position += 1; continue; }
  err('printf: ' + '%' + spec + ': unsupported directive');
  process.exit(1);
}
} while (directiveCount > 0 && argIndex < rest.length);
if (chunk) out(chunk);
process.exit(0);
`;
