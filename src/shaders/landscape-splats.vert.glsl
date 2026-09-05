precision highp float;

uniform float uTime;
uniform float uSplatSize;
uniform float uSurfaceThickness;
uniform float uSecondaryPercent;
uniform float uSecondaryOffset;
uniform vec2 uViewport;

in vec3 aPosition;
in vec3 aNormal;
in vec2 aUv;
in vec4 aData;

out vec2 vSplatUv;
out vec2 vSourceUv;
out float vOpacity;
out float vDepthWeight;
out float vNormalLight;

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

void main() {
  float seed = aData.x;
  vec3 surfaceNormal = normalize(aNormal);
  float shellOffset = mix(-0.003, 0.012, fract(seed * 71.317)) * uSurfaceThickness;
  float secondary = uSecondaryPercent > 0.0001
    ? step(1.0 - uSecondaryPercent, aData.w)
    : 0.0;
  shellOffset += secondary * mix(0.012, 0.035, fract(seed * 139.73)) * uSecondaryOffset;

  vec3 center = aPosition + surfaceNormal * shellOffset;
  if (secondary > 0.5) {
    float driftPhase = uTime * 0.045 + seed * 41.0;
    center += vec3(
      sin(driftPhase * 0.73),
      cos(driftPhase * 0.51),
      sin(driftPhase * 0.39 + 2.1)
    ) * 0.0026;
  }

  vec4 viewCenter = modelViewMatrix * vec4(center, 1.0);
  vec3 viewNormal = normalize(normalMatrix * surfaceNormal);
  vec3 surfaceRight = cross(viewNormal, vec3(0.0, 0.0, 1.0));
  if (dot(surfaceRight, surfaceRight) < 0.0001) surfaceRight = vec3(1.0, 0.0, 0.0);
  surfaceRight = normalize(surfaceRight);
  vec3 surfaceUp = normalize(cross(surfaceRight, viewNormal));
  vec3 right = normalize(mix(vec3(1.0, 0.0, 0.0), surfaceRight, 0.15));
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), surfaceUp, 0.15));

  vec2 quad = rotate2d(seed * 6.2831853) * position.xy;
  float aspect = mix(0.45, 1.8, fract(seed * 53.19));
  quad.x *= aspect;
  quad.y /= sqrt(aspect);

  float cameraDepth = max(0.1, -viewCenter.z);
  float perspectiveSize = uSplatSize * mix(0.65, 1.45, aData.y);
  float foregroundWeight = 1.0 - smoothstep(24.0, 86.0, cameraDepth);
  perspectiveSize *= mix(0.78, 1.24, foregroundWeight);
  perspectiveSize *= mix(1.0, 1.35, secondary);
  float viewSize = perspectiveSize * 2.0 * cameraDepth
    / max(1.0, projectionMatrix[1][1] * uViewport.y);
  viewCenter.xyz += (right * quad.x + up * quad.y) * viewSize;

  gl_Position = projectionMatrix * viewCenter;
  vSplatUv = position.xy;
  vSourceUv = aUv;
  vOpacity = aData.z * mix(1.0, 0.62, secondary);
  vDepthWeight = mix(0.72, 1.1, foregroundWeight);
  vNormalLight = mix(0.52, 1.08, abs(viewNormal.z));
}
