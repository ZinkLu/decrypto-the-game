import * as THREE from 'three';

interface CrtProfile {
    rise: number;
    radius: number;
    columns: number;
    rows: number;
    warp: number;
    depth: number;
    innerRise: number;
    seat: number;
}

export function crtProfile(name: string): CrtProfile | undefined {
    if (name === 'screen') return { rise: .18, radius: .23, columns: 128, rows: 80, warp: .07, depth: .04, innerRise: .168, seat: .08 };
    if (name === 'scope') return { rise: .04, radius: .09, columns: 64, rows: 48, warp: .08, depth: .013, innerRise: .034, seat: .03 };
    if (/^word[0-3]$/.test(name)) return { rise: .035, radius: .085, columns: 64, rows: 40, warp: .055, depth: .012, innerRise: .03, seat: .05 };
}

// A shallow elliptic paraboloid has continuous convex curvature, including at
// the corners. Multiplying two edge-pinned arcs creates a pillow with pinched
// corners and steep shoulders. The faceplate instead seats beneath the hood
// with gently bowed edges; its maximum slope stays below nine degrees.
export function crtHeight(u: number, v: number, rise: number) {
    const x = 2 * u - 1, y = 2 * v - 1;
    return rise * (1 - .5 * (x * x + y * y));
}

