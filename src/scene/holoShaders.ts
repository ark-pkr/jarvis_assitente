export const VERTEX = `#version 300 es
in vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }`

/**
 * A black hole, traced ray by ray.
 *
 * Each ray is bent by the Schwarzschild term, so nothing here is drawn as an
 * arch: the bright curve over the shadow and the thin ring under it are the far
 * side of the disc, seen around the hole. Doppler beaming is why the side turning
 * towards the viewer is the brighter one.
 *
 * The parts of a voice each own one thing. Bass carries the whole disc, the
 * middle sends a wave of light outwards, treble brightens the fine gas. Each
 * also owns one of the worlds, which sit on the same bent rays as the disc.
 */
export const BLACK_HOLE = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime, uTurn, uGlow, uZoom, uTint, uLevel, uBass, uMid, uTreble, uRipple, uThought, uSweep, uPush, uBare;
uniform vec2 uLook;
uniform vec3 uAccent;
uniform vec4 uPlanets[3];
uniform vec3 uPlanetDeep[3], uPlanetPale[3];
uniform float uPlanetVoice[3];
out vec4 fragment;

const float INNER = 2.7, OUTER = 11.5;
const float TILT = 0.1, ROLL = -0.09;
float opacity;

float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float gasNoise(vec3 p) {
  return noise(p) * 0.53 + noise(p * 2.03) * 0.28 + noise(p * 4.1) * 0.14 + noise(p * 8.2) * 0.07 + noise(p * 16.3) * 0.035;
}
float starField(vec3 q, float rarity) {
  vec3 cell = floor(q);
  float seed = hash(cell);
  if (seed < rarity) return 0.0;
  return smoothstep(0.46, 0.0, length(fract(q) - 0.5)) * pow((seed - rarity) / (1.0 - rarity), 4.0);
}
// The sky behind the hole. It is read at the end of each bent ray, so it is lensed
// like everything else: the clouds and stars smear around the shadow on their own.
vec3 sky(vec3 d) {
  // A band across the sky, tilted against the disc so the two do not line up.
  float band = exp(-pow(d.y * 0.92 + d.x * 0.38, 2.0) * 5.5);
  vec3 q = d * 2.4 + 7.0;
  float large = noise(q);
  float cloud = smoothstep(0.44, 0.84, large * 0.62 + noise(q * 2.3 + large) * 0.28 + noise(q * 5.1) * 0.1);
  float dust = smoothstep(0.42, 0.7, noise(q * 3.4 + 19.0));
  vec3 gas = mix(vec3(0.018, 0.034, 0.085), vec3(0.06, 0.03, 0.075), smoothstep(0.35, 0.68, large));
  vec3 nebula = gas * cloud * (0.12 + band * 1.1) * (1.0 - dust * 0.55);
  float bright = starField(d * 300.0, 0.965) * 1.7;
  float faint = starField(d * 520.0, 0.93) * (0.16 + band * 0.5);
  vec3 star = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.8, 0.6), hash(floor(d * 300.0) + 7.0));
  return nebula + star * bright + vec3(0.8, 0.85, 1.0) * faint;
}

