import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const container = document.getElementById("experience");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
controls.maxDistance = roomSize * 0.85;
controls.update();

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

const ambientLight = new THREE.AmbientLight(new THREE.Color(0x111d2b), 1.1);
scene.add(ambientLight);
const baseAmbientIntensity = ambientLight.intensity;

const lightConfigs = [
  {
    color: 0xff8fb7,
    intensity: 240,
    radius: new THREE.Vector3(0.55, 0.32, 0.48),
    speed: new THREE.Vector3(0.18, 0.09, 0.14),
    phase: new THREE.Vector3(0.4, 1.2, 2.1)
  },
  {
    color: 0x7bd8ff,
    intensity: 270,
    radius: new THREE.Vector3(0.68, 0.4, 0.55),
    speed: new THREE.Vector3(0.13, 0.07, 0.11),
    phase: new THREE.Vector3(1.7, 0.4, 3.4)
  },
  {
    color: 0xa1ffcf,
    intensity: 230,
    radius: new THREE.Vector3(0.6, 0.46, 0.52),
    speed: new THREE.Vector3(0.16, 0.1, 0.17),
    phase: new THREE.Vector3(4.2, 2.4, 0.9)
  }
];

const dynamicLights = lightConfigs.map((config) => {
  const light = new THREE.PointLight(config.color, config.intensity, 0, 2);
  light.decay = 2;
  scene.add(light);
  return { light, baseIntensity: config.intensity, ...config };
});

const sphereGroup = new THREE.Group();
scene.add(sphereGroup);

const spheres = [];

const sphereConfig = {
  minRadius: 0.65,
  maxRadius: 1.25
};

const sphereCountRange = { min: 6, max: 36 };
const refractionRange = { min: 1.1, max: 1.9 };
const thicknessScaleRange = { min: 0.85, max: 1.35 };
const brightnessRange = { min: 0.6, max: 1.8 };
const speedRange = { min: 0.5, max: 3 };

const uiState = {
  sphereCount: 18,
  refraction: 1.52,
  brightness: 1,
  speed: 1.4
};

const motionState = {
  speedMultiplier: uiState.speed
};

const uiElements = {
  sphereCountInput: document.getElementById("sphere-count"),
  sphereCountValue: document.querySelector('[data-value-for="sphere-count"]'),
  refractionInput: document.getElementById("refraction-level"),
  refractionValue: document.querySelector('[data-value-for="refraction-level"]'),
  brightnessInput: document.getElementById("scene-brightness"),
  brightnessValue: document.querySelector('[data-value-for="scene-brightness"]'),
  speedInput: document.getElementById("movement-speed"),
  speedValue: document.querySelector('[data-value-for="movement-speed"]')
};

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

  updateLights(elapsedTime);
  updateSpheres(delta, elapsedTime);
  controls.update();

  renderer.render(scene, camera);
}

function updateLights(time) {
  dynamicLights.forEach(({ light, radius, speed, phase }) => {
    const x = Math.sin(time * speed.x + phase.x) * roomSize * radius.x;
    const y = Math.cos(time * speed.y + phase.y) * roomSize * radius.y + roomSize * 0.05;
    const z = Math.sin(time * speed.z + phase.z) * roomSize * radius.z;
    light.position.set(x, y, z);
  });
}

