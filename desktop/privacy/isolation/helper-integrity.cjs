// SPDX-License-Identifier: EUPL-1.2
// Signing appends/replaces LC_CODE_SIGNATURE and resizes __LINKEDIT. Bind every
// other byte, including all executable segments and load commands, to the build.
const { createHash } = require('node:crypto');
function executableDigest(input) {
  if (!Buffer.isBuffer(input) || input.length < 32 || input.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Expected a thin 64-bit Mach-O helper.');
  const count = input.readUInt32LE(16), size = input.readUInt32LE(20), end = 32 + size;
  if (count < 1 || count > 256 || end > input.length) throw new Error('Invalid Mach-O command bounds.');
  let cursor = 32, signature, linkedit;
  for (let i = 0; i < count; i++) {
    if (cursor + 8 > end) throw new Error('Truncated Mach-O command.');
    const command = input.readUInt32LE(cursor), length = input.readUInt32LE(cursor + 4);
    if (length < 8 || cursor + length > end) throw new Error('Invalid Mach-O command size.');
    if (command === 0x1d) {
      if (signature || length !== 16 || i !== count - 1) throw new Error('Unexpected Mach-O signature layout.');
      signature = { command: cursor, offset: input.readUInt32LE(cursor + 8), bytes: input.readUInt32LE(cursor + 12) };
    }
    if (command === 0x19 && input.subarray(cursor + 8, cursor + 24).toString('ascii').replace(/\0.*$/, '') === '__LINKEDIT') {
      if (linkedit || length < 72 || input.readUInt32LE(cursor + 60) & 2 || input.readUInt32LE(cursor + 60) & 4) throw new Error('Unexpected writable/executable __LINKEDIT.');
      linkedit = { command: cursor, offset: Number(input.readBigUInt64LE(cursor + 40)), bytes: Number(input.readBigUInt64LE(cursor + 48)) };
    }
    cursor += length;
  }
  if (cursor !== end || !signature || !linkedit || signature.offset < end || signature.offset < linkedit.offset || signature.offset + signature.bytes !== input.length || linkedit.offset + linkedit.bytes !== input.length) throw new Error('Invalid Mach-O signature region.');
  const payload = Buffer.from(input.subarray(0, signature.offset));
  payload.writeUInt32LE(0, signature.command + 12);
  payload.writeBigUInt64LE(0n, linkedit.command + 32);
  payload.writeBigUInt64LE(BigInt(signature.offset - linkedit.offset), linkedit.command + 48);
  return createHash('sha256').update(payload).digest('hex');
}
module.exports = { executableDigest };
