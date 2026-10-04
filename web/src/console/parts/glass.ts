import * as THREE from 'three';
import { crtGeometry } from '../crt';

/** Clear glass whose reflections do not fade with its transparency. */
export function glassMaterial(bright = false) {
    // Over a dark tube the pane may trade background for reflection. Over a pale
    // dial that trade cancels the reflection out, so there the mirrored light is
    // added on top, and the pane only takes the few percent real glass keeps.
    const material = new THREE.MeshPhysicalMaterial({
        color: '#091412', metalness: 0, roughness: bright ? .09 : .22,
        ior: 1.52, specularIntensity: bright ? 1 : .35, envMapIntensity: bright ? 1 : .30, premultipliedAlpha: bright,
        transparent: true, opacity: 1, depthWrite: false,
    });
    // Keep the physical specular response independent of the clear substrate.
    // Every reflection comes from the shared lights / environment and the
    // mesh's actual curved normals; there are no painted softboxes or streaks.
    material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            vec3 glassReflection = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
            float glassPeak = max(max(glassReflection.r, glassReflection.g), glassReflection.b);
            #ifdef GLASS_ADDITIVE
            gl_FragColor = vec4(glassReflection, .06);
            #else
            float glassAlpha = clamp(.006 + glassPeak, .006, .32);
            gl_FragColor = vec4((diffuseColor.rgb * .006 + glassReflection) / glassAlpha, glassAlpha);
            #endif
        `);
    };
    if (bright) material.defines = { ...material.defines, GLASS_ADDITIVE: '' };
    material.customProgramCacheKey = () => `crt-physical-glass-v2-${bright}`;
    return material;
}

/** Clearcoat acrylic that keeps its reflections, fitted to a cover as exported. */
export function clearAcrylic(acrylic: THREE.MeshPhysicalMaterial) {
    acrylic.depthWrite = false; acrylic.side = THREE.FrontSide;
    acrylic.roughness = .10; acrylic.metalness = 0;
    acrylic.ior = 1.49; acrylic.clearcoat = 1; acrylic.clearcoatRoughness = .065;
    acrylic.envMapIntensity = .14;
    // Preserve the real light/environment specular independently of
    // the clear substrate's opacity. Ordinary alpha fades both away;
    // screen-space transmission also omits the transparent tube glass.
    acrylic.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            vec3 acrylicReflection = totalSpecular;
            #ifdef USE_CLEARCOAT
            acrylicReflection += material.clearcoat * (clearcoatSpecularDirect + clearcoatSpecularIndirect);
            #endif
            float reflectionPeak = max(max(acrylicReflection.r, acrylicReflection.g), acrylicReflection.b);
            float acrylicAlpha = clamp(0.055 + reflectionPeak * 0.80, 0.055, 0.48);
            gl_FragColor = vec4((acrylicReflection + diffuseColor.rgb * 0.002) / acrylicAlpha, acrylicAlpha);
        `);
    };
    acrylic.customProgramCacheKey = () => 'clear-acrylic-specular-v1';
}

/**
 * The meter's crystal was exported as ordinary alpha, which faded its
 * reflections along with the glass: at 7% opacity it looked uncovered.
 */
export function fitCrystal(crystal: THREE.Object3D | undefined) {
    if (!(crystal instanceof THREE.Mesh)) return;
    // A dead-flat pane facing the camera mirrors only the dim room behind
    // it. Meter crystals are pressed slightly convex, which is what lets
    // them catch the key light the way the tube faces do.
    const box = crystal.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(crystal.geometry.getAttribute('position') as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    crystal.geometry.dispose();
    crystal.geometry = crtGeometry(size.x, size.y, { rise: .07, radius: .05, columns: 48, rows: 24, warp: 0, depth: 0, innerRise: 0, seat: 0 });
    crystal.material = glassMaterial(true);
    crystal.renderOrder = 6;
    crystal.castShadow = crystal.receiveShadow = false;
}
