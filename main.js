// Корнуэльская комната на Canvas 2D (простая трассировка лучей)

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const progressEl = document.getElementById("progress");

const W = canvas.width;
const H = canvas.height;

// ---------------- Векторная математика ----------------
function vec(x, y, z) {
  return { x, y, z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul(a, k) {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v) {
  return Math.sqrt(dot(v, v));
}

function norm(v) {
  const len = length(v) || 1;
  return mul(v, 1 / len);
}

function reflect(v, n) {
  const d = dot(v, n);
  return sub(v, mul(n, 2 * d));
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// простая модель преломления (Снелл, без полного внутреннего отражения)
function refract(v, n, iorFrom, iorTo) {
  const r = iorFrom / iorTo;
  const cosI = -dot(n, v);
  const sinT2 = r * r * (1 - cosI * cosI);
  if (sinT2 > 1) return null; // полное внутреннее отражение
  const cosT = Math.sqrt(1 - sinT2);
  return add(mul(v, r), mul(n, r * cosI - cosT));
}

// ---------------- Геометрия сцены ----------------

// Комната - осевой куб [-1,1]x[0,2]x[-1,1]
// Камера (фиксированная позиция, только повороты стрелками)
const camera = {
  // почти вплотную к передней стене, смотрим внутрь комнаты
  pos: vec(0, 1, 0.9),
  yaw: 0, // смотрим вдоль -Z
  pitch: -0.2, // лёгкий наклон вниз
  fov: 70 * (Math.PI / 180), // более широкий угол обзора
};

const CAMERA_ROT_STEP = 0.07;

// Базовый источник света (на потолке в центре)
const baseLight = {
  pos: vec(0, 1.95, 0),
  color: { r: 1, g: 1, b: 1 },
};

// Второй источник света (параметры задаём из UI)
const light2 = {
  enabled: false,
  pos: vec(0.6, 1.0, -0.8),
  color: { r: 0.9, g: 0.9, b: 1.0 },
};

const walls = [];
const objects = [];

function createScene() {
  walls.length = 0;
  objects.length = 0;

  // Стены комнаты как плоскости
  // Каждая имеет normal, point и цвет
  walls.push({
    id: "wall-left",
    type: "plane",
    point: vec(-1, 0, 0),
    normal: vec(1, 0, 0),
    color: { r: 0.75, g: 0.15, b: 0.15 }, // красная
    mirror: false,
  });

  walls.push({
    id: "wall-right",
    type: "plane",
    point: vec(1, 0, 0),
    normal: vec(-1, 0, 0),
    color: { r: 0.15, g: 0.25, b: 0.85 }, // синяя
    mirror: false,
  });

  walls.push({
    id: "wall-back",
    type: "plane",
    point: vec(0, 0, -1),
    normal: vec(0, 0, 1),
    color: { r: 0.8, g: 0.8, b: 0.8 },
    mirror: false,
  });

  walls.push({
    id: "wall-front",
    type: "plane",
    point: vec(0, 0, 1),
    normal: vec(0, 0, -1),
    color: { r: 0.8, g: 0.8, b: 0.8 },
    mirror: false,
  });

  walls.push({
    id: "wall-floor",
    type: "plane",
    point: vec(0, 0, 0),
    normal: vec(0, 1, 0),
    color: { r: 0.8, g: 0.8, b: 0.8 },
    mirror: false,
  });

  walls.push({
    id: "wall-ceil",
    type: "plane",
    point: vec(0, 2, 0),
    normal: vec(0, -1, 0),
    color: { r: 0.8, g: 0.8, b: 0.8 },
    mirror: false,
  });

  // Два куба как AABB
  objects.push({
    id: "cube1",
    type: "box",
    // немного меньше и ближе к центру
    min: vec(-0.7, 0, -0.05),
    max: vec(-0.25, 0.6, 0.45),
    color: { r: 0.9, g: 0.85, b: 0.2 },
    mirror: false,
    transparency: 0.0,
    ior: 1.5,
  });

  objects.push({
    id: "cube2",
    type: "box",
    // повыше, но немного уже
    // подвинут ближе к задней стене по оси Z
    min: vec(0.15, 0, -0.85),
    max: vec(0.65, 1.0, -0.35),
    // фиолетовый высокий прямоугольник
    color: { r: 0.9, g: 0.6, b: 0.7 },
    mirror: false,
    transparency: 0.0,
    ior: 1.5,
  });

  // Две сферы
  objects.push({
    id: "sphere1",
    type: "sphere",
    center: vec(-0.32, 0.3, -0.6),
    radius: 0.28,
    color: { r: 0.6, g: 0.9, b: 0.6 },
    mirror: false,
    transparency: 0.0,
    ior: 1.3,
  });

  objects.push({
    id: "sphere2",
    type: "sphere",
    center: vec(0.4, 0.5, 0.1),
    radius: 0.2,
    color: { r: 0.9, g: 0.6, b: 0.9 },
    mirror: false,
    transparency: 0.0,
    ior: 1.4,
  });
}

createScene();

// --------------- Пересечение лучей ----------------

function intersectPlane(rayOrigin, rayDir, plane) {
  const denom = dot(rayDir, plane.normal);
  if (Math.abs(denom) < 1e-4) return null;
  const t = dot(sub(plane.point, rayOrigin), plane.normal) / denom;
  if (t < 0.001) return null;

  const hitPoint = add(rayOrigin, mul(rayDir, t));

  // проверяем, что точка внутри границ комнаты
  if (
    hitPoint.x < -1.0001 ||
    hitPoint.x > 1.0001 ||
    hitPoint.z < -1.0001 ||
    hitPoint.z > 1.0001 ||
    hitPoint.y < -0.0001 ||
    hitPoint.y > 2.0001
  ) {
    return null;
  }

  return { t, point: hitPoint, normal: plane.normal };
}

function intersectSphere(rayOrigin, rayDir, sphere) {
  const L = sub(sphere.center, rayOrigin);
  const tca = dot(L, rayDir);
  const d2 = dot(L, L) - tca * tca;
  const r2 = sphere.radius * sphere.radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  let t0 = tca - thc;
  let t1 = tca + thc;
  if (t0 > t1) [t0, t1] = [t1, t0];
  if (t0 < 0.001) {
    t0 = t1;
    if (t0 < 0.001) return null;
  }
  const point = add(rayOrigin, mul(rayDir, t0));
  const normal = norm(sub(point, sphere.center));
  return { t: t0, point, normal };
}

function intersectBox(rayOrigin, rayDir, box) {
  const invDir = vec(1 / rayDir.x, 1 / rayDir.y, 1 / rayDir.z);

  const t1 = (box.min.x - rayOrigin.x) * invDir.x;
  const t2 = (box.max.x - rayOrigin.x) * invDir.x;
  const t3 = (box.min.y - rayOrigin.y) * invDir.y;
  const t4 = (box.max.y - rayOrigin.y) * invDir.y;
  const t5 = (box.min.z - rayOrigin.z) * invDir.z;
  const t6 = (box.max.z - rayOrigin.z) * invDir.z;

  const tmin = Math.max(
    Math.max(Math.min(t1, t2), Math.min(t3, t4)),
    Math.min(t5, t6)
  );
  const tmax = Math.min(
    Math.min(Math.max(t1, t2), Math.max(t3, t4)),
    Math.max(t5, t6)
  );

  if (tmax < 0.001 || tmin > tmax) return null;
  const t = tmin < 0.001 ? tmax : tmin;
  if (t < 0.001) return null;

  const point = add(rayOrigin, mul(rayDir, t));

  // нормаль определяем по тому, к какому ребру ближе
  const epsilon = 1e-3;
  let normal = vec(0, 0, 0);
  if (Math.abs(point.x - box.min.x) < epsilon) normal = vec(-1, 0, 0);
  else if (Math.abs(point.x - box.max.x) < epsilon) normal = vec(1, 0, 0);
  else if (Math.abs(point.y - box.min.y) < epsilon) normal = vec(0, -1, 0);
  else if (Math.abs(point.y - box.max.y) < epsilon) normal = vec(0, 1, 0);
  else if (Math.abs(point.z - box.min.z) < epsilon) normal = vec(0, 0, -1);
  else if (Math.abs(point.z - box.max.z) < epsilon) normal = vec(0, 0, 1);

  return { t, point, normal };
}

function traceRay(origin, dir) {
  let closest = null;
  let hitObject = null;

  // Стены
  for (const w of walls) {
    const hit = intersectPlane(origin, dir, w);
    if (hit && (!closest || hit.t < closest.t)) {
      closest = hit;
      hitObject = w;
    }
  }

  // Объекты
  for (const obj of objects) {
    let hit = null;
    if (obj.type === "sphere") hit = intersectSphere(origin, dir, obj);
    else if (obj.type === "box") hit = intersectBox(origin, dir, obj);
    if (hit && (!closest || hit.t < closest.t)) {
      closest = hit;
      hitObject = obj;
    }
  }

  if (!closest) return null;
  return { ...closest, object: hitObject };
}

function shade(hit, rayDir, depth) {
  const obj = hit.object;
  const point = hit.point;
  const normal = hit.normal;

  const baseColor = obj.color;
  const mirrorStrength = obj.mirror ? 1.0 : 0.0;
  const transparency = Math.min(1, Math.max(0, obj.transparency || 0));
  const opacity = 1 - transparency;

  let color = { r: 0, g: 0, b: 0 };

  // Прямое освещение (ламбертово + немного бликов)
  function applyLight(light) {
    if (!light) return;
    const toLight = sub(light.pos, point);
    const dist = length(toLight);
    const L = mul(toLight, 1 / dist);

    // тень: трассируем луч до источника
    const shadowOrigin = add(point, mul(normal, 0.001));
    const shadowHit = traceRay(shadowOrigin, L);
    if (shadowHit && shadowHit.t < dist - 0.01) {
      // в тени оставляем только очень слабый свет
      return;
    }

    const ndotl = Math.max(0, dot(normal, L));
    const intensity = ndotl * (1 / (1 + 0.15 * dist * dist));

    // диффузный
    const diff = intensity * opacity;
    color.r += baseColor.r * light.color.r * diff;
    color.g += baseColor.g * light.color.g * diff;
    color.b += baseColor.b * light.color.b * diff;

    // зеркальный блик (фоновый, даже если не "зеркало" в нашей логике)
    const viewDir = mul(rayDir, -1);
    const R = reflect(mul(L, -1), normal);
    const spec = Math.pow(Math.max(0, dot(viewDir, R)), 40);
    const specScale = 0.4 * opacity;
    color.r += specScale * spec * light.color.r;
    color.g += specScale * spec * light.color.g;
    color.b += specScale * spec * light.color.b;
  }

  applyLight(baseLight);
  if (light2.enabled) applyLight(light2);

  // Небольшой фоновой термин (только непрозрачная часть)
  color.r += 0.03 * baseColor.r * opacity;
  color.g += 0.03 * baseColor.g * opacity;
  color.b += 0.03 * baseColor.b * opacity;

  if (depth <= 0) return color;

  // Отражение
  if (mirrorStrength > 0.001) {
    const rDir = reflect(rayDir, normal);
    const rOrigin = add(point, mul(normal, 0.001));
    const rColor = castRay(rOrigin, rDir, depth - 1);
    color.r = color.r * (1 - mirrorStrength) + rColor.r * mirrorStrength;
    color.g = color.g * (1 - mirrorStrength) + rColor.g * mirrorStrength;
    color.b = color.b * (1 - mirrorStrength) + rColor.b * mirrorStrength;
  }

  // Прозрачность: пропускаем луч дальше за объект без сложного преломления
  if (transparency > 0.001) {
    const behindOrigin = add(point, mul(rayDir, 0.002));
    const behindColor = castRay(behindOrigin, rayDir, depth - 1);
    color.r = color.r * (1 - transparency) + behindColor.r * transparency;
    color.g = color.g * (1 - transparency) + behindColor.g * transparency;
    color.b = color.b * (1 - transparency) + behindColor.b * transparency;
  }

  return color;
}

function castRay(origin, dir, depth) {
  const hit = traceRay(origin, dir);
  if (!hit) {
    // фон (тёмный серый)
    return { r: 0.02, g: 0.02, b: 0.03 };
  }
  return shade(hit, dir, depth);
}

// Проекция 3D-точки на экранную координату (для рисования источников света)
function projectToScreen(pos3) {
  const aspect = W / H;
  const halfHeight = Math.tan(camera.fov * 0.5);
  const halfWidth = aspect * halfHeight;

  let forward = vec(
    Math.sin(camera.yaw) * Math.cos(camera.pitch),
    Math.sin(camera.pitch),
    -Math.cos(camera.yaw) * Math.cos(camera.pitch)
  );
  forward = norm(forward);
  const worldUp = vec(0, 1, 0);
  const right = norm(cross(forward, worldUp));
  const up = norm(cross(right, forward));

  const rel = sub(pos3, camera.pos);
  const vx = dot(rel, right);
  const vy = dot(rel, up);
  const vz = dot(rel, forward);
  if (vz <= 0.01) return null; // позади камеры

  const nx = vx / (vz * halfWidth);
  const ny = vy / (vz * halfHeight);
  if (nx < -1.2 || nx > 1.2 || ny < -1.2 || ny > 1.2) return null;

  const sx = (nx + 1) * 0.5 * W;
  const sy = (1 - ny) * 0.5 * H;
  return { x: sx, y: sy };
}

function drawLightMarker(light, colorCss) {
  const p = projectToScreen(light.pos);
  if (!p) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const radius = 14;
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  grad.addColorStop(0, colorCss.replace("ALPHA", "1"));
  grad.addColorStop(1, colorCss.replace("ALPHA", "0"));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --------------- Рендеринг сцены ------------------

function renderScene() {
  const img = ctx.createImageData(W, H);
  const data = img.data;

  progressEl.textContent = "Рендеринг...";

  const aspect = W / H;
  const scale = Math.tan(camera.fov * 0.5);

  // направление взгляда из yaw/pitch
  let forward = vec(
    Math.sin(camera.yaw) * Math.cos(camera.pitch),
    Math.sin(camera.pitch),
    -Math.cos(camera.yaw) * Math.cos(camera.pitch)
  );
  forward = norm(forward);
  const worldUp = vec(0, 1, 0);
  const right = norm(cross(forward, worldUp));
  const up = norm(cross(right, forward));

  const maxDepth = 3;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = ((2 * (x + 0.5)) / W - 1) * aspect * scale;
      const v = (1 - (2 * (y + 0.5)) / H) * scale;

      let dir = add(forward, add(mul(right, u), mul(up, v)));
      dir = norm(dir);

      const col = castRay(camera.pos, dir, maxDepth);
      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, Math.pow(col.r, 0.8) * 255));
      data[idx + 1] = Math.min(255, Math.max(0, Math.pow(col.g, 0.8) * 255));
      data[idx + 2] = Math.min(255, Math.max(0, Math.pow(col.b, 0.8) * 255));
      data[idx + 3] = 255;
    }
    if (y % 16 === 0) {
      progressEl.textContent = `Рендеринг: ${Math.round((y / H) * 100)}%`;
    }
  }

  ctx.putImageData(img, 0, 0);

  // Отрисуем визуальные маркеры источников света поверх изображения
  drawLightMarker(baseLight, "rgba(255,255,230,ALPHA)");
  if (light2.enabled) {
    drawLightMarker(light2, "rgba(200,220,255,ALPHA)");
  }

  progressEl.textContent = "Готово";
}

