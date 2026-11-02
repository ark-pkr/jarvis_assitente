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
 * middle sends a wave of light outwards, treble brightens the fine gas.
 */
export const BLACK_HOLE = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime, uTurn, uGlow, uZoom, uTint, uLevel, uBass, uMid, uTreble, uRipple, uThought, uSweep;
uniform vec3 uAccent;
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

void main() {
  // A little above centre, so the title below the hole clears its lower arc.
  vec2 uv = (gl_FragCoord.xy - uResolution * vec2(0.5, 0.53)) / uResolution.y;
  float c = cos(ROLL), s = sin(ROLL);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  vec3 p = vec3(0.0, sin(TILT), -cos(TILT)) * 24.0;
  vec3 forward = normalize(-p);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 v = normalize(forward * 1.32 * uZoom + right * uv.x + up * uv.y);
  vec3 h = cross(p, v);
  float h2 = dot(h, h);
  vec3 colour = vec3(0.0);
  float through = 1.0;
  for (int i = 0; i < 76; i++) {
    float r2 = dot(p, p), r = sqrt(r2);
    if (r < 1.03) { through = 0.0; break; }
    if (r > 34.0 && dot(p, v) > 0.0) break;
    float dt = min(0.15 * (r - 0.75), 1.5);
    vec3 nv = v - 1.5 * h2 * p / (r2 * r2 * r) * dt;
    vec3 np = p + nv * dt;
    if (p.y * np.y < 0.0) {
      vec3 light = disc(mix(p, np, p.y / (p.y - np.y)), normalize(nv));
      colour += through * light;
      through *= 1.0 - opacity;
    }
    p = np; v = nv;
  }
  colour = colour * uGlow + through * sky(normalize(v)) * 0.8;
  // ACES, so the hottest gas rolls off to white instead of clipping.
  colour = clamp(colour * (2.51 * colour + 0.03) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
  fragment = vec4(pow(colour, vec3(1.0 / 2.2)) + (hash(vec3(gl_FragCoord.xy, fract(uTime))) - 0.5) / 255.0, 1.0);
}`
