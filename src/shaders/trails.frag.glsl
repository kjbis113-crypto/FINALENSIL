precision highp float;

uniform float uOpacity;
in float vTrailAlpha;
out vec4 outColor;

void main() {
  float alpha = uOpacity * vTrailAlpha;
  if (alpha < 0.008) discard;
  outColor = vec4(vec3(0.78 + vTrailAlpha * 0.22), alpha);
}