// --------------- UI привязка ------------------

function syncWallsFromUI() {
  const map = {
    "wall-left": document.getElementById("wall-left-mirror").checked,
    "wall-right": document.getElementById("wall-right-mirror").checked,
    "wall-back": document.getElementById("wall-back-mirror").checked,
    "wall-front": document.getElementById("wall-front-mirror").checked,
    "wall-floor": document.getElementById("wall-floor-mirror").checked,
    "wall-ceil": document.getElementById("wall-ceil-mirror").checked,
  };
  for (const w of walls) {
    w.mirror = !!map[w.id];
    // делаем зеркальные стены белее
    if (w.mirror) w.color = { r: 0.95, g: 0.95, b: 0.95 };
    else {
      if (w.id === "wall-left") w.color = { r: 0.75, g: 0.15, b: 0.15 };
      else if (w.id === "wall-right") w.color = { r: 0.15, g: 0.25, b: 0.85 };
      else w.color = { r: 0.8, g: 0.8, b: 0.8 };
    }
  }
}

function syncObjectsFromUI() {
  const flags = {
    "cube1-mirror": document.getElementById("cube1-mirror").checked,
    "cube2-mirror": document.getElementById("cube2-mirror").checked,
    "sphere1-mirror": document.getElementById("sphere1-mirror").checked,
    "sphere2-mirror": document.getElementById("sphere2-mirror").checked,
  };

  const alphas = {
    cube1: parseFloat(document.getElementById("cube1-alpha").value),
    cube2: parseFloat(document.getElementById("cube2-alpha").value),
    sphere1: parseFloat(document.getElementById("sphere1-alpha").value),
    sphere2: parseFloat(document.getElementById("sphere2-alpha").value),
  };

  for (const obj of objects) {
    if (obj.id === "cube1") {
      obj.mirror = !!flags["cube1-mirror"];
      obj.transparency = Math.min(1, Math.max(0, alphas.cube1));
    } else if (obj.id === "cube2") {
      obj.mirror = !!flags["cube2-mirror"];
      obj.transparency = Math.min(1, Math.max(0, alphas.cube2));
    } else if (obj.id === "sphere1") {
      obj.mirror = !!flags["sphere1-mirror"];
      obj.transparency = Math.min(1, Math.max(0, alphas.sphere1));
    } else if (obj.id === "sphere2") {
      obj.mirror = !!flags["sphere2-mirror"];
      obj.transparency = Math.min(1, Math.max(0, alphas.sphere2));
    }
  }
}

