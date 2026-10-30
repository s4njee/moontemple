// Story 1.6: what this family leans on beyond Fire Temple's support matrix, probed in headless
// Chrome on this machine's GPU from the dev server (WebGPU needs a secure context). Writes
// docs/studies/support-probe.json.
//
//   node experiments/support-probe.mjs [--base http://localhost:5450]

import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const base = (
  args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5450'
).replace(/\/$/, '');

const PROBE = `(async () => { try {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const features = ['float32-filterable', 'float32-blendable', 'timestamp-query', 'shader-f16', 'subgroups', 'rg11b10ufloat-renderable'];
  const has = Object.fromEntries(features.map((f) => [f, adapter.features.has(f)]));
  const limits = {};
  for (const key of ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxColorAttachmentBytesPerSample', 'maxTextureDimension2D']) limits[key] = adapter.limits[key];

  // Two devices: the one the site asks for (no blending feature), and one with every offered feature.
  const plain = await adapter.requestDevice({ requiredFeatures: has['float32-filterable'] ? ['float32-filterable'] : [] });
  const second = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const full = await second.requestDevice({ requiredFeatures: features.filter((f) => has[f]) });

  const half = (h) => {
    const s = h >> 15, e = (h >> 10) & 31, m = h & 1023;
    const v = e === 0 ? m / 1024 * 2 ** -14 : e === 31 ? (m ? NaN : Infinity) : (1 + m / 1024) * 2 ** (e - 15);
    return s ? -v : v;
  };
  async function readPixel(device, texture, format) {
    const buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [1, 1]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const range = buffer.getMappedRange();
    // rg11b10ufloat packs red as 5 exponent and 6 mantissa bits in the low 11 bits.
    const packed = new Uint32Array(range)[0];
    const r11 = ((packed & 63) / 64 + ((packed >> 6) & 31 ? 1 : 0)) * 2 ** (Math.max((packed >> 6) & 31, 1) - 15);
    const value = format === 'rgba16float' ? half(new Uint16Array(range)[0]) : format === 'rg11b10ufloat' ? r11 : new Float32Array(range)[0];
    buffer.unmap();
    return value;
  }

  // Additive point light: n instances each adding 0.75 into one pixel, the way every orb is drawn.
  const ADD = \`
    struct V { @builtin(position) p: vec4f };
    @vertex fn vs(@builtin(vertex_index) i: u32) -> V {
      var c = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
      return V(vec4f(c[i], 0, 1));
    }
    @fragment fn fs() -> @location(0) vec4f { return vec4f(AMOUNT, 0.0, 0.0, 1.0); }\`;
  async function additive(device, format, instances, indirect, amount = 0.75, base = 0) {
    const errors = [];
    device.pushErrorScope('validation');
    const module = device.createShaderModule({ code: ADD.replace('AMOUNT', amount.toFixed(6)) });
    const blend = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
    const pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format, blend }] } });
    const target = device.createTexture({ size: [1, 1], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const encoder = device.createCommandEncoder();
    let argsBuffer;
    if (indirect) {
      // The sprite path: a compute pass counts highlights with an atomic and writes the draw's arguments.
      argsBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT });
      const counter = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE });
      const cm = device.createShaderModule({ code: \`
        @group(0) @binding(0) var<storage, read_write> counter: atomic<u32>;
        @group(0) @binding(1) var<storage, read_write> args: array<u32, 4>;
        @compute @workgroup_size(64) fn count(@builtin(global_invocation_id) id: vec3u) {
          if (id.x < \${instances}u) { atomicAdd(&counter, 1u); }
        }
        @compute @workgroup_size(1) fn finish() {
          args[0] = 3u; args[1] = atomicLoad(&counter); args[2] = 0u; args[3] = 0u;
        }\` });
      const count = device.createComputePipeline({ layout: 'auto', compute: { module: cm, entryPoint: 'count' } });
      const finish = device.createComputePipeline({ layout: 'auto', compute: { module: cm, entryPoint: 'finish' } });
      const groupFor = (p) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: counter } }, { binding: 1, resource: { buffer: argsBuffer } }].filter((e) => p === finish || e.binding === 0) });
      const pass = encoder.beginComputePass();
      pass.setPipeline(count); pass.setBindGroup(0, groupFor(count)); pass.dispatchWorkgroups(Math.ceil(instances / 64));
      pass.setPipeline(finish); pass.setBindGroup(0, groupFor(finish)); pass.dispatchWorkgroups(1);
      pass.end();
    }
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [base, 0, 0, 0] }] });
    pass.setPipeline(pipeline);
    if (indirect) pass.drawIndirect(argsBuffer, 0); else pass.draw(3, instances);
    pass.end();
    device.queue.submit([encoder.finish()]);
    const error = await device.popErrorScope();
    if (error) return { error: error.message.split('\\n')[0] };
    return { value: await readPixel(device, target, format), expected: base + amount * instances };
  }

  const f16 = async (device) => {
    device.pushErrorScope('validation');
    device.createShaderModule({ code: 'enable f16; @compute @workgroup_size(1) fn main() { var x: f16 = 1.5h; x = x * 2.0h; }' });
    const error = await device.popErrorScope();
    return error ? error.message.split('\\n')[0] : 'compiles';
  };

  const result = {
    userAgent: navigator.userAgent,
    adapter: { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, description: adapter.info?.description },
    features: has,
    limits,
    additive: {
      rgba16float: await additive(plain, 'rgba16float', 1000, false),
      rgba16floatIndirect: await additive(plain, 'rgba16float', 300, true),
      rgba32floatWithoutFeature: await additive(plain, 'rgba32float', 4, false),
      rgba32floatWithFeature: has['float32-blendable'] ? await additive(full, 'rgba32float', 4, false) : 'not offered',
      rg11b10ufloat: has['rg11b10ufloat-renderable'] ? await additive(full, 'rg11b10ufloat', 4, false) : 'not offered',
      // A dim orb over a bright one: 0.001 added to 4 a thousand times, in each accumulation format.
      dimOverBright16: await additive(plain, 'rgba16float', 1000, false, 0.001, 4),
      dimOverBright32: has['float32-blendable'] ? await additive(full, 'rgba32float', 1000, false, 0.001, 4) : 'not offered',
    },
    shaderF16: has['shader-f16'] ? await f16(full) : 'not offered',
  };
  return JSON.stringify(result);
} catch (e) { return JSON.stringify({ failed: String(e && e.stack || e) }); } })()`;

const chrome = await launchChrome();
try {
  await chrome.page('Page.navigate', { url: `${base}/experiments/css-bokeh.html` });
  await sleep(1500);
  const raw = await chrome.evaluate(PROBE);
  if (typeof raw !== 'string') throw new Error(`probe failed: ${JSON.stringify(raw)}`);
  const result = JSON.parse(raw);
  if (result.failed) throw new Error(result.failed);
  // How large an FFT row fits in workgroup memory: a complex f32 value is 8 bytes, and a
  // ping-pong FFT keeps two copies of the row.
  const storage = result.limits.maxComputeWorkgroupStorageSize;
  result.fft = {
    note: 'largest power-of-two complex f32 row that fits workgroup storage, ping-pong (two copies)',
    defaultLimit: 16384,
    atDefault: 2 ** Math.floor(Math.log2(16384 / 16)),
    atOffered: 2 ** Math.floor(Math.log2(storage / 16)),
  };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync('docs/studies/support-probe.json', JSON.stringify(result, null, 2) + '\n');
} finally {
  chrome.close();
}
