// ------------------------------------------------------------
// Esse arquivo é o responsável pela organização lógica do sistema de carregamento de novos cenários representados como arquivos JSON.
// ------------------------------------------------------------
// 

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
// import RAPIER from '@dimforge/rapier3d-compat';   // entra no passo da física

// ------------------------------------------------------------
// 1. Descoberta e leitura dos cenários (.json)
// ------------------------------------------------------------
// Arquivos em /public são servidos na raiz: public/scenes/x.json -> /scenes/x.json

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function listScenes() {
  try {
    return await fetchJSON('/api/scenes');          // Express (quando existir)
  } catch {
    return await fetchJSON('/scenes/index.json');   // fallback estático: ["cenario_xadrez", ...]
  }
}

async function readScene(name) {
  const data = await fetchJSON(`/scenes/${name}.json`);
  if (data.version !== 1) throw new Error(`Versão de cenário não suportada: ${data.version}`);
  return data;
}

// ------------------------------------------------------------
// 2. Cena Three + cache de GLB (carrega uma vez, clona N vezes)
// ------------------------------------------------------------
const viewport = document.getElementById('viewport');
const statusEl = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
scene.add(camera);

const gltfLoader = new GLTFLoader();
const assetCache = new Map();   // caminho -> Promise<gltf.scene>

function loadAsset(path) {
  if (!assetCache.has(path)) {
    assetCache.set(path, gltfLoader.loadAsync(`/${path}`).then(g => g.scene));
  }
  return assetCache.get(path);
}

// ------------------------------------------------------------
// 3. JSON -> objetos Three
// ------------------------------------------------------------
let sceneObjects = new Map();   // id -> Object3D
let currentScene = null;        // JSON carregado (fonte da verdade para salvar)
let currentExperience = null;

function clearScene() {
  currentExperience?.dispose?.();
  currentExperience = null;
  for (const obj of sceneObjects.values()) scene.remove(obj);
  sceneObjects.clear();
}

async function buildObject(def) {
  const template = await loadAsset(def.asset);
  const obj = cloneSkinned(template);   // geometria compartilhada, objeto independente

  const t = def.transform;
  obj.position.fromArray(t.position);
  obj.rotation.set(...t.rotation);
  obj.scale.fromArray(t.scale);

  obj.userData = { ...def, interactiveRoot: obj };
  obj.traverse(child => {
    if (!child.isMesh) return;
    child.castShadow = child.receiveShadow = true;
    child.userData.interactiveRoot = obj;
    // BVH uma vez por geometria (clones compartilham a mesma)
    child.geometry.boundsTree ??= new MeshBVH(child.geometry);
  });
  return obj;
}

async function loadScene(name) {
  statusEl.textContent = `Carregando ${name}...`;
  const data = await readScene(name);
  clearScene();
  currentScene = data;

  // Câmera do cenário
  camera.position.fromArray(data.camera.position);
  camera.lookAt(...data.camera.lookAt);

  // Objetos em paralelo (o cache evita baixar o mesmo .glb várias vezes)
  const built = await Promise.all(data.objects.map(buildObject));
  built.forEach((obj, i) => {
    scene.add(obj);
    sceneObjects.set(data.objects[i].id, obj);
  });

  // Experiência é carregada sob demanda a partir do campo "experience"
  // (precisa existir src/experiences/<nome>.js, ex.: free-play.js, tilt-maze.js)
  try {
    const mod = await import(`./experiences/${data.experience}.js`);
    currentExperience = mod.default;
    await currentExperience.init({ scene, camera, objects: sceneObjects, data });
  } catch (e) {
    console.warn(`Experiência "${data.experience}" indisponível:`, e.message);
  }

  statusEl.textContent = `${data.name}: ${built.length} objetos`;
}

// ------------------------------------------------------------
// 4. Serialização: Three -> JSON (usada pelo botão Salvar)
// ------------------------------------------------------------
function serializeScene() {
  const out = structuredClone(currentScene);
  out.camera.position = camera.position.toArray();
  for (const def of out.objects) {
    const o = sceneObjects.get(def.id);
    def.transform = {
      position: o.position.toArray(),
      rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
      scale: o.scale.toArray()
    };
  }
  return out;
}

async function saveScene() {
  const data = serializeScene();
  const res = await fetch(`/api/scenes/${currentScene.name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2)
  });
  statusEl.textContent = res.ok ? 'Salvo' : `Erro ao salvar (${res.status})`;
}

// ------------------------------------------------------------
// 5. UI e loop
// ------------------------------------------------------------
const select = document.getElementById('scene-select');

(async function boot() {
  const names = await listScenes();
  select.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (names.length) await loadScene(names[0]);
})().catch(e => (statusEl.textContent = e.message));

document.getElementById('btn-load').onclick = () => loadScene(select.value);
document.getElementById('btn-save').onclick = saveScene;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  currentExperience?.update?.(1 / 60);
  renderer.render(scene, camera);
});
