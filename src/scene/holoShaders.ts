export const VERTEX = `#version 300 es
in vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }`

/**
 * A black hole, traced ray by ray.
 *
 * Each ray is bent by the Schwarzschild term, so nothing here is drawn as an
 * arch: the bright curve over the shadow and the thin ring under it are the far
 * side of the disc, seen around the hole. Doppler beaming is why the side turning
 * towards the viewer is the brighter one, and the bluer: the gas is coloured by its
 * temperature as seen, so the hot inner edge runs white to blue-white and the
 * outer gas cools to red. While the deep model thinks, two jets rise from the poles.
 *
 * Now and then something happens: the opening flight in from far away, a second,
 * smaller hole that bends light of its own as it spirals in and merges, meteors
 * and an aurora in the sky. The last two live in the sky, so they are lensed too.
 *
 * The parts of a voice each own one thing. Bass carries the whole disc, the
 * middle sends a wave of light outwards, treble brightens the fine gas. Each
 * also owns one of the worlds, which sit on the same bent rays as the disc.
 */
export const BLACK_HOLE = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime, uTurn, uGlow, uZoom, uTint, uLevel, uBass, uMid, uTreble, uRipple, uThought, uSweep, uPush, uBare, uJet, uDay;
// The rare shows: the opening flight, the aurora, meteors, and a second hole merging.
uniform float uDistance, uLight, uWarp, uAurora, uMeteor, uFlash, uWaveTime, uWave;
uniform vec4 uCompanion;
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
// Curtains of green light turning violet as they rise, hung across the upper sky
// behind the hole. Rays of brighter light run up them and drift slowly sideways.
vec3 aurora(vec3 d) {
  if (uAurora < 0.01 || d.z < 0.15) return vec3(0.0);
  float x = d.x / d.z, y = d.y / d.z, t = uTime;
  float base = 0.02 + 0.05 * sin(x * 2.3 + t * 0.07) + 0.025 * sin(x * 6.1 - t * 0.11);
  float h = y - base;
  float curtain = smoothstep(-0.012, 0.008, h) * exp(-max(h, 0.0) * 4.5);
  if (curtain < 0.002) return vec3(0.0);
  float rays = 0.08 + 0.92 * pow(noise(vec3(x * 42.0 + t * 0.15, t * 0.2, 0.0)), 2.2) * (0.55 + 0.45 * noise(vec3(x * 8.0 - t * 0.05, h * 3.0, 1.0)));
  float folds = 0.3 + 0.7 * noise(vec3(x * 1.8 + t * 0.03, 5.0, 5.0));
  vec3 colour = mix(vec3(0.12, 0.95, 0.45), vec3(0.58, 0.2, 0.9), smoothstep(0.02, 0.24, h));
  return colour * curtain * rays * folds * smoothstep(0.15, 0.4, d.z) * 0.2 * uAurora;
}

// Meteors, each a short streak along a great circle of the sky. Each of eight
// slots fires once a cycle, or not, as heavy as the shower is just then.
vec3 meteors(vec3 d) {
  if (uMeteor < 0.01) return vec3(0.0);
  vec3 total = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float slot = float(i);
    float cycle = uTime / 2.6 + slot * 0.37;
    float k = floor(cycle), progress = fract(cycle);
    vec3 seed = vec3(k, slot, 11.0);
    if (hash(seed) > uMeteor * 0.85) continue;
    vec3 from = normalize(vec3(hash(seed + 1.0) * 1.3 - 0.65, hash(seed + 2.0) * 0.45 + 0.05, 1.0));
    // Falling, and slanting one way or the other.
    float slant = hash(seed + 3.0) - 0.5;
    vec3 heading = normalize(vec3(slant * 2.4 + sign(slant) * 0.4, -1.0, 0.0));
    heading = normalize(heading - from * dot(heading, from));
    vec3 side = cross(from, heading);
    float off = dot(d, side);
    if (abs(off) > 0.003) continue;
    float along = atan(dot(d, heading), dot(d, from));
    // Fast, and over in the first half of its cycle.
    float run = progress * 2.0;
    if (run > 1.0) continue;
    const float TAIL = 0.085;
    float head = run * 0.5, behind = head - along;
    if (behind < 0.0 || behind > TAIL) continue;
    float life = smoothstep(0.0, 0.15, run) * smoothstep(1.0, 0.6, run);
    float fade = 1.0 - behind / TAIL;
    // Thin and faint at the end of the tail, a bright point at the head.
    float width = 0.0000025 * (0.25 + 0.75 * fade);
    float streak = exp(-off * off / width) * fade * fade + exp(-(off * off + behind * behind) / 0.000004) * 1.5;
    total += mix(vec3(1.0, 0.86, 0.62), vec3(0.75, 0.88, 1.0), hash(seed + 4.0)) * streak * life;
  }
  return total * 1.6 * min(uMeteor * 1.5, 1.0);
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
  return nebula + star * bright + vec3(0.8, 0.85, 1.0) * faint + aurora(d) + meteors(d);
}

