import { describe, expect, it } from 'vitest';
import * as coreAperture from '../../hologpu/packages/temple-core/src/gpu/optics/aperture.ts';
import * as coreCamera from '../../hologpu/packages/temple-core/src/gpu/optics/camera.ts';
import * as coreLens from '../../hologpu/packages/temple-core/src/gpu/optics/lens.ts';
import { createGatherDof as coreGather } from '../../hologpu/packages/temple-core/src/gpu/dof/gather.ts';
import { createHexagonDof as coreHexagon } from '../../hologpu/packages/temple-core/src/gpu/dof/hexagon.ts';
import { createPointLayer as corePoints } from '../../hologpu/packages/temple-core/src/gpu/points/points.ts';
import { createGatherDof } from '../src/gpu/dof/gather.ts';
import { createHexagonDof } from '../src/gpu/dof/hexagon.ts';
import { createDofScene } from '../src/gpu/dof/scene.ts';
import type { DofMethodFactory } from '../src/gpu/dof/types.ts';
import * as aperture from '../src/gpu/optics/aperture.ts';
import * as camera from '../src/gpu/optics/camera.ts';
import * as lens from '../src/gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../src/gpu/points.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { getTestDevice, readTexture } from '../tests/gpu.ts';

// Story 7.6: the optics copied into @mk7s/hologpu-temple-core (hologpu/packages/temple-core/src)
// draw what Moon Temple's own copies draw, byte for byte, before Moon Temple switches to them. Run
// from Moon Temple, which has the dependencies installed:
//
//   npx vitest run --config experiments/vite.config.ts experiments/core-optics.test.ts

const WIDTH = 320;
const HEIGHT = 200;
const HEXAGON = {
  blades: 6,
  rotation: 30,
  curvature: 0.2,
  rim: 0.2,
  rings: 0.1,
  ringCount: 4,
  vignette: 0.3,
};

describe('optics in the temple core', () => {
  it('exports the same CPU side', () => {
    for (const [name, a, b] of [
      ['aperture', aperture, coreAperture],
      ['lens', lens, coreLens],
      ['camera', camera, coreCamera],
    ] as const) {
      expect(Object.keys(b).sort(), name).toEqual(Object.keys(a).sort());
    }
    expect(coreAperture.apertureUniforms(HEXAGON)).toEqual(aperture.apertureUniforms(HEXAGON));
    const thin = { focalLength: 50, fNumber: 1.8, focusDistance: 1.2, imageHeight: 1080 };
    expect(coreLens.lensFromCamera(thin)).toEqual(lens.lensFromCamera(thin));
  });

  it('draws the same points', async () => {
    const device = await getTestDevice();
    const data = new Float32Array(POINT_FLOATS * 3);
    data.set([
      60, 50, 18, 0, 1, 0.6, 0.3, 0, 200, 120, 2.2, 0, 0.4, 0.5, 1, 0, 150, 90, 40, 0, 2, 2, 2, 0,
    ]);
    const draw = async (factory: typeof createPointLayer) => {
      const layer = factory(device, { label: 'parity', format: 'rgba16float' });
      const texture = device.createTexture({
        size: [WIDTH, HEIGHT],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      layer.setPoints(data, 3);
      const encoder = device.createCommandEncoder();
      layer.encode(encoder, texture.createView(), {
        width: WIDTH,
        height: HEIGHT,
        aperture: HEXAGON,
        clear: [0, 0, 0, 0],
      });
      device.queue.submit([encoder.finish()]);
      const bytes = await readTexture(device, texture, 8);
      layer.destroy();
      texture.destroy();
      return bytes;
    };
    const mine = await draw(createPointLayer);
    expect(mine.some((b) => b !== 0)).toBe(true);
    expect(await draw(corePoints)).toEqual(mine);
  });

  it.each([
    ['gather', createGatherDof, coreGather],
    ['hexagon', createHexagonDof, coreHexagon],
  ] as const)('defocuses like the %s method here', async (_name, here, core) => {
    const device = await getTestDevice();
    const scene = createDofScene(device);
    scene.resize(WIDTH, HEIGHT);
    const thin = lens.lensFromCamera({
      focalLength: 85,
      fNumber: 1.8,
      focusDistance: 2.5,
      imageHeight: HEIGHT,
    });
    const settings = { lens: thin, aperture: HEXAGON };
    scene.set({ ...settings, shot: 'night' });
    const run = async (factory: DofMethodFactory) => {
      const output = createRenderTarget(device, {
        label: 'parity',
        format: 'rgba16float',
        width: WIDTH,
        height: HEIGHT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const method = factory(device);
      method.resize(WIDTH, HEIGHT);
      const encoder = device.createCommandEncoder();
      scene.renderPinhole(encoder);
      method.encode(
        encoder,
        { colour: scene.colour.view, depth: scene.depth.view, width: WIDTH, height: HEIGHT },
        output.view,
        settings,
      );
      device.queue.submit([encoder.finish()]);
      const bytes = await readTexture(device, output.texture, 8);
      method.destroy();
      output.destroy();
      return bytes;
    };
    const mine = await run(here);
    expect(await run(core as DofMethodFactory)).toEqual(mine);
    scene.destroy();
  });
});