function syncLight2FromUI() {
  light2.enabled = document.getElementById("light2-enabled").checked;
  const selected = document.querySelector('input[name="light2-pos"]:checked');
  const mode = selected ? selected.value : "left-wall";
  if (mode === "left-wall") {
    // примерно центр левой стены
    light2.pos = vec(-0.95, 1.0, -0.2);
  } else if (mode === "right-wall") {
    // примерно центр правой стены
    light2.pos = vec(0.95, 1.0, -0.2);
  } else if (mode === "ceil-left-corner") {
    // левый дальний угол потолка
    light2.pos = vec(-0.9, 1.9, -0.9);
  } else if (mode === "ceil-right-corner") {
    // правый дальний угол потолка
    light2.pos = vec(0.9, 1.9, -0.9);
  }
}

function setupUI() {
  const inputs = document.querySelectorAll("#controls input");
  for (const el of inputs) {
    const handler = () => {
      syncWallsFromUI();
      syncObjectsFromUI();
      syncLight2FromUI();
      renderScene();
    };
    el.addEventListener("change", handler);
    el.addEventListener("input", handler);
  }

  // начальные значения
  syncWallsFromUI();
  syncObjectsFromUI();
  syncLight2FromUI();

  // управление камерой с клавиатуры
  window.addEventListener("keydown", (e) => {
    let changed = false;
    // повороты камеры стрелками
    if (e.code === "ArrowLeft") {
      camera.yaw -= CAMERA_ROT_STEP;
      changed = true;
    } else if (e.code === "ArrowRight") {
      camera.yaw += CAMERA_ROT_STEP;
      changed = true;
    } else if (e.code === "ArrowUp") {
      camera.pitch = Math.max(-1.2, camera.pitch - CAMERA_ROT_STEP);
      changed = true;
    } else if (e.code === "ArrowDown") {
      camera.pitch = Math.min(1.2, camera.pitch + CAMERA_ROT_STEP);
      changed = true;
    }

    if (changed) {
      renderScene();
    }
  });
}

setupUI();
renderScene();