vec3 disc(vec3 at, vec3 ray) {
  float r = length(at.xz);
  opacity = 0.0;
  if (r < INNER || r > OUTER) return vec3(0.0);
  float edge = smoothstep(INNER, INNER + 0.5, r) * smoothstep(OUTER, OUTER - 5.5, r);

  // Gas nearer the hole orbits faster, which winds any pattern into a line. Two
  // copies of the gas, each restarted while the other is showing, keep it gas.
  float heading = atan(at.z, at.x);
  float rate = 14.4 / pow(r, 1.5);
  const float cycle = 3.5;
  float t1 = fract(uTurn / cycle), t2 = fract(uTurn / cycle + 0.5);
  float a1 = heading + t1 * cycle * rate, a2 = heading + t2 * cycle * rate;
  float along = log(r) * 9.0;
  float gas1 = gasNoise(vec3(cos(a1) * 4.5, sin(a1) * 4.5, along));
  float gas2 = gasNoise(vec3(cos(a2) * 4.5, sin(a2) * 4.5, along + 4.0));
  float gas = smoothstep(0.3, 0.72, mix(gas1, gas2, abs(t1 * 2.0 - 1.0)));

  float heat = pow(INNER / r, 0.85);
  vec3 ramp = mix(vec3(0.9, 0.17, 0.02), vec3(1.0, 0.62, 0.24), smoothstep(0.2, 0.62, heat));
  ramp = mix(ramp, vec3(1.0, 0.93, 0.8), smoothstep(0.62, 1.0, heat));
  ramp = mix(ramp, uAccent * (0.55 + heat), smoothstep(0.0, 0.5, uTint) * 0.85);

  float crest = fract(uTime * 0.5) * (OUTER - INNER) + INNER;
  float wave = exp(-(r - crest) * (r - crest) * 1.6) * uRipple * (uMid * 2.2 + uLevel * 0.5);
  float front = sin(heading * 3.0 + r * 1.9 - uTime * 3.6);
  float thought = pow(0.5 + 0.5 * front, 8.0) * uThought * 1.4;
  float scan = heading - uTime * 1.5;
  float sweep = pow(0.5 + 0.5 * cos(scan), 24.0) * uSweep * 1.6;

  vec3 orbit = normalize(vec3(-at.z, 0.0, at.x));
  float beta = min(0.6, sqrt(0.5 / (r - 1.0)));
  float shift = sqrt(1.0 - beta * beta) / (1.0 + beta * dot(orbit, -ray)) * sqrt(1.0 - 1.0 / r);
  float beaming = clamp(pow(shift, 3.2), 0.04, 4.5);

  opacity = edge * (0.35 + gas * 0.6);
  float grain = 0.14 + gas * gas * (1.5 + uTreble * 1.1);
  return ramp * grain * edge * heat * 1.25 * beaming * (1.0 + uBass * 0.75 + wave + thought + sweep);
}

// Testing every world at every step of every ray costs half as much again as the
// hole, and nearly all rays never come close. A ray bends by about 2 / impact and
// only once it reaches the hole, so a world it clearly misses is dropped up front.
// A ray close to the shadow can circle the hole and leave any way at all, so it keeps them.
const float CIRCLING = 4.5;
bool near[3];
bool anyNear = false;
void findNear(vec3 from, vec3 ray, float impact) {
  for (int i = 0; i < 3; i++) {
    float size = uPlanets[i].w;
    vec3 to = uPlanets[i].xyz - from;
    float along = dot(to, ray);
    float bent = 3.0 / max(impact, 1.0) * max(along - 18.0, 0.0);
    near[i] = size > 0.0 && (impact < CIRCLING || length(to - ray * along) < size * 3.0 + 1.0 + bent);
    anyNear = anyNear || near[i];
  }
}

// How far along this stretch of ray it meets a world, past 1 if it does not. The
// light a singing world gives off is gathered here too, so it bends with the ray.
int struck = 0;
float halo = 0.0;
float planetAlong(vec3 from, vec3 to) {
  vec3 d = to - from;
  float length2 = dot(d, d), nearest = 2.0;
  for (int i = 0; i < 3; i++) {
    if (!near[i]) continue;
    float size = uPlanets[i].w;
    vec3 away = from - uPlanets[i].xyz;
    float b = dot(away, d);
    float gap = b * b - length2 * (dot(away, away) - size * size);
    if (gap >= 0.0) {
      float t = (-b - sqrt(gap)) / length2;
      if (t >= 0.0 && t <= 1.0 && t < nearest) { nearest = t; struck = i; }
    }
    float closest = -b / length2;
    if (uPlanetVoice[i] > 0.01 && closest >= 0.0 && closest < 1.0) {
      vec3 off = away + d * closest;
      // Gone by the distance at which the ray stops looking, so no edge shows in the sky.
      float apart = dot(off, off), reach = size * 3.0 + 1.0;
      float glow = size * size / (apart + size * size * 0.6);
      halo += uPlanetVoice[i] * glow * glow * max(1.0 - apart / (reach * reach), 0.0);
    }
  }
  return nearest;
}

