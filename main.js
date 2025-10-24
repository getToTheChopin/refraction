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
const godRayAlignmentVector = new THREE.Vector3(0, -1, 0);
const defaultLightDirection = new THREE.Vector3(0, 1, 0);
const lightDirectionTemp = new THREE.Vector3();
const candidatePosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

const GOD_RAY_BASE_RADIUS = 1;
const GOD_RAY_BASE_HEIGHT = 1.6;

const godRayGeometry = new THREE.ConeGeometry(GOD_RAY_BASE_RADIUS, GOD_RAY_BASE_HEIGHT, 36, 1, true);
godRayGeometry.translate(0, -GOD_RAY_BASE_HEIGHT * 0.5, 0);
godRayGeometry.name = "SphereGodRayGeometry";

const godRayVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vOrigin;
  varying vec3 vAxisDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vAxisDirection = normalize((modelMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const godRayFragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vOrigin;
  varying vec3 vAxisDirection;

  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uConeRadius;
  uniform float uConeLength;
  uniform vec2 uNoiseScale;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p += dot(p, p.yzx + 19.19);
    return fract(p.x * p.y * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  const int MARCH_STEPS = 8;

  void main() {
    vec3 toFragment = vWorldPosition - vOrigin;
    float heightAlongAxis = dot(toFragment, -vAxisDirection);
    if (heightAlongAxis < 0.0) {
      discard;
    }

    float normalizedHeight = clamp(heightAlongAxis / uConeLength, 0.0, 1.0);

    vec3 axisPoint = vOrigin + (-vAxisDirection) * heightAlongAxis;
    float radialDistance = length(vWorldPosition - axisPoint);
    float radiusAtHeight = mix(uConeRadius * 0.18, uConeRadius, normalizedHeight);
    float radialRatio = radialDistance / max(radiusAtHeight, 1e-4);

    if (radialRatio > 1.1) {
      discard;
    }

    float baseDensity = smoothstep(1.1, 0.0, radialRatio);
    float axialFalloff = smoothstep(1.12, 0.0, normalizedHeight);
    float centerGlow = pow(1.0 - clamp(radialRatio, 0.0, 1.0), 6.0);

    float marchStep = (uConeLength - heightAlongAxis) / float(MARCH_STEPS);
    vec3 marchDirection = -vAxisDirection;
    vec3 samplePoint = vWorldPosition;
    float accumulated = 0.0;

    for (int i = 0; i < MARCH_STEPS; i++) {
      samplePoint += marchDirection * marchStep;
      float sampleHeight = dot(samplePoint - vOrigin, -vAxisDirection);
      float sampleNormHeight = clamp(sampleHeight / uConeLength, 0.0, 1.0);
      vec3 sampleAxisPoint = vOrigin + (-vAxisDirection) * sampleHeight;
      float sampleRadialDistance = length(samplePoint - sampleAxisPoint);
      float sampleRadiusAtHeight = mix(uConeRadius * 0.18, uConeRadius, sampleNormHeight);
      float normalizedSampleRadius = sampleRadialDistance / max(sampleRadiusAtHeight, 1e-4);
      float sampleDensity = smoothstep(1.1, 0.0, normalizedSampleRadius) * smoothstep(1.05, 0.0, sampleNormHeight);
      vec3 noisePoint = vec3(
        samplePoint.x * uNoiseScale.x,
        samplePoint.y * 0.35 + uTime * 0.25,
        samplePoint.z * uNoiseScale.y
      );
      float n = noise(noisePoint);
      accumulated += sampleDensity * mix(0.65, 1.15, n);
    }

    float averageScattering = accumulated / float(MARCH_STEPS);

    vec3 shimmerPoint = vec3(
      radialDistance * uNoiseScale.x,
      heightAlongAxis * 0.3 + uTime * 0.45,
      radialDistance * uNoiseScale.y
    );
    float shimmeringNoise = noise(shimmerPoint);

    float softDiffuse = baseDensity * axialFalloff * mix(0.75, 1.25, shimmeringNoise);
    float finalIntensity = (softDiffuse * 0.85 + averageScattering * 1.35 + centerGlow * 0.5) * uIntensity;

    float alpha = clamp(finalIntensity, 0.0, 1.0);
    gl_FragColor = vec4(uColor * finalIntensity, alpha);
  }
`;

function createGodRayMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uTime: { value: 0 },
      uIntensity: { value: 0.3 },
      uConeRadius: { value: GOD_RAY_BASE_RADIUS },
      uConeLength: { value: GOD_RAY_BASE_HEIGHT },
      uNoiseScale: { value: new THREE.Vector2(1.05, 1.35) }
    },
    vertexShader: godRayVertexShader,
    fragmentShader: godRayFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  material.name = "SphereGodRayMaterial";
  return material;
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
  const paletteLength = neonPastelPalette.length;
  const safeIndex = paletteLength > 0 ? THREE.MathUtils.euclideanModulo(paletteIndex, paletteLength) : 0;
  sphere.colorIndex = safeIndex;
  const colorHex = paletteLength > 0 ? neonPastelPalette[safeIndex] : 0xffffff;
  if (sphere.light) {
    sphere.light.color.setHex(colorHex);
  }
  if (
    sphere.godRay &&
    sphere.godRay.material &&
    sphere.godRay.material.uniforms &&
    sphere.godRay.material.uniforms.uColor
  ) {
    sphere.godRay.material.uniforms.uColor.value.setHex(colorHex);
  }
}

function cycleSphereLightColor(sphere) {
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

function updateSphereGodRayStrength(sphere, brightnessMultiplier = uiState.brightness) {
  if (
    !sphere ||
    !sphere.godRay ||
    !sphere.godRay.material ||
    !sphere.godRay.material.uniforms ||
    !sphere.godRay.material.uniforms.uIntensity
  ) {
    return;
  }

  const baseStrength =
    typeof sphere.baseGodRayStrength === "number" ? sphere.baseGodRayStrength : 0.28;
  const safeBrightness = Math.max(brightnessMultiplier, 0);
  sphere.godRay.material.uniforms.uIntensity.value = baseStrength * safeBrightness;
}

function updateSphereGodRayTime(sphere, time) {
  if (
    !sphere ||
    !sphere.godRay ||
    !sphere.godRay.material ||
    !sphere.godRay.material.uniforms ||
    !sphere.godRay.material.uniforms.uTime
  ) {
    return;
  }

  const offset = typeof sphere.godRayTimeOffset === "number" ? sphere.godRayTimeOffset : 0;
  sphere.godRay.material.uniforms.uTime.value = time + offset;
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
  }
}

function onSphereCollision(sphere) {
  cycleSphereLightColor(sphere);
}

const sphereSizeModes = [
  { key: "standard", label: "Standard", minRadius: 0.65, maxRadius: 1.25 },
  { key: "grand", label: "Grand", minRadius: 1.05, maxRadius: 1.5 }
];
const defaultSphereSizeMode = sphereSizeModes[0];
const sphereConfig = {
  minRadius: defaultSphereSizeMode.minRadius,
  maxRadius: defaultSphereSizeMode.maxRadius
};

const sphereSpeedRange = { min: 1.9, max: 2.8 };

const sphereCountRange = { min: 6, max: 36 };
const refractionRange = { min: 1.1, max: 1.9 };
const thicknessScaleRange = { min: 0.85, max: 1.35 };
const brightnessRange = { min: 0.6, max: 1.8 };
const speedRange = { min: 0.5, max: 3 };

const uiState = {
  sphereSizeMode: defaultSphereSizeMode.key,
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
  sphereSizeButton: document.getElementById("sphere-size-toggle"),
  sphereSizeValue: document.querySelector('[data-value-for="sphere-size"]'),
  refractionInput: document.getElementById("refraction-level"),
  refractionValue: document.querySelector('[data-value-for="refraction-level"]'),
  brightnessInput: document.getElementById("scene-brightness"),
  brightnessValue: document.querySelector('[data-value-for="scene-brightness"]'),
  speedInput: document.getElementById("movement-speed"),
  speedValue: document.querySelector('[data-value-for="movement-speed"]')
};

setSphereSizeMode(uiState.sphereSizeMode, { rebuild: false });

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
    updateSphereGodRayTime(sphere, time);
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

  const godRayMaterial = createGodRayMaterial();
  const baseGodRayStrength = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    0.24,
    0.34
  );
  const godRayRadiusScale = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    1.2,
    1.65
  );
  const godRayLengthScale = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    7.5,
    11.5
  );
  const noiseScaleX = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    0.95,
    1.35
  );
  const noiseScaleY = THREE.MathUtils.mapLinear(
    radius,
    sphereConfig.minRadius,
    sphereConfig.maxRadius,
    1.15,
    1.7
  );

  godRayMaterial.uniforms.uIntensity.value = baseGodRayStrength * uiState.brightness;
  godRayMaterial.uniforms.uNoiseScale.value.set(noiseScaleX, noiseScaleY);

  const godRay = new THREE.Mesh(godRayGeometry, godRayMaterial);
  godRay.scale.set(godRayRadiusScale, godRayLengthScale, godRayRadiusScale);
  godRay.renderOrder = -5;
  mesh.add(godRay);

  const scaledConeRadius = GOD_RAY_BASE_RADIUS * godRay.scale.x;
  const scaledConeLength = GOD_RAY_BASE_HEIGHT * godRay.scale.y;
  godRayMaterial.uniforms.uConeRadius.value = scaledConeRadius;
  godRayMaterial.uniforms.uConeLength.value = scaledConeLength;

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
    baseGodRayStrength,
    godRayTimeOffset: Math.random() * 40,
    lastLightDirection: direction.clone()
  };

  setSphereLightColor(sphereData, colorIndex);
  updateSphereLightIntensity(sphereData);
  updateSphereGodRayStrength(sphereData);
  updateSphereLightDirection(sphereData);
  updateSphereGodRayTime(sphereData, 0);

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
    updateSphereGodRayStrength(sphere, value);
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

function findSphereSizeMode(modeKey) {
  if (!modeKey) {
    return defaultSphereSizeMode;
  }

  return sphereSizeModes.find((mode) => mode.key === modeKey) || defaultSphereSizeMode;
}

function getNextSphereSizeMode(modeKey) {
  const currentIndex = sphereSizeModes.findIndex((mode) => mode.key === modeKey);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % sphereSizeModes.length;
  return sphereSizeModes[nextIndex];
}

function updateSphereSizeUi(mode) {
  if (uiElements.sphereSizeValue) {
    setControlValue(uiElements.sphereSizeValue, mode.label, { decimals: null });
  }

  if (uiElements.sphereSizeButton) {
    const nextMode = getNextSphereSizeMode(mode.key);
    uiElements.sphereSizeButton.textContent = `Switch to ${nextMode.label}`;
    const isDefaultMode = mode.key === defaultSphereSizeMode.key;
    uiElements.sphereSizeButton.setAttribute("aria-pressed", isDefaultMode ? "false" : "true");
  }
}

function setSphereSizeMode(modeKey, { rebuild = true } = {}) {
  const mode = findSphereSizeMode(modeKey);
  uiState.sphereSizeMode = mode.key;
  sphereConfig.minRadius = mode.minRadius;
  sphereConfig.maxRadius = mode.maxRadius;
  updateSphereSizeUi(mode);

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
  if (uiElements.sphereSizeButton) {
    uiElements.sphereSizeButton.addEventListener("click", () => {
      const nextMode = getNextSphereSizeMode(uiState.sphereSizeMode);
      setSphereSizeMode(nextMode.key);
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