export function crtGeometry(width: number, height: number, profile: CrtProfile) {
    const { rise, columns, rows } = profile;
    // Extend the glass under the modeled retaining lip. Its cut edge must be
    // hidden inside the housing, not float above the gasket as a second outline.
    // UVs keep the original display dimensions, so seating never stretches ink.
    const outerWidth = width + profile.seat * 2, outerHeight = height + profile.seat * 2;
    const radius = Math.min(profile.radius + profile.seat, outerWidth / 2, outerHeight / 2);
    const ys: number[] = [];
    // Extra samples around the rounded corners keep their silhouette smooth
    // in close-ups without over-tessellating the entire phosphor face.
    const cornerSteps = 12;
    for (let i = 0; i < cornerSteps; i++)
        ys.push(-outerHeight / 2 + radius * (1 - Math.cos(i / cornerSteps * Math.PI / 2)));
    for (let i = 0; i <= rows; i++)
        ys.push(-outerHeight / 2 + radius + (outerHeight - radius * 2) * i / rows);
    for (let i = 1; i <= cornerSteps; i++)
        ys.push(outerHeight / 2 - radius + radius * Math.sin(i / cornerSteps * Math.PI / 2));

    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (const y of ys) {
        const cornerY = Math.max(0, Math.abs(y) - (outerHeight / 2 - radius));
        const halfWidth = outerWidth / 2 - radius + Math.sqrt(Math.max(0, radius * radius - cornerY * cornerY));
        for (let i = 0; i <= columns; i++) {
            const x = (2 * i / columns - 1) * halfWidth;
            const u = x / width + .5, v = y / height + .5;
            const nx = 2 * u - 1, ny = 2 * v - 1;
            positions.push(x, y, crtHeight(u, v, rise));
            // Analytic normals have no faceting or corner seams, even where
            // the rounded outline needs much denser rows than the center.
            const normal = new THREE.Vector3(2 * rise * nx / width, 2 * rise * ny / height, 1).normalize();
            normals.push(normal.x, normal.y, normal.z);
            uvs.push(u, v);
        }
    }
    for (let row = 0; row < ys.length - 1; row++) {
        for (let col = 0; col < columns; col++) {
            const a = row * (columns + 1) + col, b = a + columns + 1;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

// Trace through the outer glass to a separate curved phosphor coating. This
// same optical path is used by the GPU and inverted for accessible DOM inputs.
// Without `refraction` (the lite optics) the picture sits on the faceplate and
// only the raster's barrel warp remains.
export function crtRasterUv(u: number, v: number, width: number, height: number,
    profile: CrtProfile, eye: THREE.Vector3, refraction = true) {
    if (!refraction) {
        const x = u - .5, y = v - .5, scale = 1 + (x * x + y * y) * profile.warp;
        return { u: .5 + x * scale, v: .5 + y * scale };
    }
    const px = (u - .5) * width, py = (v - .5) * height, pz = crtHeight(u, v, profile.rise);
    const ux = 2 * u - 1, vy = 2 * v - 1;
    let nx = 2 * profile.rise * ux / width;
    let ny = 2 * profile.rise * vy / height;
    const normalLength = Math.hypot(nx, ny, 1), nz = 1 / normalLength;
    nx /= normalLength; ny /= normalLength;
    let ix = px - eye.x, iy = py - eye.y, iz = pz - eye.z;
    const incidentLength = Math.hypot(ix, iy, iz);
    ix /= incidentLength; iy /= incidentLength; iz /= incidentLength;
    const eta = 1 / 1.52, dot = nx * ix + ny * iy + nz * iz;
    const bend = eta * dot + Math.sqrt(1 - eta * eta * (1 - dot * dot));
    const rx = eta * ix - bend * nx, ry = eta * iy - bend * ny, rz = eta * iz - bend * nz;
    let distance = (pz - crtHeight(u, v, profile.innerRise) + profile.depth) / Math.max(.12, -rz);
    // Scalar math avoids allocating vectors inside every Newton iteration while
    // the inspection camera reprojects all input controls on each moving frame.
    for (let i = 0; i < 5; i++) {
        const x = 2 * (px + rx * distance) / width, y = 2 * (py + ry * distance) / height;
        const inner = profile.innerRise * (1 - .5 * (x * x + y * y)) - profile.depth;
        const sx = -2 * profile.innerRise * x / width;
        const sy = -2 * profile.innerRise * y / height;
        distance -= (pz + rz * distance - inner) / Math.min(-.12, rz - sx * rx - sy * ry);
    }
    const x = (px + rx * distance) / width, y = (py + ry * distance) / height;
    const scale = 1 + (x * x + y * y) * profile.warp;
    return { u: .5 + x * scale, v: .5 + y * scale };
}

export function crtDisplayUv(u: number, v: number, width: number, height: number,
    profile: CrtProfile, eye: THREE.Vector3, refraction = true) {
    let x = u, y = v;
    const step = .0001;
    // Newton inversion includes refraction and camera position; a fixed radial
    // inverse would leave the real input controls behind when inspecting sideways.
    for (let i = 0; i < 7; i++) {
        const at = crtRasterUv(x, y, width, height, profile, eye, refraction);
        const dx = crtRasterUv(x + step, y, width, height, profile, eye, refraction);
        const dy = crtRasterUv(x, y + step, width, height, profile, eye, refraction);
        const a = (dx.u - at.u) / step, b = (dy.u - at.u) / step;
        const c = (dx.v - at.v) / step, d = (dy.v - at.v) / step;
        const determinant = a * d - b * c;
        if (Math.abs(determinant) < .00001) break;
        const eu = at.u - u, ev = at.v - v;
        x -= (d * eu - b * ev) / determinant;
        y -= (a * ev - c * eu) / determinant;
        if (Math.abs(eu) + Math.abs(ev) < .000001) break;
    }
    return { u: x, v: y };
}

export const crtOpticsShader = `
    uniform vec3 crtEye;
    uniform vec2 crtSize;
    uniform float crtRise;
    uniform float crtInnerRise;
    uniform float crtDepth;
    float crtFace(vec2 uv, float rise) {
        vec2 p = uv * 2.0 - 1.0;
        return rise * (1.0 - .5 * dot(p, p));
    }
    vec2 crtSlope(vec2 uv, float rise) {
        vec2 p = uv * 2.0 - 1.0;
        return -2.0 * rise * p / crtSize;
    }
    vec2 crtPhosphorUv(vec2 uv) {
        vec3 front = vec3((uv - .5) * crtSize, crtFace(uv, crtRise));
        vec3 normal = normalize(vec3(-crtSlope(uv, crtRise), 1.0));
        vec3 ray = refract(normalize(front - crtEye), normal, 1.0 / 1.52);
        float distance = (front.z - crtFace(uv, crtInnerRise) + crtDepth) / max(.12, -ray.z);
        for (int i = 0; i < 5; i++) {
            vec3 hit = front + ray * distance;
            vec2 innerUv = hit.xy / crtSize + .5;
            float inner = crtFace(innerUv, crtInnerRise) - crtDepth;
            float derivative = ray.z - dot(crtSlope(innerUv, crtInnerRise), ray.xy);
            distance -= (hit.z - inner) / min(-.12, derivative);
        }
        return (front + ray * distance).xy / crtSize + .5;
    }
`;
