const zlib = require('node:zlib');

// Reproducerbare ZIP-filer uden eksterne afhængigheder: fast dato, sorteret rækkefølge og UTF-8-navne.
function dosDateTime(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { date: ((year - 1980) << 9) | (month << 5) | day, time: 0 };
}

function zip(files, isoDate) {
  const { date, time } = dosDateTime(isoDate);
  const locals = [];
  const central = [];
  let offset = 0;
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.data, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE((3 << 8) | 20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x0800, 8); header.writeUInt16LE(8, 10);
    header.writeUInt16LE(time, 12); header.writeUInt16LE(date, 14); header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(packed.length, 20); header.writeUInt32LE(data.length, 24); header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38); header.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    central.push(header, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// Læser en ZIP-fil fra zip(). Bruges af testene til at kontrollere det, brugeren faktisk henter.
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let position = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const nameLength = buffer.readUInt16LE(position + 28);
    const name = buffer.subarray(position + 46, position + 46 + nameLength).toString('utf8');
    const local = buffer.readUInt32LE(position + 42);
    const size = buffer.readUInt32LE(position + 20);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = zlib.inflateRawSync(buffer.subarray(start, start + size));
    if (zlib.crc32(data) !== buffer.readUInt32LE(position + 16)) throw new Error(`Forkert kontrolsum i ${name}.`);
    files.set(name, data.toString('utf8'));
    position += 46 + nameLength + buffer.readUInt16LE(position + 30) + buffer.readUInt16LE(position + 32);
  }
  return files;
}

module.exports = { zip, unzip };
