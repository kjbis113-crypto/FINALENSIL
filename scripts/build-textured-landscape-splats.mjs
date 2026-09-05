import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [, , sourcePath, texturePath, outputPath, requestedCount = '500000'] = process.argv;

if (!sourcePath || !texturePath || !outputPath) {
  console.error('Usage: node scripts/build-textured-landscape-splats.mjs source.obj texture.png output.splat [count]');
  process.exit(1);
}

const sampleCount = Math.max(1000, Number.parseInt(requestedCount, 10) || 500000);
const heightGridSize = 129;

function createLineReader(filePath) {
  return readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function parseFaceReference(token) {
  const parts = token.split('/');
  return [
    Number.parseInt(parts[0], 10) - 1,
    parts[1] ? Number.parseInt(parts[1], 10) - 1 : -1,
    parts[2] ? Number.parseInt(parts[2], 10) - 1 : -1,
  ];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function inspectSource() {
  const result = {
    vertexCount: 0,
    uvCount: 0,
    normalCount: 0,
    faceCount: 0,
    minimum: [Infinity, Infinity, Infinity],
    maximum: [-Infinity, -Infinity, -Infinity],
  };

  for await (const line of createLineReader(sourcePath)) {
    if (line.startsWith('v ')) {
      const values = line.trim().split(/\s+/);
      for (let axis = 0; axis < 3; axis += 1) {
        const value = Number(values[axis + 1]);
        result.minimum[axis] = Math.min(result.minimum[axis], value);
        result.maximum[axis] = Math.max(result.maximum[axis], value);
      }
      result.vertexCount += 1;
    } else if (line.startsWith('vt ')) result.uvCount += 1;
    else if (line.startsWith('vn ')) result.normalCount += 1;
    else if (line.startsWith('f ')) result.faceCount += 1;
  }
  return result;
}

async function loadGeometry(source) {
  const vertices = new Float32Array(source.vertexCount * 3);
  const uvs = new Float32Array(source.uvCount * 2);
  const vertexNormals = new Float32Array(source.normalCount * 3);
  const faces = new Uint32Array(source.faceCount * 3);
  const uvFaces = new Int32Array(source.faceCount * 3);
  const normalFaces = new Int32Array(source.faceCount * 3);
  const areas = new Float32Array(source.faceCount);
  let vertexCursor = 0;
  let uvCursor = 0;
  let normalCursor = 0;
  let faceCursor = 0;
  let totalArea = 0;

  for await (const line of createLineReader(sourcePath)) {
    if (line.startsWith('v ')) {
      const values = line.trim().split(/\s+/);
      const offset = vertexCursor * 3;
      vertices[offset] = Number(values[1]);
      vertices[offset + 1] = Number(values[2]);
      vertices[offset + 2] = Number(values[3]);
      vertexCursor += 1;
      continue;
    }
    if (line.startsWith('vt ')) {
      const values = line.trim().split(/\s+/);
      const offset = uvCursor * 2;
      uvs[offset] = Number(values[1]);
      uvs[offset + 1] = Number(values[2]);
      uvCursor += 1;
      continue;
    }
    if (line.startsWith('vn ')) {
      const values = line.trim().split(/\s+/);
      const offset = normalCursor * 3;
      vertexNormals[offset] = Number(values[1]);
      vertexNormals[offset + 1] = Number(values[2]);
      vertexNormals[offset + 2] = Number(values[3]);
      normalCursor += 1;
      continue;
    }
    if (!line.startsWith('f ')) continue;

    const values = line.trim().split(/\s+/);
    const references = [
      parseFaceReference(values[1]),
      parseFaceReference(values[2]),
      parseFaceReference(values[3]),
    ];
    const faceOffset = faceCursor * 3;
    for (let corner = 0; corner < 3; corner += 1) {
      faces[faceOffset + corner] = references[corner][0];
      uvFaces[faceOffset + corner] = references[corner][1];
      normalFaces[faceOffset + corner] = references[corner][2];
    }

    const ia = references[0][0] * 3;
    const ib = references[1][0] * 3;
    const ic = references[2][0] * 3;
    const abx = vertices[ib] - vertices[ia];
    const aby = vertices[ib + 1] - vertices[ia + 1];
    const abz = vertices[ib + 2] - vertices[ia + 2];
    const acx = vertices[ic] - vertices[ia];
    const acy = vertices[ic + 1] - vertices[ia + 1];
    const acz = vertices[ic + 2] - vertices[ia + 2];
    const area = Math.hypot(
      aby * acz - abz * acy,
      abz * acx - abx * acz,
      abx * acy - aby * acx,
    ) * 0.5;
    areas[faceCursor] = area;
    totalArea += area;
    faceCursor += 1;
    if (faceCursor % 500000 === 0) console.log(`Measured ${Math.round(faceCursor / 1000)}K triangles`);
  }

  return { vertices, uvs, vertexNormals, faces, uvFaces, normalFaces, areas, totalArea };
}

function buildHeightGrid(positions, normals, normalizedBounds) {
  const cellCount = heightGridSize * heightGridSize;
  const candidates = new Float32Array(cellCount * 4);
  candidates.fill(Infinity);
  const minimum = normalizedBounds.minimum;
  const maximum = normalizedBounds.maximum;

  for (let index = 0; index < sampleCount; index += 1) {
    const p3 = index * 3;
    if (normals[p3 + 1] / 127 < 0.24) continue;
    const x = positions[p3] / 32767;
    const y = positions[p3 + 1] / 32767;
    const z = positions[p3 + 2] / 32767;
    const gx = Math.round(clamp((x - minimum[0]) / (maximum[0] - minimum[0]), 0, 1) * (heightGridSize - 1));
    const gz = Math.round(clamp((z - minimum[2]) / (maximum[2] - minimum[2]), 0, 1) * (heightGridSize - 1));
    const base = (gz * heightGridSize + gx) * 4;
    for (let rank = 0; rank < 4; rank += 1) {
      if (y >= candidates[base + rank]) continue;
      for (let shift = 3; shift > rank; shift -= 1) candidates[base + shift] = candidates[base + shift - 1];
      candidates[base + rank] = y;
      break;
    }
  }

  let heights = new Float32Array(cellCount);
  heights.fill(Number.NaN);
  for (let cell = 0; cell < cellCount; cell += 1) {
    const base = cell * 4;
    const available = [0, 1, 2, 3].filter((rank) => Number.isFinite(candidates[base + rank]));
    if (available.length) heights[cell] = candidates[base + Math.min(2, available.length - 1)];
  }

  for (let pass = 0; pass < heightGridSize && heights.some(Number.isNaN); pass += 1) {
    const next = heights.slice();
    for (let z = 0; z < heightGridSize; z += 1) {
      for (let x = 0; x < heightGridSize; x += 1) {
        const cell = z * heightGridSize + x;
        if (Number.isFinite(heights[cell])) continue;
        let sum = 0;
        let count = 0;
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dz) continue;
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0 || nx >= heightGridSize || nz < 0 || nz >= heightGridSize) continue;
            const value = heights[nz * heightGridSize + nx];
            if (Number.isFinite(value)) { sum += value; count += 1; }
          }
        }
        if (count) next[cell] = sum / count;
      }
    }
    heights = next;
  }

  const fallback = minimum[1] + 0.01;
  const packed = new Int16Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    packed[index] = Math.round(clamp(Number.isFinite(heights[index]) ? heights[index] : fallback, -1, 1) * 32767);
  }
  return packed;
}

