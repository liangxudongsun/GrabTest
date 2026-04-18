const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;

function createPNG(width, height, pixels) {
    const rawRows = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 4);
        row[0] = 0;
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            row[1 + x * 4 + 0] = pixels[i + 0];
            row[1 + x * 4 + 1] = pixels[i + 1];
            row[1 + x * 4 + 2] = pixels[i + 2];
            row[1 + x * 4 + 3] = pixels[i + 3];
        }
        rawRows.push(row);
    }
    const rawData = Buffer.concat(rawRows);
    const compressed = zlib.deflateSync(rawData);

    function crc32(buf) {
        let crc = 0xFFFFFFFF;
        const table = new Int32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
                else c = c >>> 1;
            }
            table[i] = c;
        }
        for (let i = 0; i < buf.length; i++) {
            crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function chunk(type, data) {
        const typeData = Buffer.concat([Buffer.from(type), data]);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const crcVal = Buffer.alloc(4);
        crcVal.writeUInt32BE(crc32(typeData));
        return Buffer.concat([len, typeData, crcVal]);
    }

    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', compressed),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function simpleNoise(x, y, seed) {
    let n = Math.sin(x * 127.1 + y * 311.7 + seed * 43758.5453) * 43758.5453;
    return n - Math.floor(n);
}

function smoothNoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const n00 = simpleNoise(ix, iy, seed);
    const n10 = simpleNoise(ix + 1, iy, seed);
    const n01 = simpleNoise(ix, iy + 1, seed);
    const n11 = simpleNoise(ix + 1, iy + 1, seed);
    const nx0 = n00 * (1 - sx) + n10 * sx;
    const nx1 = n01 * (1 - sx) + n11 * sx;
    return nx0 * (1 - sy) + nx1 * sy;
}

function fbm(x, y, seed, octaves) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * smoothNoise(x * frequency, y * frequency, seed + i * 17.3);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value;
}

function generateFrostedNormalMap(width, height) {
    const pixels = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const nx = x / width;
            const ny = y / height;

            const fine = fbm(nx * 60, ny * 60, 42, 5) * 2 - 1;
            const medium = fbm(nx * 20, ny * 20, 123, 4) * 2 - 1;
            const coarse = fbm(nx * 6, ny * 6, 77, 3) * 2 - 1;

            const normalX = fine * 0.25 + medium * 0.15 + coarse * 0.05;
            const normalY = fine * 0.25 + medium * 0.15 + coarse * 0.05;
            const normalZ = 1.0;

            const len = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);

            pixels[idx + 0] = Math.max(0, Math.min(255, Math.round((normalX / len * 0.5 + 0.5) * 255)));
            pixels[idx + 1] = Math.max(0, Math.min(255, Math.round((normalY / len * 0.5 + 0.5) * 255)));
            pixels[idx + 2] = Math.max(0, Math.min(255, Math.round((normalZ / len * 0.5 + 0.5) * 255)));
            pixels[idx + 3] = 255;
        }
    }
    return pixels;
}

function generateFrostedDiffuseMap(width, height) {
    const pixels = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const nx = x / width;
            const ny = y / height;

            const noise1 = fbm(nx * 15, ny * 15, 99, 4);
            const noise2 = fbm(nx * 40, ny * 40, 55, 3);
            const noise3 = fbm(nx * 5, ny * 5, 33, 2);

            const base = 0.88 + noise1 * 0.06 + noise2 * 0.03 + noise3 * 0.03;
            const val = Math.max(0, Math.min(1, base));

            pixels[idx + 0] = Math.round(val * 240 + 15);
            pixels[idx + 1] = Math.round(val * 243 + 12);
            pixels[idx + 2] = Math.round(val * 250 + 5);
            pixels[idx + 3] = 255;
        }
    }
    return pixels;
}

function generateFrostedMaskMap(width, height) {
    const pixels = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const nx = x / width;
            const ny = y / height;

            const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny);
            const edgeFade = Math.min(1, edgeDist * 15);

            const noise = fbm(nx * 20, ny * 20, 77, 3) * 0.1;

            const alpha = Math.max(0, Math.min(1, edgeFade + noise));

            pixels[idx + 0] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = Math.round(alpha * 220 + 20);
        }
    }
    return pixels;
}

const outDir = path.join(__dirname, 'assets', 'Textures');

const normalPixels = generateFrostedNormalMap(SIZE, SIZE);
fs.writeFileSync(path.join(outDir, 'FrostedGlass_Normal.png'), createPNG(SIZE, SIZE, normalPixels));
console.log('Generated: FrostedGlass_Normal.png (random grain frosted normal)');

const diffusePixels = generateFrostedDiffuseMap(SIZE, SIZE);
fs.writeFileSync(path.join(outDir, 'FrostedGlass_Diffuse.png'), createPNG(SIZE, SIZE, diffusePixels));
console.log('Generated: FrostedGlass_Diffuse.png (frosted white diffuse)');

const maskPixels = generateFrostedMaskMap(SIZE, SIZE);
fs.writeFileSync(path.join(outDir, 'FrostedGlass_Mask.png'), createPNG(SIZE, SIZE, maskPixels));
console.log('Generated: FrostedGlass_Mask.png (edge fade mask)');

console.log('Done!');
