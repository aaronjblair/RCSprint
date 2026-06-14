import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";

/**
 * Loads the Havok WASM and enables the v2 physics engine on the scene.
 * Returns the plugin so callers can issue raycasts for the vehicle wheels.
 */
export async function initPhysics(scene: Scene): Promise<HavokPlugin> {
  const havok = await HavokPhysics();
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  return plugin;
}