function createSamples(source, geometry) {
  const random = mulberry32(0x47484f53);
  const targets = new Float64Array(sampleCount);
  const targetOrder = Array.from({ length: sampleCount }, (_, index) => index);
  for (let index = 0; index < sampleCount; index += 1) targets[index] = random() * geometry.totalArea;
  targetOrder.sort((a, b) => targets[a] - targets[b]);

  const positions = new Int16Array(sampleCount * 3);
  const normals = new Int8Array(sampleCount * 3);
  const uvs = new Uint16Array(sampleCount * 2);
  const data = new Uint8Array(sampleCount * 4);
  const center = source.minimum.map((value, axis) => (value + source.maximum[axis]) * 0.5);
  const dimensions = source.minimum.map((value, axis) => source.maximum[axis] - value);
  const normalizationScale = 2 / Math.max(...dimensions);
  const normalizedBounds = {
    minimum: source.minimum.map((value, axis) => (value - center[axis]) * normalizationScale),
    maximum: source.maximum.map((value, axis) => (value - center[axis]) * normalizationScale),
  };
  let faceCursor = 0;
  let cumulativeArea = 0;
  let targetCursor = 0;

  while (faceCursor < source.faceCount && targetCursor < sampleCount) {
    const faceArea = geometry.areas[faceCursor];
    const nextArea = cumulativeArea + faceArea;
    while (targetCursor < sampleCount && targets[targetOrder[targetCursor]] <= nextArea) {
      const outputIndex = targetOrder[targetCursor];
      const faceOffset = faceCursor * 3;
      const vertexOffsets = [0, 1, 2].map((corner) => geometry.faces[faceOffset + corner] * 3);
      const uvOffsets = [0, 1, 2].map((corner) => geometry.uvFaces[faceOffset + corner] * 2);
      const normalOffsets = [0, 1, 2].map((corner) => geometry.normalFaces[faceOffset + corner] * 3);
      const squareRoot = Math.sqrt(random());
      const weights = [1 - squareRoot, squareRoot * (1 - random()), 0];
      weights[2] = 1 - weights[0] - weights[1];
      const p3 = outputIndex * 3;
      const p2 = outputIndex * 2;
      const p4 = outputIndex * 4;

      for (let axis = 0; axis < 3; axis += 1) {
        const value = (
          (geometry.vertices[vertexOffsets[0] + axis] - center[axis]) * weights[0]
          + (geometry.vertices[vertexOffsets[1] + axis] - center[axis]) * weights[1]
          + (geometry.vertices[vertexOffsets[2] + axis] - center[axis]) * weights[2]
        ) * normalizationScale;
        positions[p3 + axis] = Math.round(clamp(value, -1, 1) * 32767);
      }

      let nx = 0;
      let ny = 0;
      let nz = 0;
      if (normalOffsets.every((offset) => offset >= 0)) {
        nx = geometry.vertexNormals[normalOffsets[0]] * weights[0] + geometry.vertexNormals[normalOffsets[1]] * weights[1] + geometry.vertexNormals[normalOffsets[2]] * weights[2];
        ny = geometry.vertexNormals[normalOffsets[0] + 1] * weights[0] + geometry.vertexNormals[normalOffsets[1] + 1] * weights[1] + geometry.vertexNormals[normalOffsets[2] + 1] * weights[2];
        nz = geometry.vertexNormals[normalOffsets[0] + 2] * weights[0] + geometry.vertexNormals[normalOffsets[1] + 2] * weights[1] + geometry.vertexNormals[normalOffsets[2] + 2] * weights[2];
      } else {
        const a = vertexOffsets[0];
        const b = vertexOffsets[1];
        const c = vertexOffsets[2];
        const abx = geometry.vertices[b] - geometry.vertices[a];
        const aby = geometry.vertices[b + 1] - geometry.vertices[a + 1];
        const abz = geometry.vertices[b + 2] - geometry.vertices[a + 2];
        const acx = geometry.vertices[c] - geometry.vertices[a];
        const acy = geometry.vertices[c + 1] - geometry.vertices[a + 1];
        const acz = geometry.vertices[c + 2] - geometry.vertices[a + 2];
        nx = aby * acz - abz * acy;
        ny = abz * acx - abx * acz;
        nz = abx * acy - aby * acx;
      }
      const normalLength = Math.max(1e-8, Math.hypot(nx, ny, nz));
      normals[p3] = Math.round(clamp(nx / normalLength, -1, 1) * 127);
      normals[p3 + 1] = Math.round(clamp(ny / normalLength, -1, 1) * 127);
      normals[p3 + 2] = Math.round(clamp(nz / normalLength, -1, 1) * 127);

      if (uvOffsets.every((offset) => offset >= 0)) {
        const u = geometry.uvs[uvOffsets[0]] * weights[0] + geometry.uvs[uvOffsets[1]] * weights[1] + geometry.uvs[uvOffsets[2]] * weights[2];
        const v = geometry.uvs[uvOffsets[0] + 1] * weights[0] + geometry.uvs[uvOffsets[1] + 1] * weights[1] + geometry.uvs[uvOffsets[2] + 1] * weights[2];
        uvs[p2] = Math.round(clamp(u, 0, 1) * 65535);
        uvs[p2 + 1] = Math.round(clamp(v, 0, 1) * 65535);
      }

      data[p4] = Math.round(random() * 255);
      data[p4 + 1] = Math.round(random() * 255);
      data[p4 + 2] = Math.round((0.45 + random() * 0.55) * 255);
      data[p4 + 3] = Math.round(random() * 255);
      targetCursor += 1;
    }
    cumulativeArea = nextArea;
    faceCursor += 1;
  }

  const heights = buildHeightGrid(positions, normals, normalizedBounds);
  return { positions, normals, uvs, data, heights, center, dimensions, normalizationScale, normalizedBounds };
}

