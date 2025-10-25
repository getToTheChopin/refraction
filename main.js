import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const container = document.getElementById("experience");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040608);

const pmrem = new THREE.PMREMGenerator(renderer);
const envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRenderTarget.texture;
pmrem.dispose();

const roomSize = 20;
const halfRoom = roomSize / 2;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
const cameraRadius = roomSize * 0.38;
const cameraVerticalOffset = roomSize * 0.08;
camera.position.set(0, cameraVerticalOffset, cameraRadius);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.75;
controls.minPolarAngle = Math.PI * 0.08;
controls.maxPolarAngle = Math.PI - Math.PI * 0.12;
controls.minDistance = roomSize * 0.18;
controls.maxDistance = roomSize * 1.8;
controls.update();

const controlsInertia = {
  isDragging: false,
  lastAzimuthalAngle: controls.getAzimuthalAngle(),
  lastPolarAngle: controls.getPolarAngle(),
  azimuthalVelocity: 0,
  polarVelocity: 0,
  maxVelocity: 8,
  minVelocity: 0.00002,
  decayStrength: 7.5
};

controls.addEventListener("start", () => {
  controlsInertia.isDragging = true;
  controlsInertia.azimuthalVelocity = 0;
  controlsInertia.polarVelocity = 0;
  controlsInertia.lastAzimuthalAngle = controls.getAzimuthalAngle();
  controlsInertia.lastPolarAngle = controls.getPolarAngle();
});

controls.addEventListener("end", () => {
  controlsInertia.isDragging = false;
});

const roomGeometry = new THREE.BoxGeometry(roomSize, roomSize, roomSize);
const roomMaterial = new THREE.MeshPhysicalMaterial({
  side: THREE.BackSide,
  roughness: 0.24,
  metalness: 0.1,
  envMapIntensity: 0.45,
  color: new THREE.Color(0x0a101f),
  sheen: 0.4,
  sheenColor: new THREE.Color(0x1e2c42),
  sheenRoughness: 0.85
});
const roomMesh = new THREE.Mesh(roomGeometry, roomMaterial);
scene.add(roomMesh);

const neonPastelPalette = [
  0xff8bd1,
  0xffb38a,
  0xfff59e,
  0xffd1ff,
  0xffc2a1,
  0xffa5e0
];

const sphereGroup = new THREE.Group();
scene.add(sphereGroup);

const spheres = [];

const collisionDelta = new THREE.Vector3();
const collisionNormal = new THREE.Vector3();
const collisionRelativeVelocity = new THREE.Vector3();
const collisionImpulse = new THREE.Vector3();
const maintainTempDirection = new THREE.Vector3();
const fallbackDirection = new THREE.Vector3();
const defaultLightDirection = new THREE.Vector3(0, 1, 0);
const candidatePosition = new THREE.Vector3();

const SphereType = Object.freeze({
  GLOW: "glow",
  GLASS: "glass"
});

const glowRayGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);

function createGlowRayMaterial(colorHex) {
  const color = new THREE.Color(colorHex);

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uBaseIntensity: { value: 1 },
      uPulse: { value: 1 },
      uRayDensity: { value: THREE.MathUtils.randFloat(6.0, 8.5) },
      uRayFalloff: { value: THREE.MathUtils.randFloat(1.3, 2.1) },
      uGlowStrength: { value: THREE.MathUtils.randFloat(2.2, 3.2) },
      uNoiseShift: { value: Math.random() * 1000 }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;

      uniform float uTime;
      uniform vec3 uColor;
      uniform float uBaseIntensity;
      uniform float uPulse;
      uniform float uRayDensity;
      uniform float uRayFalloff;
      uniform float uGlowStrength;
      uniform float uNoiseShift;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(a, b, u.x) +
               (c - a) * u.y * (1.0 - u.x) +
               (d - b) * u.x * u.y;
      }

      void main() {
        vec2 centered = vUv * 2.0 - 1.0;
        float radius = length(centered);

        if (radius > 1.0) {
          discard;
        }

        float angle = atan(centered.y, centered.x);
        float rayWave = cos(angle * uRayDensity + uTime * 1.4 + uNoiseShift);
        float rayMask = pow(max(rayWave, 0.0), uRayFalloff * 2.4);

        vec2 noiseCoord = vec2(angle / 6.28318, radius);
        noiseCoord *= 4.0;
        noiseCoord += vec2(uTime * 0.1 + uNoiseShift, uTime * 0.13 + uNoiseShift * 0.5);

        float animatedNoise = noise(noiseCoord);
        float streakFalloff = pow(max(0.0, 1.0 - radius * 1.2), 1.6);
        float rays = rayMask * streakFalloff * (0.65 + 0.35 * animatedNoise);

        float glow = exp(-radius * radius * uGlowStrength);

        float intensity = uBaseIntensity * uPulse;
        float alpha = clamp((glow * 0.75 + rays) * intensity, 0.0, 1.0);
        vec3 color = uColor * (glow * 1.4 + rays * 2.8) * intensity;

        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}


