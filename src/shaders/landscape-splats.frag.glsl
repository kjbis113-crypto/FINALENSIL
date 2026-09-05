precision highp float;

uniform float uOpacity;
uniform float uGaussianSharpness;
uniform float uSaturation;
uniform float uBrightness;
uniform float uReveal;
uniform sampler2D uLandscapeMap;

in vec2 vSplatUv;
in vec2 vSourceUv;
in float vOpacity;
in float vDepthWeight;
in float vNormalLight;

out vec4 outColor;

void main() {
  float radius = dot(vSplatUv, vSplatUv);
  float gaussian = exp(-radius * uGaussianSharpness);
  float edge = 1.0 - smoothstep(0.78, 1.0, radius);
  float alpha = gaussian * edge * vOpacity * uOpacity * uReveal;
  if (alpha < 0.035) discard;

  vec3 surfaceColor = texture(uLandscapeMap, vSourceUv).rgb;
  float luminance = dot(surfaceColor, vec3(0.2126, 0.7152, 0.0722));
  vec3 color = mix(vec3(luminance), surfaceColor, uSaturation);
  color *= uBrightness * vDepthWeight * vNormalLight;
  outColor = vec4(color, alpha);
}
