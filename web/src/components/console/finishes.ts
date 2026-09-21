import * as THREE from 'three';

/** Small, repeatable PBR maps: pigment, surface relief and gloss are independent. */
export function plateFinish(kind: 'enamel' | 'nickel') {
    const width = 512, height = kind === 'enamel' ? 64 : 320;
    const count = width * height;
    const relief = new Float32Array(count);
    const color = new Uint8Array(count * 4), roughness = new Uint8Array(count * 4), normal = new Uint8Array(count * 4);
    const noise = (x: number, y: number) => {
        let n = Math.imul(x + 71, 374761393) ^ Math.imul(y + 139, 668265263);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967295 - .5;
    };
    const softNoise = (x: number, y: number) => {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const top = noise(ix, iy) * (1 - sx) + noise(ix + 1, iy) * sx;
        const bottom = noise(ix, iy + 1) * (1 - sx) + noise(ix + 1, iy + 1) * sx;
        return top * (1 - sy) + bottom * sy;
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x, fine = noise(x, y);
        const grain = kind === 'nickel'
            ? noise(0, y) * .65 + noise(Math.floor(x / 48), y) * .25 + fine * .10
            : fine * .18 + softNoise(x / 3, y / 3) * .57 + softNoise(x / 7, y / 7) * .25;
        relief[i] = grain;
        const pigment = kind === 'nickel' ? 235 + grain * 12 : 246 + grain * 13;
        const gloss = kind === 'nickel' ? 128 + grain * 30 : 150 + grain * 54;
        for (let channel = 0; channel < 3; channel++) {
            color[i * 4 + channel] = pigment;
            roughness[i * 4 + channel] = gloss;
        }
        color[i * 4 + 3] = roughness[i * 4 + 3] = 255;
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const dx = relief[y * width + (x + 1) % width] - relief[y * width + (x + width - 1) % width];
        const dy = relief[((y + 1) % height) * width + x] - relief[((y + height - 1) % height) * width + x];
        const strength = kind === 'nickel' ? .16 : .30;
        const length = Math.hypot(dx * strength, dy * strength, 1);
        normal[i * 4] = (1 - dx * strength / length) * 127.5;
        normal[i * 4 + 1] = (1 - dy * strength / length) * 127.5;
        normal[i * 4 + 2] = (1 + 1 / length) * 127.5;
        normal[i * 4 + 3] = 255;
    }
    const texture = (pixels: Uint8Array, srgb = false) => {
        const map = new THREE.DataTexture(pixels, width, height);
        map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.magFilter = THREE.LinearFilter;
        map.minFilter = THREE.LinearMipmapLinearFilter;
        map.generateMipmaps = true;
        map.needsUpdate = true;
        return map;
    };
    return { map: texture(color, true), roughnessMap: texture(roughness), normalMap: texture(normal) };
}
