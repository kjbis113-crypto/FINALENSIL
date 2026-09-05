precision highp float;

uniform sampler2D uSource;
in vec2 vUv;
out vec4 outColor;

void main() {
  outColor = texture(uSource, vUv);
}