function writeOutput(samples, source) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const chunks = [
    Buffer.from(samples.positions.buffer),
    Buffer.from(samples.normals.buffer),
    Buffer.from(samples.uvs.buffer),
    Buffer.from(samples.data.buffer),
    Buffer.from(samples.heights.buffer),
  ];
  fs.writeFileSync(outputPath, Buffer.concat(chunks));
  const metadata = {
    version: 2,
    source: path.basename(sourcePath),
    texture: path.basename(texturePath),
    sampleCount,
    sourceVertexCount: source.vertexCount,
    sourceTriangleCount: source.faceCount,
    sourceBounds: { minimum: source.minimum, maximum: source.maximum },
    normalizationCenter: samples.center,
    normalizationScale: samples.normalizationScale,
    normalizedBounds: samples.normalizedBounds,
    normalizedDimensions: samples.dimensions.map((value) => value * samples.normalizationScale),
    storage: 'planar',
    bytesPerSample: 17,
    heightGrid: { size: heightGridSize, componentType: 'int16', normalized: true },
    layout: {
      positions: { componentType: 'int16', itemSize: 3, normalized: true },
      normals: { componentType: 'int8', itemSize: 3, normalized: true },
      uvs: { componentType: 'uint16', itemSize: 2, normalized: true },
      data: { componentType: 'uint8', itemSize: 4, normalized: true },
    },
  };
  fs.writeFileSync(`${outputPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
}

console.log(`Inspecting ${sourcePath}`);
const source = await inspectSource();
console.log(`Loading ${source.vertexCount.toLocaleString()} vertices, ${source.uvCount.toLocaleString()} UVs, and ${source.faceCount.toLocaleString()} triangles`);
const geometry = await loadGeometry(source);
console.log(`Sampling ${sampleCount.toLocaleString()} points from area-weighted triangles`);
const samples = createSamples(source, geometry);
writeOutput(samples, source);
console.log(`Wrote ${outputPath} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB)`);