function getRandomPaletteIndex(excludeIndex = null) {
  if (neonPastelPalette.length <= 1) {
    return 0;
  }

  let index = Math.floor(Math.random() * neonPastelPalette.length);
  if (excludeIndex === null) {
    return index;
  }

  while (index === excludeIndex) {
    index = Math.floor(Math.random() * neonPastelPalette.length);
  }

  return index;
}

function setSphereLightColor(sphere, paletteIndex) {
  if (!sphere || sphere.type !== SphereType.GLOW) {
    if (sphere) {
      sphere.colorIndex = null;
    }
    return;
  }

  const paletteLength = neonPastelPalette.length;
  const safeIndex = paletteLength > 0 ? THREE.MathUtils.euclideanModulo(paletteIndex, paletteLength) : 0;
  sphere.colorIndex = safeIndex;
  const colorHex = paletteLength > 0 ? neonPastelPalette[safeIndex] : 0xffffff;

  if (sphere.light) {
    sphere.light.color.setHex(colorHex);
  }

  if (sphere.mesh && sphere.mesh.material && sphere.mesh.material.emissive) {
    sphere.mesh.material.emissive.setHex(colorHex);
  }

  if (sphere.glowMaterial && sphere.glowMaterial.uniforms && sphere.glowMaterial.uniforms.uColor) {
    sphere.glowMaterial.uniforms.uColor.value.setHex(colorHex);
  }
}

function cycleSphereLightColor(sphere) {
  if (!sphere || sphere.type !== SphereType.GLOW) {
    return;
  }

  const currentIndex = typeof sphere.colorIndex === "number" ? sphere.colorIndex : null;
  const nextIndex = getRandomPaletteIndex(currentIndex);
  setSphereLightColor(sphere, nextIndex);
}

function updateSphereLightIntensity(sphere) {
  if (!sphere || !sphere.mesh || !sphere.mesh.material) {
    return;
  }

  const baseEmissive = typeof sphere.baseEmissiveIntensity === "number" ? sphere.baseEmissiveIntensity : 0;
  const baseLight = typeof sphere.baseLightIntensity === "number" ? sphere.baseLightIntensity : 0;
  const baseGlow = typeof sphere.baseGlowIntensity === "number" ? sphere.baseGlowIntensity : 0;

  if (sphere.type === SphereType.GLOW) {
    const brightness = uiState.brightness;

    if (sphere.light) {
      sphere.light.intensity = baseLight * brightness;
    }
    sphere.mesh.material.emissiveIntensity = baseEmissive * brightness;

    if (sphere.glowMaterial && sphere.glowMaterial.uniforms && sphere.glowMaterial.uniforms.uBaseIntensity) {
      sphere.glowMaterial.uniforms.uBaseIntensity.value = baseGlow * brightness;
    }
  } else {
    if (sphere.light) {
      sphere.light.intensity = 0;
    }
    sphere.mesh.material.emissiveIntensity = 0;
    if (sphere.mesh.material.emissive) {
      sphere.mesh.material.emissive.setRGB(0, 0, 0);
    }
  }
}


function onSphereCollision(sphere) {
  cycleSphereLightColor(sphere);
}

const baseSphereSize = {
  minRadius: 0.65,
  maxRadius: 1.25
};

