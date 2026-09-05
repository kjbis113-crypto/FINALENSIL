precision highp float;

uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uNormal;
uniform float uTime;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uLayer;

in vec2 aParticleUv;
in float aSeed;

out float vAlpha;
out float vHeat;
out float vSeed;

void main() {
  vec4 positionState = texture(uPositionState, aParticleUv);
  vec4 velocityState = texture(uVelocityState, aParticleUv);
  vec3 normal = normalize(texture(uNormal, aParticleUv).xyz);
  vec3 position = positionState.xyz;
  float release = positionState.w;
  float speed = length(velocityState.xyz);

  if (uLayer > 0.5 && uLayer < 1.5) {
    position += normal * release * (0.018 + aSeed * 0.055);
    position += velocityState.xyz * (0.025 + aSeed * 0.04);
    vAlpha = step(0.76, aSeed) * release * 0.55;
  } else if (uLayer > 1.5) {
    position += velocityState.xyz * (0.08 + aSeed * 0.15);
    vAlpha = step(0.925, aSeed) * smoothstep(0.08, 0.72, release) * 0.42;
  } else {
    vAlpha = 0.2 + (1.0 - release) * 0.62;
  }

  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewPosition;

  float perspective = 3.6 / max(1.0, -viewPosition.z);
  float sizeVariation = mix(0.65, 1.42, aSeed);
  float layerScale = uLayer < 0.5 ? 1.0 : (uLayer < 1.5 ? 0.82 : 0.62);
  gl_PointSize = clamp(uPointSize * uPixelRatio * perspective * sizeVariation * layerScale, 0.6, 2.65);

  vHeat = clamp(speed * 0.72 + (1.0 - release) * 0.2, 0.0, 1.0);
  vSeed = aSeed;
}
