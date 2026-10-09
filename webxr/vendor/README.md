# Browser library

Three.js r180 (0.180.0), vendored so the demo does not depend on a CDN at the event.

Source: https://github.com/mrdoob/three.js/tree/r180/build

`three.module.min.js` imports the adjacent `three.core.min.js`. Both are unmodified upstream builds. The upstream MIT license is included in `three/LICENSE`.

`three/addons/loaders/GLTFLoader.js` and `three/addons/utils/BufferGeometryUtils.js` come from the same r180 tag. Their bare `three` imports are changed to `../../three.module.min.js` so the bundled hand meshes load without an import map or runtime CDN. All other upstream code is unchanged. The MIT license applies to these files as well.
