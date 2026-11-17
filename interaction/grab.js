/*
Lógica do BHV e de como a pinça funciona
*/

import { MeshBVH } from 'three-mesh-bvh';

        // ============================================
        // SECTION 6: GRAB INTERACTION STATE
        // ============================================

        let isPinching    = false;
        let grabbedObject = null;
        const grabOffset  = new THREE.Vector3(); // pinch-to-center offset, set on grab start
        const PINCH_THRESHOLD = 0.18;

        // ============================================
        // COLLISION DETECTION (BVH + Box3 fallback)
        // ============================================

        function checkCollision(object, pinchWorldPoint, tolerance = 0.15) {
            // Check whether any child Mesh has a BVH built
            let hasBVH = false;
            object.traverse((child) => {
                if (child.isMesh && child.geometry.boundsTree) hasBVH = true;
            });

            if (hasBVH) {
                let closestDistance = Infinity;

                object.traverse((child) => {
                    if (child.isMesh && child.geometry.boundsTree) {
                        // Fresh clone for each child — don't reuse a mutated vector
                        const localPoint = pinchWorldPoint.clone();
                        child.worldToLocal(localPoint); // ← BUG 3 FIX: child, not object

                        // ← BUG 2 FIX: correct API with a target object
                        const target = {};
                        const hit = child.geometry.boundsTree.closestPointToPoint(localPoint, target);

                        if (hit !== null && target.distance < closestDistance) {
                            closestDistance = target.distance;
                        }
                    }
                });

                return closestDistance <= tolerance;
            }

            // Fallback: axis-aligned bounding box (good enough for primitive shapes)
            const box = new THREE.Box3().setFromObject(object);
            box.expandByScalar(tolerance);
            return box.containsPoint(pinchWorldPoint);
        }