const sphereSizeScaleRange = { min: 0.75, max: 1.35 };
const sphereConfig = {
  minRadius: baseSphereSize.minRadius,
  maxRadius: baseSphereSize.maxRadius
};

const sphereSpeedRange = { min: 1.9, max: 2.8 };

const sphereCountRange = { min: 6, max: 36 };
const refractionRange = { min: 1.1, max: 1.9 };
const thicknessScaleRange = { min: 0.85, max: 1.35 };
const brightnessRange = { min: 0.6, max: 1.8 };
const speedRange = { min: 0.5, max: 3 };

const uiState = {
  sphereSizeScale: 1,
  sphereCount: 12,
  refraction: 1.52,
  brightness: 1,
  speed: 2
};

const motionState = {
  speedMultiplier: uiState.speed
};

const uiElements = {
  sphereCountInput: document.getElementById("sphere-count"),
  sphereCountValue: document.querySelector('[data-value-for="sphere-count"]'),
  sphereSizeInput: document.getElementById("sphere-size"),
  sphereSizeValue: document.querySelector('[data-value-for="sphere-size"]'),
  refractionInput: document.getElementById("refraction-level"),
  refractionValue: document.querySelector('[data-value-for="refraction-level"]'),
  brightnessInput: document.getElementById("scene-brightness"),
  brightnessValue: document.querySelector('[data-value-for="scene-brightness"]'),
  speedInput: document.getElementById("movement-speed"),
  speedValue: document.querySelector('[data-value-for="movement-speed"]')
};

updateSphereSize(uiState.sphereSizeScale, { rebuild: false });

updateSphereCount(uiState.sphereCount);
updateRefraction(uiState.refraction);
updateBrightness(uiState.brightness);
updateSpeed(uiState.speed);
initializeUiControls();

const clock = new THREE.Clock();
let elapsedTime = 0;

renderer.setAnimationLoop(renderLoop);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clock.stop();
    renderer.setAnimationLoop(null);
  } else {
    clock.start();
    renderer.setAnimationLoop(renderLoop);
  }
});

function renderLoop() {
  const delta = Math.min(clock.getDelta(), 0.033);
  elapsedTime += delta;

  applyCameraInertia(delta);
  controls.update();
  updateCameraInertiaTracking(delta);

  updateSpheres(delta, elapsedTime);
  updateGlowBillboards();

  renderer.render(scene, camera);
}


function updateSpheres(delta, time) {
  const effectiveDelta = delta * motionState.speedMultiplier;
  const restitution = 0.9;
  const count = spheres.length;

  for (let i = 0; i < count; i += 1) {
    const sphere = spheres[i];
    const { mesh, velocity, hueDrift } = sphere;

    mesh.position.addScaledVector(velocity, effectiveDelta);

    const collidedWithBounds = enforceBounds(sphere);

    const hue = (sphere.hue + time * hueDrift) % 1;
    const material = mesh.material;

    if (sphere.type === SphereType.GLOW) {
      material.attenuationColor.setHSL(hue, sphere.saturation, sphere.lightness + 0.1);
      if (material.sheenColor) {
        material.sheenColor.setHSL((hue + 0.05) % 1, sphere.saturation * 0.6, 0.6);
      }
      material.envMapIntensity = 1.35 + Math.sin(time * 0.4 + sphere.phase) * 0.28;

      const pulseOffset = typeof sphere.glowPulseOffset === "number" ? sphere.glowPulseOffset : sphere.phase;
      if (sphere.light) {
        const flicker = 0.92 + Math.sin(time * 1.3 + pulseOffset * 1.2) * 0.08;
        sphere.light.intensity = sphere.baseLightIntensity * uiState.brightness * flicker;
      }

      const emissivePulse = 0.85 + Math.sin(time * 1.1 + pulseOffset * 0.8) * 0.15;
      material.emissiveIntensity = sphere.baseEmissiveIntensity * uiState.brightness * emissivePulse;

      if (sphere.glowMaterial && sphere.glowMaterial.uniforms) {
        const uniforms = sphere.glowMaterial.uniforms;
        uniforms.uTime.value = time;
        if (uniforms.uPulse) {
          const pulse = 0.82 + Math.sin(time * 1.4 + pulseOffset) * 0.18;
          uniforms.uPulse.value = pulse;
        }
      }

      if (sphere.glowMesh) {
        const scalePulse = 0.94 + Math.sin(time * 0.8 + pulseOffset * 0.7) * 0.08;
        const targetScale = sphere.glowScale * scalePulse;
        sphere.glowMesh.scale.set(targetScale, targetScale, targetScale);
      }
    } else {
      material.attenuationColor.setHex(0xffffff);
      if (material.sheenColor) {
        material.sheenColor.setHSL(0.58, 0.08, 0.72);
      }
      material.envMapIntensity = 1.12 + Math.sin(time * 0.3 + sphere.phase) * 0.12;
    }

    if (collidedWithBounds) {
      onSphereCollision(sphere);
    }
  }

  for (let i = 0; i < count - 1; i += 1) {
    const a = spheres[i];
    for (let j = i + 1; j < count; j += 1) {
      const b = spheres[j];
      resolveSphereCollision(a, b, restitution);
    }
  }

  for (let i = 0; i < count; i += 1) {
    maintainSphereSpeed(spheres[i]);
  }
}

