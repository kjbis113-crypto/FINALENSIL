precision highp float;

uniform sampler2D uHistory0;
uniform sampler2D uHistory1;
uniform sampler2D uHistory2;
uniform sampler2D uHistory3;
uniform sampler2D uHistory4;
uniform sampler2D uHistory5;
uniform sampler2D uHistory6;
uniform sampler2D uHistory7;
uniform float uTrailLength;

in vec2 aParticleUv;
in float aHistoryIndex;
in float aTail;

out float vTrailAlpha;

vec3 readHistory(float index, vec2 uv) {
  if (index < 0.5) return texture(uHistory0, uv).xyz;
  if (index < 1.5) return texture(uHistory1, uv).xyz;
  if (index < 2.5) return texture(uHistory2, uv).xyz;
  if (index < 3.5) return texture(uHistory3, uv).xyz;
  if (index < 4.5) return texture(uHistory4, uv).xyz;
  if (index < 5.5) return texture(uHistory5, uv).xyz;
  if (index < 6.5) return texture(uHistory6, uv).xyz;
  return texture(uHistory7, uv).xyz;
}

void main() {
  vec3 position = readHistory(aHistoryIndex, aParticleUv);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vTrailAlpha = aTail * step(aHistoryIndex, uTrailLength - 1.0);
}