// The colour of hot gas at a temperature, 1 being the inner edge seen from rest:
// dull red where it is coolest, through orange and white, to blue-white past the hottest.
vec3 blackbody(float t) {
  vec3 c = mix(vec3(0.45, 0.04, 0.0), vec3(0.92, 0.2, 0.02), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.0, 0.58, 0.2), smoothstep(0.3, 0.56, t));
  c = mix(c, vec3(1.0, 0.9, 0.74), smoothstep(0.56, 0.84, t));
  c = mix(c, vec3(0.84, 0.91, 1.0), smoothstep(0.84, 1.08, t));
  return mix(c, vec3(0.6, 0.74, 1.0), smoothstep(1.08, 1.5, t));
}

// The two jets along the spin axis, as a glowing gas the rays pass through. Knots
// of brighter gas run outwards along them, as if thrown off the poles.
float jet(vec3 q) {
  float y = abs(q.y);
  if (y < 1.1) return 0.0;
  float width = 0.1 + y * 0.045;
  float spread = dot(q.xz, q.xz) / (width * width);
  // A bright thread inside a fainter sheath, so it reads as a beam rather than smoke.
  float core = exp(-spread) * 0.7 + exp(-spread * 6.0) * 1.2;
  if (core < 0.004) return 0.0;
  float knots = 0.55 + 0.45 * sin(y * 1.6 - uTime * 5.5);
  float shimmer = 0.6 + 0.8 * noise(vec3(q.xz * 3.0, y * 0.9 - uTime * 3.0));
  return core * knots * shimmer * smoothstep(1.1, 2.6, y) * exp(-y * 0.085) / width;
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

  vec3 orbit = normalize(vec3(-at.z, 0.0, at.x));
  float beta = min(0.6, sqrt(0.5 / (r - 1.0)));
  float shift = sqrt(1.0 - beta * beta) / (1.0 + beta * dot(orbit, -ray)) * sqrt(1.0 - 1.0 / r);
  float beaming = clamp(pow(shift, 3.2), 0.04, 4.5);

  // Gas coming towards the viewer is seen hotter, so bluer; gas going away, redder.
  vec3 ramp = blackbody(heat * mix(1.0, shift, 0.7));
  // By day the colours are full; at night they lose a little of their fire.
  ramp = mix(vec3(dot(ramp, vec3(0.3, 0.55, 0.15))), ramp, 0.8 + uDay * 0.2);
  ramp = mix(ramp, uAccent * (0.55 + heat), smoothstep(0.0, 0.5, uTint) * 0.85);

  float crest = fract(uTime * 0.5) * (OUTER - INNER) + INNER;
  float wave = exp(-(r - crest) * (r - crest) * 1.6) * uRipple * (uMid * 2.2 + uLevel * 0.5);
  float front = sin(heading * 3.0 + r * 1.9 - uTime * 3.6);
  float thought = pow(0.5 + 0.5 * front, 8.0) * uThought * 1.4;
  float scan = heading - uTime * 1.5;
  float sweep = pow(0.5 + 0.5 * cos(scan), 24.0) * uSweep * 1.6;

  opacity = edge * (0.35 + gas * 0.6);
  float grain = 0.14 + gas * gas * (1.5 + uTreble * 1.1);
  return ramp * grain * edge * heat * 1.25 * beaming * (1.0 + uBass * 0.75 + wave + thought + sweep) * uLight;
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
  vec3 p = vec3(sin(uLook.x) * cos(pitch), sin(pitch), -cos(uLook.x) * cos(pitch)) * uDistance;
  vec3 forward = normalize(-p);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 v = normalize(forward * 1.32 * uZoom + right * uv.x + up * uv.y);
  vec3 h = cross(p, v);
  float h2 = dot(h, h);
  vec3 colour = vec3(0.0);
  float through = 1.0;
  // Far out in the opening flight, light runs straight: skip to where bending starts,
  // and a ray that never gets that close sees only the sky.
  bool marching = true;
  float start = dot(p, p) - 900.0;
  if (start > 0.0) {
    float b = dot(p, v), gap = b * b - start;
    if (b < 0.0 && gap > 0.0) p += v * (-b - sqrt(gap));
    else marching = false;
  }
  findNear(p, v, sqrt(h2));
  // The smaller hole, while one is spiralling in: its own pull, and its own shadow.
  vec3 other = uCompanion.xyz;
  float otherSize = uCompanion.w;
  // Where along each step the jets are read, different for each pixel, so the
  // long steps far from the hole show as fine grain rather than bands.
  float jitter = hash(vec3(gl_FragCoord.xy, 3.0));
  vec3 jetColour = mix(vec3(0.55, 0.74, 1.0), uAccent, smoothstep(0.0, 0.5, uTint) * 0.35);
  for (int i = 0; i < 76; i++) {
    if (!marching) break;
    float r2 = dot(p, p), r = sqrt(r2);
    if (r < 1.03) { through = 0.0; break; }
    if (r > 34.0 && dot(p, v) > 0.0) break;
    float dt = min(0.15 * (r - 0.75), 1.5);
    vec3 nv = v - 1.5 * h2 * p / (r2 * r2 * r) * dt;
    if (otherSize > 0.0) {
      vec3 q = p - other;
      float qr = length(q);
      if (qr < otherSize * 1.6) { through = 0.0; break; }
      dt = min(dt, max(0.04, 0.3 * (qr - otherSize)));
      nv = v - (1.5 * h2 * p / (r2 * r2 * r) + otherSize * q / (qr * qr * qr)) * dt;
      // Pulled off its line by the second hole, the ray no longer keeps the first one's momentum.
      vec3 turned = cross(p, nv);
      h2 = dot(turned, turned) / dot(nv, nv);
      nv = normalize(nv);
    }
    vec3 np = p + nv * dt;
    float crossing = p.y * np.y < 0.0 ? p.y / (p.y - np.y) : 2.0;
    float world = anyNear ? planetAlong(p, np) : 2.0;
    if (uJet > 0.01) colour += through * jetColour * (jet(mix(p, np, jitter * 0.5)) + jet(mix(p, np, jitter * 0.5 + 0.5))) * dt * uJet * 0.25;
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
  // After a merger, rings of stretched space run outwards across the sky.
  float spread = length(uv);
  if (uWave > 0.01) {
    float front = uWaveTime * 0.32, behind = front - spread;
    float rings = sin(behind * 70.0) * smoothstep(-0.02, 0.03, behind) * exp(-max(behind, 0.0) * 4.0);
    away.xy *= 1.0 + rings * 0.035 * uWave;
  }
  colour += halo * mix(vec3(1.0, 0.76, 0.5), uAccent, smoothstep(0.0, 0.5, uTint) * 0.85) * 0.35;
  colour *= uGlow * (1.0 + uFlash * 1.4);
  // The merger's light: a ring of it around the shadow and a wash over everything near.
  // The wash goes much sooner than the ring, so the shadow is black again while the ring still glows.
  // Inside the shadow only at its height: even a trace of light there shows as grey once the
  // picture is brightened for the screen.
  float inShadow = smoothstep(0.15, 0.11, spread) * (1.0 - uFlash * uFlash * uFlash);
  colour += uFlash * vec3(0.8, 0.9, 1.0) * (exp(-pow((spread - 0.165) * 24.0, 2.0)) * 2.5 + exp(-spread * 5.0) * 0.35 * uFlash) * (1.0 - inShadow);
  if (uBare < 0.5) {
    vec3 seen = sky(normalize(away));
    // Flying in, the stars stream out from the middle: the sky read a little further in, several times.
    // Offset differently for each pixel, so the streaks read as lines and not as dotted trails.
    if (uWarp > 0.01) {
      float shift = hash(vec3(gl_FragCoord.xy, 9.0));
      for (int k = 1; k < 7; k++) {
        vec3 inward = away;
        inward.xy *= 1.0 - uWarp * 0.035 * (float(k) - shift);
        seen += sky(normalize(inward)) * (1.0 - float(k) * 0.12);
      }
      seen /= 1.0 + 3.48 * smoothstep(0.0, 0.3, uWarp);
    }
    colour += through * seen * (0.8 + abs(uPush) * 0.5) * (0.75 + uDay * 0.25);
  }
  // ACES, so the hottest gas rolls off to white instead of clipping.
  colour = clamp(colour * (2.51 * colour + 0.03) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
  vec3 shown = pow(colour, vec3(1.0 / 2.2));
  // With no sky, whatever a ray passed through is all there is, and the shadow stays solid black.
  if (uBare > 0.5) { fragment = vec4(shown, max(1.0 - through, max(shown.r, max(shown.g, shown.b)))); return; }
  fragment = vec4(shown + (hash(vec3(gl_FragCoord.xy, fract(uTime))) - 0.5) / 255.0, 1.0);
}`