function maintainSphereSpeed(sphere) {
  const { velocity, baseSpeed } = sphere;
  if (!velocity || !Number.isFinite(baseSpeed) || baseSpeed <= 0) {
    return;
  }

  const currentSpeed = velocity.length();
  if (currentSpeed < 1e-6) {
    if (sphere.lastMovementDirection && sphere.lastMovementDirection.lengthSq() > 1e-6) {
      maintainTempDirection.copy(sphere.lastMovementDirection);
    } else {
      fallbackDirection.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      if (fallbackDirection.lengthSq() < 1e-6) {
        fallbackDirection.copy(defaultLightDirection);
      }
      maintainTempDirection.copy(fallbackDirection);
    }

    if (maintainTempDirection.lengthSq() < 1e-6) {
      maintainTempDirection.copy(defaultLightDirection);
    }

    maintainTempDirection.normalize();
    velocity.copy(maintainTempDirection).multiplyScalar(baseSpeed);
    if (!sphere.lastMovementDirection) {
      sphere.lastMovementDirection = new THREE.Vector3();
    }
    sphere.lastMovementDirection.copy(maintainTempDirection);
    return;
  }

  const speedDelta = Math.abs(currentSpeed - baseSpeed);
  if (speedDelta > baseSpeed * 0.0005) {
    velocity.multiplyScalar(baseSpeed / currentSpeed);
  }

  if (!sphere.lastMovementDirection) {
    sphere.lastMovementDirection = new THREE.Vector3();
  }
  sphere.lastMovementDirection.copy(velocity).normalize();
}

function updateSphereCount(count) {
  const clamped = THREE.MathUtils.clamp(count, sphereCountRange.min, sphereCountRange.max);
  const target = Math.round(clamped);
  uiState.sphereCount = target;

  if (uiElements.sphereCountInput && uiElements.sphereCountInput.value !== String(target)) {
    uiElements.sphereCountInput.value = String(target);
  }
  setControlValue(uiElements.sphereCountValue, target, { decimals: 0 });

  if (target > spheres.length) {
    for (let i = spheres.length; i < target; i += 1) {
      addSphere();
    }
  } else if (target < spheres.length) {
    for (let i = spheres.length; i > target; i -= 1) {
      removeSphere();
    }
  }
}