function updateSpheres(delta, time) {
  const effectiveDelta = delta * motionState.speedMultiplier;
  const damping = Math.max(0, 1 - effectiveDelta * 0.02);
  const restitution = 0.9;

  spheres.forEach((sphere) => {
    const { mesh, velocity, radius, hueDrift } = sphere;
    mesh.position.addScaledVector(velocity, effectiveDelta);
    velocity.multiplyScalar(damping);

    enforceBounds(mesh.position, velocity, radius);

    const hue = (sphere.hue + time * hueDrift) % 1;
    const material = mesh.material;
    material.attenuationColor.setHSL(hue, sphere.saturation, sphere.lightness + 0.1);
    if (material.sheenColor) {
      material.sheenColor.setHSL((hue + 0.05) % 1, sphere.saturation * 0.6, 0.6);
    }
    material.envMapIntensity = 1.25 + Math.sin(time * 0.4 + sphere.phase) * 0.25;
  });

  for (let i = 0; i < spheres.length - 1; i += 1) {
    const a = spheres[i];
    for (let j = i + 1; j < spheres.length; j += 1) {
      const b = spheres[j];
      resolveSphereCollision(a, b, restitution);
    }
  }
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
  const geometry = new THREE.SphereGeometry(radius, 64, 64);

  const hue = Math.random();
  const saturation = 0.45 + Math.random() * 0.25;
  const lightness = 0.45 + Math.random() * 0.25;
  const attenuationColor = new THREE.Color().setHSL(hue, saturation, lightness + 0.1);
  const sheenColor = new THREE.Color().setHSL((hue + 0.05) % 1, saturation * 0.6, 0.6);
  const baseThickness = radius * (1.8 + Math.random() * 0.6);
  const currentRefraction = THREE.MathUtils.clamp(uiState.refraction, refractionRange.min, refractionRange.max);
  const thicknessScale = THREE.MathUtils.mapLinear(
    currentRefraction,
    refractionRange.min,
    refractionRange.max,
    thicknessScaleRange.min,
    thicknessScaleRange.max
  );

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    transmission: 1,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    thickness: baseThickness * thicknessScale,
    envMapIntensity: 1.35,
    attenuationColor,
    attenuationDistance: 1.4 + Math.random() * 1.4,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    sheen: 0.4,
    sheenColor,
    sheenRoughness: 0.7,
    ior: currentRefraction
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
  const speed = THREE.MathUtils.randFloat(0.75, 1.2);
  const velocity = direction.multiplyScalar(speed);

  spheres.push({
    mesh,
    radius,
    velocity,
    hue,
    saturation,
    lightness,
    hueDrift: THREE.MathUtils.randFloat(0.012, 0.02),
    phase: Math.random() * Math.PI * 2,
    baseThickness
  });
}

function removeSphere() {
  const sphere = spheres.pop();
  if (!sphere) {
    return;
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

  ambientLight.intensity = baseAmbientIntensity * value;
  dynamicLights.forEach(({ light, baseIntensity }) => {
    light.intensity = baseIntensity * value;
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

function initializeUiControls() {
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

function enforceBounds(position, velocity, radius) {
  const limit = halfRoom - radius;

  if (position.x > limit) {
    position.x = limit;
    velocity.x *= -1;
  } else if (position.x < -limit) {
    position.x = -limit;
    velocity.x *= -1;
  }

  if (position.y > limit) {
    position.y = limit;
    velocity.y *= -1;
  } else if (position.y < -limit) {
    position.y = -limit;
    velocity.y *= -1;
  }

  if (position.z > limit) {
    position.z = limit;
    velocity.z *= -1;
  } else if (position.z < -limit) {
    position.z = -limit;
    velocity.z *= -1;
  }
}

function resolveSphereCollision(a, b, restitution) {
  const posA = a.mesh.position;
  const posB = b.mesh.position;
  const delta = new THREE.Vector3().subVectors(posB, posA);
  const minDistance = a.radius + b.radius;
  const distanceSq = delta.lengthSq();

  if (distanceSq === 0) {
    delta.set(Math.random() * 0.01, Math.random() * 0.01, Math.random() * 0.01);
  }

  if (distanceSq <= minDistance * minDistance) {
    const distance = Math.sqrt(distanceSq) || 0.0001;
    const normal = delta.clone().divideScalar(distance);
    const overlap = minDistance - distance;

    posA.addScaledVector(normal, -overlap * 0.5);
    posB.addScaledVector(normal, overlap * 0.5);

    const relativeVelocity = a.velocity.clone().sub(b.velocity);
    const velAlongNormal = relativeVelocity.dot(normal);

    if (velAlongNormal < 0) {
      const impulseMagnitude = -((1 + restitution) * velAlongNormal) / 2;
      const impulse = normal.multiplyScalar(impulseMagnitude);

      a.velocity.add(impulse);
      b.velocity.sub(impulse);
    }
  }
}

function generateNonCollidingPosition(radius) {
  const maxAttempts = 400;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const limit = halfRoom - radius - 0.3;
    const position = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(limit * 2),
      THREE.MathUtils.randFloatSpread(limit * 2),
      THREE.MathUtils.randFloatSpread(limit * 2)
    );

    let intersects = false;
    for (let i = 0; i < spheres.length; i += 1) {
      const other = spheres[i];
      const minDistance = radius + other.radius + 0.25;
      if (position.distanceTo(other.mesh.position) < minDistance) {
        intersects = true;
        break;
      }
    }

    if (!intersects) {
      return position;
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
