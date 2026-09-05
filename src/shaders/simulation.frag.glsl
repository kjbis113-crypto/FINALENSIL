precision highp float;

uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uRest;
uniform sampler2D uNormal;
uniform float uTime;
uniform float uDelta;
uniform vec3 uPointerPosition;
uniform vec3 uPointerVelocity;
uniform float uPointerActive;
uniform float uPointerDown;
uniform float uInteractionRadius;
uniform float uInteractionStrength;
uniform float uCurlStrength;
uniform float uCurlScale;
uniform float uCurlSpeed;
uniform float uReturnStrength;
uniform float uTangentStrength;
uniform float uVelocityInfluence;
uniform float uDamping;

in vec2 vUv;

layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outVelocity;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  ) * 2.0 - 1.0;
}

vec3 potential(vec3 p) {
  return vec3(
    valueNoise(p + vec3(0.0, 19.1, 33.4)),
    valueNoise(p + vec3(47.2, 0.0, 11.7)),
    valueNoise(p + vec3(13.5, 61.8, 0.0))
  );
}

// Curl of a continuously interpolated vector potential: divergence-free by construction.
vec3 curlNoise(vec3 p) {
  const float e = 0.075;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);

  vec3 py0 = potential(p - dy);
  vec3 py1 = potential(p + dy);
  vec3 pz0 = potential(p - dz);
  vec3 pz1 = potential(p + dz);
  vec3 px0 = potential(p - dx);
  vec3 px1 = potential(p + dx);

  vec3 curl = vec3(
    (py1.z - py0.z) - (pz1.y - pz0.y),
    (pz1.x - pz0.x) - (px1.z - px0.z),
    (px1.y - px0.y) - (py1.x - py0.x)
  ) / (2.0 * e);

  return normalize(curl + vec3(0.0001));
}

void main() {
  vec4 positionState = texture(uPositionState, vUv);
  vec4 velocityState = texture(uVelocityState, vUv);
  vec4 restState = texture(uRest, vUv);
  vec4 normalState = texture(uNormal, vUv);

  vec3 position = positionState.xyz;
  vec3 velocity = velocityState.xyz;
  vec3 restPosition = restState.xyz;
  vec3 surfaceNormal = normalize(normalState.xyz);
  float seed = velocityState.w;
  float release = positionState.w;
  float dt = min(uDelta, 0.033);

  vec3 timeOffset = vec3(0.0, uTime * uCurlSpeed, -uTime * uCurlSpeed * 0.61);
  float boundaryNoise = valueNoise(restPosition * 2.35 + timeOffset * 0.25 + seed * 7.0);
  float irregularRadius = uInteractionRadius * (0.78 + boundaryNoise * 0.23);
  float pointerDistance = distance(position, uPointerPosition);
  float localField = (1.0 - smoothstep(irregularRadius * 0.18, irregularRadius, pointerDistance)) * uPointerActive;
  float pointerSpeed = clamp(length(uPointerVelocity) * 0.45, 0.0, 1.6);
  float releaseTarget = localField * clamp(0.58 + pointerSpeed * 0.48 + uPointerDown * 0.5, 0.0, 1.0);

  release = max(release * exp(-dt * 0.22), releaseTarget);

  vec3 largeCurl = curlNoise(position * (0.32 * uCurlScale) + timeOffset);
  vec3 mediumCurl = curlNoise(position * (1.25 * uCurlScale) - timeOffset * 1.7 + seed * 3.1);
  vec3 microSamplePosition = position * (4.2 * uCurlScale) + timeOffset * 0.4 + seed * 11.7;
  vec3 microNoise = vec3(
    valueNoise(microSamplePosition),
    valueNoise(microSamplePosition + vec3(17.3, 41.7, 9.2)),
    valueNoise(microSamplePosition + vec3(38.1, 5.4, 27.6))
  );
  vec3 flow = normalize(largeCurl * 0.62 + mediumCurl * 0.34 + microNoise * 0.04 + vec3(0.0001));

  float freeAmount = smoothstep(0.04, 0.9, release);
  float restLock = pow(1.0 - release, 2.35);
  vec3 restForce = (restPosition - position) * uReturnStrength * mix(1.0, 0.035, freeAmount);
  vec3 tangent = normalize(flow - surfaceNormal * dot(flow, surfaceNormal) + vec3(0.0001));
  float holdEnergy = 1.0 + uPointerDown * 1.6;
  vec3 tangentialForce = tangent * uTangentStrength * localField * (0.35 + seed * 0.8) * holdEnergy;
  vec3 advectiveForce = uPointerVelocity * uVelocityInfluence * localField * (0.25 + pointerSpeed) * holdEnergy;
  vec3 curlForce = flow * uCurlStrength * (0.012 + freeAmount * 1.22) * (0.55 + seed * 0.8);
  vec3 surfaceShear = cross(surfaceNormal, normalize(uPointerVelocity + flow * 0.2 + vec3(0.0001)));
  surfaceShear *= localField * uInteractionStrength * (0.18 + seed * 0.45) * holdEnergy;
  vec3 microMotion = microNoise * (0.0015 + 0.018 * localField) * (0.3 + seed);

  vec3 acceleration = restForce + curlForce + tangentialForce + advectiveForce + surfaceShear + microMotion;
  acceleration += -velocity * (0.08 * restLock);
  velocity += acceleration * dt;
  velocity *= exp(-uDamping * dt * mix(1.35, 0.62, freeAmount));
  float maximumSpeed = mix(0.72, 2.35, release);
  velocity *= min(1.0, maximumSpeed / max(length(velocity), 0.0001));
  position += velocity * dt;

  float distanceFromRest = distance(position, restPosition);
  if (distanceFromRest > 4.5) {
    position = mix(position, restPosition, 0.08);
    velocity *= 0.4;
  }

  outPosition = vec4(position, release);
  outVelocity = vec4(velocity, seed);
}