function addSphere() {
  const radius = THREE.MathUtils.lerp(sphereConfig.minRadius, sphereConfig.maxRadius, Math.random());
  const geometry = new THREE.SphereGeometry(radius, 48, 48);

  const type = spheres.length % 2 === 0 ? SphereType.GLOW : SphereType.GLASS;
  const hue = Math.random();
  const glowSaturation = 0.45 + Math.random() * 0.25;
  const glowLightness = 0.45 + Math.random() * 0.25;
  const glassLightness = 0.56 + Math.random() * 0.08;

  const saturation = type === SphereType.GLOW ? glowSaturation : 0;
  const lightness = type === SphereType.GLOW ? glowLightness : glassLightness;

  const attenuationColor =
    type === SphereType.GLOW
      ? new THREE.Color().setHSL(hue, glowSaturation, glowLightness + 0.1)
      : new THREE.Color(0xffffff);
  const sheenColor =
    type === SphereType.GLOW
      ? new THREE.Color().setHSL((hue + 0.05) % 1, glowSaturation * 0.6, 0.6)
      : new THREE.Color().setHSL(0.58, 0.1, 0.72);

  const baseThickness = radius * (1.8 + Math.random() * 0.6);
  const currentRefraction = THREE.MathUtils.clamp(uiState.refraction, refractionRange.min, refractionRange.max);
  const thicknessScale = THREE.MathUtils.mapLinear(
    currentRefraction,
    refractionRange.min,
    refractionRange.max,
    thicknessScaleRange.min,
    thicknessScaleRange.max
  );
  const attenuationDistance =
    type === SphereType.GLOW ? 1.4 + Math.random() * 1.4 : THREE.MathUtils.randFloat(3.6, 5.2);

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    transmission: 1,
    roughness: type === SphereType.GLOW ? 0.04 : 0.022,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: type === SphereType.GLOW ? 0.05 : 0.02,
    thickness: baseThickness * thicknessScale,
    envMapIntensity: type === SphereType.GLOW ? 1.35 : 1.18,
    attenuationColor,
    attenuationDistance,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    sheen: type === SphereType.GLOW ? 0.4 : 0.28,
    sheenColor,
    sheenRoughness: type === SphereType.GLOW ? 0.7 : 0.55,
    ior: currentRefraction,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0
  });

  const mesh = new THREE.Mesh(geometry, material);
  const position = generateNonCollidingPosition(radius);
  mesh.position.copy(position);
  sphereGroup.add(mesh);

  const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5);
  if (direction.lengthSq() < 1e-6) {
    direction.set(1, 0, 0);
  }
  direction.normalize();
  const baseSpeed = THREE.MathUtils.randFloat(sphereSpeedRange.min, sphereSpeedRange.max);
  const velocity = direction.clone().multiplyScalar(baseSpeed);

  const colorIndex = type === SphereType.GLOW ? getRandomPaletteIndex() : null;
  const baseLightIntensity =
    type === SphereType.GLOW
      ? THREE.MathUtils.mapLinear(radius, sphereConfig.minRadius, sphereConfig.maxRadius, 160, 320)
      : 0;
  const baseEmissiveIntensity =
    type === SphereType.GLOW
      ? THREE.MathUtils.mapLinear(radius, sphereConfig.minRadius, sphereConfig.maxRadius, 1.6, 2.6)
      : 0;
  const baseGlowIntensity =
    type === SphereType.GLOW
      ? THREE.MathUtils.mapLinear(radius, sphereConfig.minRadius, sphereConfig.maxRadius, 1.45, 2.25)
      : 0;

  let light = null;
  let glowMaterial = null;
  let glowMesh = null;
  let glowScale = radius;

  if (type === SphereType.GLOW) {
    const paletteColor = neonPastelPalette[colorIndex ?? 0];
    const lightDistance = radius * 22;
    light = new THREE.PointLight(paletteColor, baseLightIntensity * uiState.brightness, lightDistance, 1.6);
    light.decay = 1.6;
    light.castShadow = false;
    mesh.add(light);
    material.emissiveIntensity = baseEmissiveIntensity * uiState.brightness;

    glowMaterial = createGlowRayMaterial(paletteColor);
    if (glowMaterial.uniforms.uBaseIntensity) {
      glowMaterial.uniforms.uBaseIntensity.value = baseGlowIntensity * uiState.brightness;
    }
    if (glowMaterial.uniforms.uPulse) {
      glowMaterial.uniforms.uPulse.value = 1;
    }

    glowMesh = new THREE.Mesh(glowRayGeometry, glowMaterial);
    glowScale = radius * THREE.MathUtils.randFloat(4.6, 5.4);
    glowMesh.scale.set(glowScale, glowScale, glowScale);
    glowMesh.position.copy(mesh.position);
    glowMesh.renderOrder = 5;
    glowMesh.frustumCulled = false;
    sphereGroup.add(glowMesh);
  }

  const sphereData = {
    mesh,
    radius,
    velocity,
    baseSpeed,
    hue,
    saturation,
    lightness,
    hueDrift: THREE.MathUtils.randFloat(0.012, 0.02),
    phase: Math.random() * Math.PI * 2,
    baseThickness,
    light,
    baseLightIntensity,
    colorIndex,
    type,
    baseEmissiveIntensity,
    lastMovementDirection: direction.clone(),
    glowMaterial,
    glowMesh,
    baseGlowIntensity,
    glowScale,
    glowPulseOffset: Math.random() * Math.PI * 2
  };

  if (type === SphereType.GLOW) {
    setSphereLightColor(sphereData, colorIndex);
  }

  updateSphereLightIntensity(sphereData);

  spheres.push(sphereData);
}

