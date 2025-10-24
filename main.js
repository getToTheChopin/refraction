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
const maintainTempDirection = new THREE.Vector3();
const fallbackDirection = new THREE.Vector3();
const godRayAlignmentVector = new THREE.Vector3(0, -1, 0);
const defaultLightDirection = new THREE.Vector3(0, 1, 0);
const lightDirectionTemp = new THREE.Vector3();
const candidatePosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

const godRayGeometry = new THREE.ConeGeometry(1, 1.6, 24, 1, true);
godRayGeometry.translate(0, -0.8, 0);
const godRayBaseMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.3,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide
});

godRayBaseMaterial.name = "SphereGodRayMaterial";

godRayGeometry.name = "SphereGodRayGeometry";

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
  if (!sphere.light) {
    return;
  }

  const paletteLength = neonPastelPalette.length;
  const safeIndex = paletteLength > 0 ? THREE.MathUtils.euclideanModulo(paletteIndex, paletteLength) : 0;
  sphere.colorIndex = safeIndex;
  const colorHex = paletteLength > 0 ? neonPastelPalette[safeIndex] : 0xffffff;
  sphere.light.color.setHex(colorHex);
  if (sphere.godRay && sphere.godRay.material) {
    sphere.godRay.material.color.setHex(colorHex);
  }
}

function cycleSphereLightColor(sphere) {
  if (!sphere.light) {
    return;
  }

  const currentIndex = typeof sphere.colorIndex === "number" ? sphere.colorIndex : null;
  const nextIndex = getRandomPaletteIndex(currentIndex);
  setSphereLightColor(sphere, nextIndex);
}

function updateSphereLightIntensity(sphere) {
  if (!sphere.light) {
    return;
  }

  sphere.light.intensity = sphere.baseLightIntensity * uiState.brightness;
}

function updateSphereLightDirection(sphere) {
  const { light, lightTarget, velocity, radius, godRay } = sphere;
  if (!light || !lightTarget) {
    return;
  }

  if (!sphere.lastLightDirection) {
    sphere.lastLightDirection = defaultLightDirection.clone();
  }

  lightDirectionTemp.copy(velocity);
  const hasVelocity = lightDirectionTemp.lengthSq() > 1e-6;

  if (hasVelocity) {
    lightDirectionTemp.normalize();
  } else {
    lightDirectionTemp.copy(sphere.lastLightDirection);
  }

  if (lightDirectionTemp.lengthSq() < 1e-6) {
    lightDirectionTemp.copy(defaultLightDirection);
  }

  sphere.lastLightDirection.copy(lightDirectionTemp);

  const targetDistance = Math.max(radius * 0.8, 0.1);
  lightTarget.position.copy(lightDirectionTemp).multiplyScalar(targetDistance);

  if (godRay) {
    tempQuaternion.setFromUnitVectors(godRayAlignmentVector, lightDirectionTemp);
    godRay.quaternion.copy(tempQuaternion);
    const baseOpacity = sphere.baseGodRayOpacity || 0.28;
    godRay.material.opacity = baseOpacity * uiState.brightness;
  }
}

function onSphereCollision(sphere) {
  cycleSphereLightColor(sphere);
}

const sphereConfig = {
  minRadius: 0.65,
  maxRadius: 1.25
};

const sphereSpeedRange = { min: 1.9, max: 2.8 };

const sphereCountRange = { min: 6, max: 36 };
const refractionRange = { min: 1.1, max: 1.9 };
const thicknessScaleRange = { min: 0.85, max: 1.35 };
const brightnessRange = { min: 0.6, max: 1.8 };
const speedRange = { min: 0.5, max: 3 };

