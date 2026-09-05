import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** Original geometry: no remote models, image assets or external rendering services. */
export default function DecoderScene({
  compact = false,
}: {
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    camera.position.set(9, 9, 13);
    camera.lookAt(0, 0.4, 0);
    scene.add(new THREE.HemisphereLight("#fff0d6", "#3d4039", 2.4));
    const key = new THREE.DirectionalLight("#fff0d7", 4.5);
    key.position.set(-3, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -10,
      right: 10,
      top: 10,
      bottom: -10,
    });
    key.shadow.normalBias = 0.04;
    scene.add(key);
    const rim = new THREE.DirectionalLight("#c1d2da", 2.2);
    rim.position.set(6, 3, -4);
    scene.add(rim);
    const assembly = new THREE.Group();
    scene.add(assembly);
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    function mat(color: string, metalness = 0, roughness = 0.5) {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
      materials.push(m);
      return m;
    }
    const cream = mat("#ddd9c7", 0.15),
      dark = mat("#242b29", 0.4),
      rubber = mat("#111a19"),
      steel = mat("#b6b5a3", 0.8, 0.25);
    const red = mat("#9e221b", 0.25, 0.28),
      paper = mat("#e7dcc2");
    function box(
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
      radius = 0.06,
    ) {
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(w, h, d, 3, radius),
        material,
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function label(
      parent: THREE.Object3D,
      text: string,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number,
      color = "#e9debf",
      bg = "#292e28",
      size = 72,
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = color;
      ctx.font = `bold ${size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 512, 128, 980);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.65,
      });
      materials.push(material);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      plane.position.set(x, y, z);
      parent.add(plane);
      return plane;
    }
    function machine(light: boolean, x: number, z: number, angle: number) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = angle;
      assembly.add(g);
      box(g, 7.4, 0.44, 2.65, 0, 0.28, 0, rubber, 0.12);
      box(g, 7.2, 0.42, 2.5, 0, 0.61, 0, light ? cream : dark, 0.12);
      const face = new THREE.Group();
      face.position.set(0, 1.55, -0.44);
      face.rotation.x = -0.18;
      g.add(face);
      box(face, 7.2, 2.12, 0.42, 0, 0, 0, light ? cream : dark, 0.1);
      box(face, 6.8, 1.76, 0.07, 0, -0.01, 0.25, rubber);
      for (let i = 0; i < 4; i++) {
        const px = (i - 1.5) * 1.59;
        box(face, 1.42, 1.29, 0.1, px, 0.06, 0.32, steel);
        box(face, 1.29, 1.14, 0.12, px, 0.08, 0.39, red);
        label(
          face,
          light && !compact
            ? ["月球", "钻石", "风暴", "幽灵"][i]
            : ["•••", "•••", "•••", "•••"][i],
          1.15,
          0.55,
          px,
          0.12,
          0.457,
          "#ffaaa0",
          "#7d201c",
          225,
        );
        label(
          face,
          `${i + 1}`,
          0.32,
          0.25,
          px,
          -0.71,
          0.307,
          light ? "#e9e5ce" : "#cfcebb",
          "#292e28",
          175,
        );
      }
      label(
        g,
        "D E C R Y P T O   /   " + (light ? "01" : "02"),
        3.1,
        0.31,
        -0.9,
        0.85,
        1.22,
        light ? "#272c28" : "#ded9bf",
        light ? "#ddd9c7" : "#242b29",
      );
      for (const x of [-3.25, 3.25])
        for (const y of [-0.83, 0.84]) {
          const screw = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.025, 12),
            steel,
          );
          screw.rotation.x = Math.PI / 2;
          screw.position.set(x, y, 0.23);
          face.add(screw);
        }
      for (let i = 0; i < 10; i++)
        box(g, 0.025, 0.035, 0.36, 1.8 + i * 0.1, 0.845, 0.43, rubber, 0.005);
      box(g, 0.4, 0.12, 0.3, 2.94, 0.89, 0.49, red, 0.025);
      return g;
    }
    machine(false, 0.25, -2.8, -0.15);
    machine(true, -0.3, 1.1, 0.09);
    const card = new THREE.Group();
    card.position.set(-2.65, 0.1, 3.22);
    card.rotation.set(-Math.PI / 2, 0, -0.25);
    assembly.add(card);
    box(card, 2.05, 1.22, 0.035, 0, 0, 0, paper, 0.035);
    label(
      card,
      "2  ·  4  ·  1",
      1.8,
      0.55,
      0,
      0,
      0.025,
      "#242b29",
      "#e7dcc2",
      120,
    );
    label(
      card,
      "SECRET CODE",
      1.5,
      0.22,
      0,
      0.42,
      0.026,
      "#8b3829",
      "#e7dcc2",
      65,
    );
    for (let i = 0; i < 3; i++) {
      const token = new THREE.Mesh(
        new THREE.CylinderGeometry(0.39, 0.39, 0.1, 48),
        i === 2 ? dark : cream,
      );
      token.position.set(2.5 + i * 0.38, 0.14 + i * 0.08, 2.9 - i * 0.22);
      token.castShadow = true;
      assembly.add(token);
      const mark = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.016, 8, 40),
        red,
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.copy(token.position);
      mark.position.y += 0.06;
      assembly.add(mark);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.24 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let px = 0,
      py = 0,
      frame = 0,
      disposed = false;
    function resize() {
      const { width, height } = el!.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.position.set(9, 9, 13).multiplyScalar(width < 550 ? 1.17 : 1);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    function move(event: PointerEvent) {
      const r = el!.getBoundingClientRect();
      px = (event.clientX - r.left) / r.width - 0.5;
      py = (event.clientY - r.top) / r.height - 0.5;
    }
    function reset() {
      px = 0;
      py = 0;
    }
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", reset);
    function render() {
      if (disposed) return;
      const targetY = reduced.matches ? 0 : px * 0.15;
      const targetX = reduced.matches ? 0 : py * 0.025;
      if (!document.hidden && (Math.abs(targetY - assembly.rotation.y) > 0.0001 || Math.abs(targetX - assembly.rotation.x) > 0.0001)) {
        assembly.rotation.y +=
          ((reduced.matches ? 0 : px * 0.15) - assembly.rotation.y) * 0.055;
        assembly.rotation.x +=
          ((reduced.matches ? 0 : py * 0.025) - assembly.rotation.x) * 0.055;
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(render);
    }
    render();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", reset);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      floor.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [compact]);
  return (
    <div
      className={`decoder-scene ${compact ? "compact" : ""}`}
      ref={host}
      role="img"
      aria-label="立体黑白双队密码机，四个红色解码窗、密码卡和拦截筹码"
    >
      {unavailable && (
        <div className="scene-fallback">
          <span>DECRYPTO</span>
          <div>
            {[1, 2, 3, 4].map((n) => (
              <b key={n}>{n}</b>
            ))}
          </div>
          <small>密码终端 · 已就绪</small>
        </div>
      )}
    </div>
  );
}