function removeSphere() {
  const sphere = spheres.pop();
  if (!sphere) {
    return;
  }

  if (sphere.light) {
    if (sphere.light.parent) {
      sphere.light.parent.remove(sphere.light);
    }
    if (typeof sphere.light.dispose === "function") {
      sphere.light.dispose();
    }
  }

  if (sphere.glowMesh) {
    sphereGroup.remove(sphere.glowMesh);
  }
  if (sphere.glowMaterial && typeof sphere.glowMaterial.dispose === "function") {
    sphere.glowMaterial.dispose();
  }

  sphereGroup.remove(sphere.mesh);
  sphere.mesh.geometry.dispose();
  disposeMaterial(sphere.mesh.material);
}

function updateRefraction(level) {
  const value = THREE.MathUtils.clamp(level, refractionRange.min, refractionRange.max);
  uiState.refraction = value;

  if (uiElements.refractionInput) {
    uiElements.refractionInput.value = value.toFixed(2);
  }
  setControlValue(uiElements.refractionValue, value, { decimals: 2 });

  const thicknessScale = THREE.MathUtils.mapLinear(
    value,
    refractionRange.min,
    refractionRange.max,
    thicknessScaleRange.min,
    thicknessScaleRange.max
  );
  spheres.forEach((sphere) => {
    const material = sphere.mesh.material;
    material.ior = value;
    material.thickness = sphere.baseThickness * thicknessScale;
    material.needsUpdate = true;
  });
}

function updateBrightness(level) {
  const value = THREE.MathUtils.clamp(level, brightnessRange.min, brightnessRange.max);
  uiState.brightness = value;

  if (uiElements.brightnessInput) {
    uiElements.brightnessInput.value = value.toFixed(2);
  }
  setControlValue(uiElements.brightnessValue, value, { decimals: 2 });

  spheres.forEach((sphere) => {
    updateSphereLightIntensity(sphere);
  });
  renderer.toneMappingExposure = 1.25 * value;
}

function updateSpeed(level) {
  const value = THREE.MathUtils.clamp(level, speedRange.min, speedRange.max);
  uiState.speed = value;
  motionState.speedMultiplier = value;

  if (uiElements.speedInput) {
    uiElements.speedInput.value = value.toFixed(2);
  }
  setControlValue(uiElements.speedValue, value, { decimals: 2, suffix: "×" });
}

function setControlValue(element, value, { decimals = 2, suffix = "" } = {}) {
  if (!element) {
    return;
  }

  let textValue;
  if (typeof decimals === "number") {
    textValue = decimals === 0 ? Math.round(value).toString() : Number(value).toFixed(decimals);
  } else {
    textValue = String(value);
  }

  element.textContent = `${textValue}${suffix}`;
}

function updateSphereSize(scale, { rebuild = true } = {}) {
  const clamped = THREE.MathUtils.clamp(scale, sphereSizeScaleRange.min, sphereSizeScaleRange.max);
  uiState.sphereSizeScale = clamped;
  sphereConfig.minRadius = baseSphereSize.minRadius * clamped;
  sphereConfig.maxRadius = baseSphereSize.maxRadius * clamped;

  if (uiElements.sphereSizeInput) {
    uiElements.sphereSizeInput.value = clamped.toFixed(2);
  }
  setControlValue(uiElements.sphereSizeValue, clamped, { decimals: 2, suffix: "×" });

  if (rebuild) {
    rebuildSpheresWithCurrentConfig();
  }
}