const uiState = {
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

  updateSpheres(delta, elapsedTime);
  controls.update();

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
    material.attenuationColor.setHSL(hue, sphere.saturation, sphere.lightness + 0.1);
    if (material.sheenColor) {
      material.sheenColor.setHSL((hue + 0.05) % 1, sphere.saturation * 0.6, 0.6);
    }
    material.envMapIntensity = 1.25 + Math.sin(time * 0.4 + sphere.phase) * 0.25;

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
    const sphere = spheres[i];
    maintainSphereSpeed(sphere);
    updateSphereLightDirection(sphere);
  }
}

function maintainSphereSpeed(sphere) {
  const { velocity, baseSpeed, lastLightDirection } = sphere;
  if (!velocity || !Number.isFinite(baseSpeed) || baseSpeed <= 0) {
    return;
  }

  const currentSpeed = velocity.length();
  if (currentSpeed < 1e-6) {
    if (lastLightDirection && lastLightDirection.lengthSq() > 1e-6) {
      maintainTempDirection.copy(lastLightDirection);
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
    return;
  }

  const speedDelta = Math.abs(currentSpeed - baseSpeed);
  if (speedDelta > baseSpeed * 0.0005) {
    velocity.multiplyScalar(baseSpeed / currentSpeed);
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
  const geometry = new THREE.SphereGeometry(radius, 48, 48);

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
  const baseSpeed = THREE.MathUtils.randFloat(sphereSpeedRange.min, sphereSpeedRange.max);
  const velocity = direction.clone().multiplyScalar(baseSpeed);

  const colorIndex = getRandomPaletteIndex();
  const baseLightIntensity = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    160,
    260
  );
  const lightDistance = radius * 14;
  const light = new THREE.SpotLight(
    neonPastelPalette[colorIndex],
    baseLightIntensity * uiState.brightness,
    lightDistance,
    Math.PI * 0.35,
    0.6,
    2
  );
  light.castShadow = false;

  const lightTarget = new THREE.Object3D();
  lightTarget.position.set(0, 0, 1);
  mesh.add(light);
  mesh.add(lightTarget);
  light.position.set(0, 0, 0);
  light.target = lightTarget;

  const godRayMaterial = godRayBaseMaterial.clone();
  const baseGodRayOpacity = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    0.24,
    0.34
  );
  godRayMaterial.opacity = baseGodRayOpacity * uiState.brightness;
  const godRay = new THREE.Mesh(godRayGeometry, godRayMaterial);
  const godRayRadiusScale = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    1.2,
    1.65
  );
  const godRayLength = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    7.5,
    11.5
  );
  godRay.scale.set(godRayRadiusScale, godRayLength, godRayRadiusScale);
  godRay.renderOrder = -5;
  mesh.add(godRay);

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
    lightTarget,
    baseLightIntensity,
    colorIndex,
    godRay,
    baseGodRayOpacity,
    lastLightDirection: direction.clone()
  };

  setSphereLightColor(sphereData, colorIndex);
  updateSphereLightIntensity(sphereData);
  updateSphereLightDirection(sphereData);

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

  if (sphere.lightTarget && sphere.lightTarget.parent) {
    sphere.lightTarget.parent.remove(sphere.lightTarget);
  }

  if (sphere.godRay) {
    if (sphere.godRay.parent) {
      sphere.godRay.parent.remove(sphere.godRay);
    }
    if (sphere.godRay.material) {
      sphere.godRay.material.dispose();
    }
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
    if (sphere.godRay && sphere.godRay.material) {
      const baseOpacity = sphere.baseGodRayOpacity || 0.28;
      sphere.godRay.material.opacity = baseOpacity * value;
    }
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

    if (velAlongNormal < 0) {
      const impulseMagnitude = -((1 + restitution) * velAlongNormal) / 2;
      collisionNormal.multiplyScalar(impulseMagnitude);

      a.velocity.add(collisionNormal);
      b.velocity.sub(collisionNormal);
      collisionOccurred = true;
    }
  }

  if (collisionOccurred) {
    onSphereCollision(a);
    onSphereCollision(b);
  }

  return collisionOccurred;
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
