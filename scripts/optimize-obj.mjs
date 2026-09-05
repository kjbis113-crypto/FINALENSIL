/**
 * OBJ 경량화 — 파티클 파이프라인이 읽지 않는 것을 빼고, 좌표를 양자화하고, 중복 정점을 합친다.
 *
 *   node scripts/optimize-obj.mjs                # public/models/NO1..4.obj 전부
 *   node scripts/optimize-obj.mjs public/models/NO2.obj
 *
 * 무엇이 안전한가 (src/loaders/ModelLoader.js 기준):
 *   - vt: 로더가 uv 를 지운다 → 버린다
 *   - vn: 로더가 computeVertexNormals() 로 다시 만든다 → 버린다
 *   - 색·재질·스무딩(usemtl, mtllib, s), 주석, Rhino NURBS(cstype, deg, curv, parm, end), 선·점(l, p):
 *     샘플러는 삼각형 면만 본다 → 버린다
 *   - 좌표 3자리 양자화: 모델 폭 ~700 단위에서 0.001 은 1e-6 수준 — 2.35 로 정규화된 뒤엔 float 정밀도 아래
 *   - 같은 좌표의 정점 통합: 면이 가리키는 위치는 그대로
 *
 * 끝나면 원본과 결과를 같은 OBJLoader 로 다시 파싱해 바운딩 박스와 총 표면적을 비교해 찍는다.
 * 표면적이 같으면 샘플러가 뿌리는 파티클 분포도 같다.
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const DECIMALS = 3;
const KEEP = new Set(['o', 'g']);

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [1, 2, 3, 4].map((n) => `public/models/NO${n}.obj`);

function quantise(value) {
  let text = Number(value).toFixed(DECIMALS);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text === '-0' ? '0' : text;
}

function optimise(source) {
  const out = [];
  const seen = new Map();   // "x,y,z" -> new 1-based index
  const remap = [];         // old 1-based index -> new 1-based index
  let originalVertices = 0;
  let faces = 0;
  let droppedFaces = 0;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);

    if (key === 'v') {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(quantise);
      originalVertices += 1;
      const id = `${x},${y},${z}`;
      let index = seen.get(id);
      if (index === undefined) {
        index = seen.size + 1;
        seen.set(id, index);
        out.push(`v ${x} ${y} ${z}`);
      }
      remap[originalVertices] = index;
      continue;
    }

    if (key === 'f') {
      const indices = [];
      for (const token of line.slice(2).trim().split(/\s+/)) {
        let index = Number(token.split('/')[0]);
        if (index < 0) index = originalVertices + 1 + index; // relative indices
        const mapped = remap[index];
        if (mapped && indices[indices.length - 1] !== mapped) indices.push(mapped);
      }
      if (indices.length > 1 && indices[0] === indices[indices.length - 1]) indices.pop();
      if (new Set(indices).size < 3) {
        droppedFaces += 1; // collapsed to a line or a point after de-duplication
        continue;
      }
      faces += 1;
      out.push(`f ${indices.join(' ')}`);
      continue;
    }

    if (KEEP.has(key)) out.push(line);
  }

  return { text: `${out.join('\n')}\n`, originalVertices, vertices: seen.size, faces, droppedFaces };
}

/** ModelLoader 와 같은 전처리 + 같은 로더로 파싱해, 샘플러가 보게 될 표면을 요약한다. */
function measure(source) {
  const sanitised = source.replace(/^(?:cstype|deg|curv|parm|end)\b.*(?:\r?\n|$)/gm, '');
  const root = new OBJLoader().parse(sanitised);
  const bounds = new THREE.Box3().makeEmpty();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  let area = 0;
  let triangles = 0;

  root.traverse((child) => {
    const position = child.geometry?.getAttribute('position');
    if (!position || (!child.isMesh && !child.isPoints)) return;
    const count = Math.floor(position.count / 3) * 3;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      if (![a, b, c].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) continue;
      bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      area += edge1.subVectors(b, a).cross(edge2.subVectors(c, a)).length() * 0.5;
      triangles += 1;
    }
  });

  return { bounds, area, triangles };
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

for (const target of targets) {
  const file = resolve(target);
  const before = statSync(file).size;
  const source = readFileSync(file, 'utf8');
  const result = optimise(source);
  writeFileSync(file, result.text);
  const after = statSync(file).size;

  const original = measure(source);
  const optimised = measure(result.text);
  const size = original.bounds.getSize(new THREE.Vector3()).length();
  const boundsDelta = Math.max(
    original.bounds.min.distanceTo(optimised.bounds.min),
    original.bounds.max.distanceTo(optimised.bounds.max),
  );

  console.log(
    `${basename(file)}  ${mb(before)} -> ${mb(after)}  (${(100 - (after / before) * 100).toFixed(0)}% smaller)\n` +
    `  vertices ${result.originalVertices} -> ${result.vertices}, faces ${result.faces}` +
    (result.droppedFaces ? `, dropped ${result.droppedFaces} degenerate` : '') + '\n' +
    `  triangles ${original.triangles} -> ${optimised.triangles}, ` +
    `area ratio ${(optimised.area / original.area).toFixed(6)}, ` +
    `bounds drift ${(boundsDelta / size).toExponential(2)} of model size`,
  );
}