function rebuildSpheresWithCurrentConfig() {
  const targetCount = uiState.sphereCount;

  while (spheres.length > 0) {
    removeSphere();
  }

  for (let i = 0; i < targetCount; i += 1) {
    addSphere();
  }
}

function initializeUiControls() {
  if (uiElements.sphereSizeInput) {
    uiElements.sphereSizeInput.addEventListener("input", (event) => {
      updateSphereSize(Number(event.target.value));
    });
  }

  if (uiElements.sphereCountInput) {
    uiElements.sphereCountInput.addEventListener("input", (event) => {
      updateSphereCount(Number(event.target.value));
    });
  }

  if (uiElements.refractionInput) {
    uiElements.refractionInput.addEventListener("input", (event) => {
      updateRefraction(Number(event.target.value));
    });
  }

  if (uiElements.brightnessInput) {
    uiElements.brightnessInput.addEventListener("input", (event) => {
      updateBrightness(Number(event.target.value));
    });
  }

  if (uiElements.speedInput) {
    uiElements.speedInput.addEventListener("input", (event) => {
      updateSpeed(Number(event.target.value));
    });
  }
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  if (Array.isArray(material)) {
    material.forEach((item) => disposeMaterial(item));
    return;
  }

  if (typeof material.dispose === "function") {
    material.dispose();
  }
}

function enforceBounds(sphere) {
  const { mesh, velocity, radius } = sphere;
  const position = mesh.position;
  const limit = halfRoom - radius;
  let collided = false;

  if (position.x > limit) {
    position.x = limit;
    velocity.x = -Math.abs(velocity.x);
    collided = true;
  } else if (position.x < -limit) {
    position.x = -limit;
    velocity.x = Math.abs(velocity.x);
    collided = true;
  }

  if (position.y > limit) {
    position.y = limit;
    velocity.y = -Math.abs(velocity.y);
    collided = true;
  } else if (position.y < -limit) {
    position.y = -limit;
    velocity.y = Math.abs(velocity.y);
    collided = true;
  }

  if (position.z > limit) {
    position.z = limit;
    velocity.z = -Math.abs(velocity.z);
    collided = true;
  } else if (position.z < -limit) {
    position.z = -limit;
    velocity.z = Math.abs(velocity.z);
    collided = true;
  }

  return collided;
}

function resolveSphereCollision(a, b, restitution) {
  const posA = a.mesh.position;
  const posB = b.mesh.position;
  collisionDelta.subVectors(posB, posA);
  const minDistance = a.radius + b.radius;
  let distanceSq = collisionDelta.lengthSq();
  let collisionOccurred = false;

  if (distanceSq === 0) {
    fallbackDirection.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    if (fallbackDirection.lengthSq() < 1e-6) {
      fallbackDirection.set(1, 0, 0);
    }
    fallbackDirection.normalize().multiplyScalar(0.001);
    collisionDelta.copy(fallbackDirection);
    distanceSq = collisionDelta.lengthSq();
  }

  const minDistanceSq = minDistance * minDistance;

  if (distanceSq <= minDistanceSq) {
    const distance = Math.sqrt(distanceSq) || 0.0001;
    collisionNormal.copy(collisionDelta).divideScalar(distance);
    const overlap = minDistance - distance;

    posA.addScaledVector(collisionNormal, -overlap * 0.5);
    posB.addScaledVector(collisionNormal, overlap * 0.5);

    collisionRelativeVelocity.copy(a.velocity).sub(b.velocity);
    const velAlongNormal = collisionRelativeVelocity.dot(collisionNormal);

    if (velAlongNormal > 0) {
      const impulseMagnitude = -((1 + restitution) * velAlongNormal) / 2;
      collisionImpulse.copy(collisionNormal).multiplyScalar(impulseMagnitude);

      a.velocity.add(collisionImpulse);
      b.velocity.sub(collisionImpulse);
      collisionOccurred = true;
    }

    const reflectionFactor = 1 + restitution;
    let reflectionApplied = false;

    const postNormalA = a.velocity.dot(collisionNormal);
    if (postNormalA > 0) {
      a.velocity.addScaledVector(collisionNormal, -reflectionFactor * postNormalA);
      reflectionApplied = true;
    }

    const postNormalB = b.velocity.dot(collisionNormal);
    if (postNormalB < 0) {
      b.velocity.addScaledVector(collisionNormal, -reflectionFactor * postNormalB);
      reflectionApplied = true;
    }

    if (reflectionApplied) {
      collisionOccurred = true;
    }
  }

  if (collisionOccurred) {
    onSphereCollision(a);
    onSphereCollision(b);
  }

  return collisionOccurred;
}

