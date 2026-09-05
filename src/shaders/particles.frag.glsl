precision highp float;

uniform float uOpacity;
in float vAlpha;
in float vHeat;
in float vSeed;
out vec4 outColor;

void main() {
  vec2 point = gl_PointCoord - 0.5;
  float radius = length(point);
  float softEdge = 1.0 - smoothstep(0.12, 0.5, radius);
  float sharpCore = 1.0 - smoothstep(0.0, 0.16, radius);
  float alpha = (softEdge * 0.58 + sharpCore * 0.72) * vAlpha * uOpacity;
  if (alpha < 0.012) discard;

  float luminance = mix(0.58, 1.0, clamp(vHeat * 0.72 + vSeed * 0.17, 0.0, 1.0));
  outColor = vec4(vec3(luminance), alpha);
}
