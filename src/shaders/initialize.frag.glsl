precision highp float;

uniform sampler2D uRest;
in vec2 vUv;

layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outVelocity;

void main() {
  vec4 rest = texture(uRest, vUv);
  outPosition = vec4(rest.xyz, 0.0);
  outVelocity = vec4(0.0, 0.0, 0.0, rest.w);
}