function applyCameraInertia(delta) {
  if (!controlsInertia || controlsInertia.isDragging) {
    return;
  }

  const azimuthalVelocity = controlsInertia.azimuthalVelocity;
  const polarVelocity = controlsInertia.polarVelocity;
  const minVelocity = controlsInertia.minVelocity;

  if (Math.abs(azimuthalVelocity) > minVelocity) {
    controls.rotateLeft(-azimuthalVelocity * delta);
  }

  if (Math.abs(polarVelocity) > minVelocity) {
    controls.rotateUp(-polarVelocity * delta);
  }

  const decay = Math.exp(-controlsInertia.decayStrength * delta);
  controlsInertia.azimuthalVelocity *= decay;
  controlsInertia.polarVelocity *= decay;

  if (Math.abs(controlsInertia.azimuthalVelocity) < minVelocity) {
    controlsInertia.azimuthalVelocity = 0;
  }
  if (Math.abs(controlsInertia.polarVelocity) < minVelocity) {
    controlsInertia.polarVelocity = 0;
  }
}

function updateCameraInertiaTracking(delta) {
  if (!controlsInertia) {
    return;
  }

  const currentAzimuth = controls.getAzimuthalAngle();
  const currentPolar = controls.getPolarAngle();

  if (controlsInertia.isDragging && delta > 1e-6) {
    const azimuthDelta = shortestAngleDifference(currentAzimuth, controlsInertia.lastAzimuthalAngle);
    const polarDelta = currentPolar - controlsInertia.lastPolarAngle;

    const azimuthVelocity = azimuthDelta / delta;
    const polarVelocity = polarDelta / delta;

    controlsInertia.azimuthalVelocity = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(controlsInertia.azimuthalVelocity, azimuthVelocity, 0.45),
      -controlsInertia.maxVelocity,
      controlsInertia.maxVelocity
    );

    controlsInertia.polarVelocity = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(controlsInertia.polarVelocity, polarVelocity, 0.45),
      -controlsInertia.maxVelocity,
      controlsInertia.maxVelocity
    );
  }

  controlsInertia.lastAzimuthalAngle = currentAzimuth;
  controlsInertia.lastPolarAngle = currentPolar;
}

function updateGlowBillboards() {
  for (let i = 0; i < spheres.length; i += 1) {
    const sphere = spheres[i];
    if (sphere.type !== SphereType.GLOW || !sphere.glowMesh) {
      continue;
    }

    sphere.glowMesh.position.copy(sphere.mesh.position);
    sphere.glowMesh.lookAt(camera.position);
  }
}

function shortestAngleDifference(current, previous) {
  const difference = current - previous;
  return Math.atan2(Math.sin(difference), Math.cos(difference));
}

function generateNonCollidingPosition(radius) {
  const maxAttempts = 400;
  const limit = halfRoom - radius - 0.3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    candidatePosition.set(
      THREE.MathUtils.randFloatSpread(limit * 2),
      THREE.MathUtils.randFloatSpread(limit * 2),
      THREE.MathUtils.randFloatSpread(limit * 2)
    );

    let intersects = false;
    for (let i = 0; i < spheres.length; i += 1) {
      const other = spheres[i];
      const minDistance = radius + other.radius + 0.25;
      if (candidatePosition.distanceTo(other.mesh.position) < minDistance) {
        intersects = true;
        break;
      }
    }

    if (!intersects) {
      return candidatePosition.clone();
    }
  }

  return new THREE.Vector3(0, 0, 0);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.update();
}

window.addEventListener("resize", handleResize);

window.addEventListener("unload", () => {
  envRenderTarget.dispose();
});