// Lit from the hole, so a world in front of it is a dark shape with a bright edge.
vec3 planet(int i, vec3 at, vec3 ray) {
  vec3 centre = uPlanets[i].xyz;
  vec3 n = normalize(at - centre);
  float spin = uTime * 0.12 + float(i) * 2.1, c = cos(spin), s = sin(spin);
  vec3 surface = vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z);
  vec3 q = surface * vec3(2.2, 7.0, 2.2) + float(i) * 13.0;
  float bands = smoothstep(0.28, 0.72, gasNoise(q + gasNoise(q * 0.7) * 1.4));
  vec3 ground = mix(uPlanetDeep[i], uPlanetPale[i], bands);

  float facing = dot(n, normalize(-centre));
  float lit = smoothstep(-0.2, 0.75, facing) * 7.0 / (3.0 + length(centre));
  vec3 light = mix(vec3(1.0, 0.72, 0.44), uAccent * 1.2, smoothstep(0.0, 0.5, uTint) * 0.85);
  float edge = pow(1.0 - max(dot(n, -ray), 0.0), 3.0);
  float voice = uPlanetVoice[i];
  return ground * (0.012 + light * lit + voice * bands * 0.5) + light * edge * (0.03 + lit * 0.5 + voice * 0.7);
}

void main() {
  // A little above centre, so the title below the hole clears its lower arc.
  vec2 uv = (gl_FragCoord.xy - uResolution * vec2(0.5, 0.53)) / uResolution.y;
  float c = cos(ROLL), s = sin(ROLL);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  // The camera orbits, so the sky and the bright side of the disc shift while the hole stays put.
  float pitch = TILT + uLook.y;
  vec3 p = vec3(sin(uLook.x) * cos(pitch), sin(pitch), -cos(uLook.x) * cos(pitch)) * 24.0;
  vec3 forward = normalize(-p);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 v = normalize(forward * 1.32 * uZoom + right * uv.x + up * uv.y);
  vec3 h = cross(p, v);
  float h2 = dot(h, h);
  vec3 colour = vec3(0.0);
  float through = 1.0;
  findNear(p, v, sqrt(h2));
  for (int i = 0; i < 76; i++) {
    float r2 = dot(p, p), r = sqrt(r2);
    if (r < 1.03) { through = 0.0; break; }
    if (r > 34.0 && dot(p, v) > 0.0) break;
    float dt = min(0.15 * (r - 0.75), 1.5);
    vec3 nv = v - 1.5 * h2 * p / (r2 * r2 * r) * dt;
    vec3 np = p + nv * dt;
    float crossing = p.y * np.y < 0.0 ? p.y / (p.y - np.y) : 2.0;
    float world = anyNear ? planetAlong(p, np) : 2.0;
    if (crossing < world) {
      vec3 light = disc(mix(p, np, crossing), normalize(nv));
      colour += through * light;
      through *= 1.0 - opacity;
    }
    if (world <= 1.0) {
      colour += through * planet(struck, mix(p, np, world), normalize(nv));
      through = 0.0;
      break;
    }
    p = np; v = nv;
  }
  // Reading the sky further out draws it in towards the hole, and nearer in pushes it away.
  vec3 away = normalize(v);
  away.xy *= 1.0 + uPush * 0.14;
  colour += halo * mix(vec3(1.0, 0.76, 0.5), uAccent, smoothstep(0.0, 0.5, uTint) * 0.85) * 0.35;
  colour *= uGlow;
  if (uBare < 0.5) colour += through * sky(normalize(away)) * (0.8 + abs(uPush) * 0.5);
  // ACES, so the hottest gas rolls off to white instead of clipping.
  colour = clamp(colour * (2.51 * colour + 0.03) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
  vec3 shown = pow(colour, vec3(1.0 / 2.2));
  // With no sky, whatever a ray passed through is all there is, and the shadow stays solid black.
  if (uBare > 0.5) { fragment = vec4(shown, max(1.0 - through, max(shown.r, max(shown.g, shown.b)))); return; }
  fragment = vec4(shown + (hash(vec3(gl_FragCoord.xy, fract(uTime))) - 0.5) / 255.0, 1.0);
}`
