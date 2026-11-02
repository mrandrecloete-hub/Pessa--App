package com.example.aicamerastudio.camera.beauty.gl

/**
 * GLSL ES 3.0 sources of the beauty pipeline. Coordinates: every pass works in the camera texture's
 * own space (u, v in 0..1); face points from the tracker are in the same space, so nothing depends on
 * how the phone is held. Only the final blit applies each output's transform.
 */
object BeautyShaders {
    const val QUAD_VS = """#version 300 es
in vec2 aPos;
uniform mat4 uTexMatrix;
out vec2 vUv;
void main() {
    vec2 uv = aPos * 0.5 + 0.5;
    vUv = (uTexMatrix * vec4(uv, 0.0, 1.0)).xy;
    gl_Position = vec4(aPos, 0.0, 1.0);
}"""

    const val COPY_OES_FS = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision mediump float;
uniform samplerExternalOES uTex;
in vec2 vUv;
out vec4 o;
void main() { o = vec4(texture(uTex, vUv).rgb, 1.0); }"""

    const val COPY_FS = """#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 o;
void main() { o = vec4(texture(uTex, vUv).rgb, 1.0); }"""

    /** Edge preserving blur, one direction: neighbours with a very different colour count less, so skin smooths but edges stay. */
    const val BILATERAL_FS = """#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uStep;
uniform float uSigmaR;
in vec2 vUv;
out vec4 o;
void main() {
    vec3 c = texture(uTex, vUv).rgb;
    vec3 sum = c; float wsum = 1.0;
    for (int i = 1; i <= 6; i++) {
        float ws = exp(-float(i * i) / 18.0);
        for (int s = -1; s <= 1; s += 2) {
            vec3 n = texture(uTex, vUv + uStep * float(i * s)).rgb;
            vec3 d = n - c;
            float w = ws * exp(-dot(d, d) / (2.0 * uSigmaR * uSigmaR));
            sum += n * w; wsum += w;
        }
    }
    o = vec4(sum / wsum, 1.0);
}"""

    const val GAUSS_FS = """#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uStep;
in vec2 vUv;
out vec4 o;
void main() {
    vec4 sum = texture(uTex, vUv) * 0.2270270270;
    sum += (texture(uTex, vUv + uStep * 1.3846153846) + texture(uTex, vUv - uStep * 1.3846153846)) * 0.3162162162;
    sum += (texture(uTex, vUv + uStep * 3.2307692308) + texture(uTex, vUv - uStep * 3.2307692308)) * 0.0702702703;
    o = sum;
}"""

    const val MASK_VS = """#version 300 es
in vec2 aUv;
void main() { gl_Position = vec4(aUv * 2.0 - 1.0, 0.0, 1.0); }"""

    const val MASK_FS = """#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 o;
void main() { o = uColor; }"""

    const val COMPOSITE_FS = """#version 300 es
precision highp float;
uniform sampler2D uCam, uHalf, uSmooth, uLarge, uMask;
uniform vec2 uSize;
uniform float uSmoothAmt, uBright, uBlemish, uUnderEye, uTone, uLight, uEyes, uTeeth, uLip, uBlush, uContour, uJaw;
uniform vec3 uLipTint;
uniform int uFaces;
uniform vec4 uFace[3];      // centre x, y (nose tip, px), face size (px), visibility
uniform vec4 uAxis[3];      // across the face (right eye to left eye) x, y; down the face x, y
uniform vec4 uLid[3];       // lower lid right x, y; left x, y
uniform vec4 uCheek[3];
uniform vec4 uCheekbone[3];
uniform vec4 uJawPt[3];
uniform vec4 uNoseSide[3];
uniform vec4 uBridge[3];    // nose bridge x, y; forehead x, y
// grade
uniform float uExposure, uContrast, uSat, uVib, uTemp, uTint, uFade, uSplit, uGlow, uVignette, uGrain, uStrength, uSeed;
uniform vec3 uShadowTint, uHighTint;
in vec2 vUv;
out vec4 o;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toYcc(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), 0.5 + dot(c, vec3(-0.168736, -0.331264, 0.5)), 0.5 + dot(c, vec3(0.5, -0.418688, -0.081312))); }
vec3 fromYcc(vec3 y) { float cb = y.y - 0.5; float cr = y.z - 0.5; return vec3(y.x + 1.402 * cr, y.x - 0.344136 * cb - 0.714136 * cr, y.x + 1.772 * cb); }
float sat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
float skinProb(vec3 c) {
    vec3 y = toYcc(c);
    float d = length((y.yz - vec2(0.40, 0.595)) / vec2(0.10, 0.085));
    return (1.0 - smoothstep(0.85, 1.7, d)) * smoothstep(0.03, 0.10, y.x);
}
// Skin work may only remove SMALL differences (pores, spots, redness). Anything bigger is real structure
// (nasolabial folds, nose shadow, eyelids, nostrils) and is left alone, so smoothing never flattens the face.
vec3 softLimit(vec3 d) { return d * (1.0 - smoothstep(0.045, 0.12, length(d))); }
float blob(vec2 p, vec2 c, float r) { vec2 d = (p - c) / r; return exp(-dot(d, d)); }
float ellipse(vec2 p, vec2 c, vec2 ax, vec2 ay, float rx, float ry) {
    vec2 d = p - c; float a = dot(d, ax) / rx; float b = dot(d, ay) / ry; return exp(-(a * a + b * b));
}
float curve(float x) { float c = clamp(x, 0.0, 1.0); float s = c * c * (3.0 - 2.0 * c); return c + (s - c) * uContrast * 2.5; }

vec3 grade(vec3 c0, vec3 large, vec2 uv) {
    vec3 c = c0 * exp2(uExposure);
    c.r += uTemp * 0.08; c.b -= uTemp * 0.08;
    c.g -= uTint * 0.05; c.r += uTint * 0.02; c.b += uTint * 0.02;
    c = vec3(curve(c.r), curve(c.g), curve(c.b));
    float l = luma(c);
    float k = 1.0 + uSat + uVib * clamp(1.0 - sat(c), 0.0, 1.0);
    c = vec3(l) + (c - vec3(l)) * k;
    if (uSplit > 0.0) {
        float ll = clamp(luma(c), 0.0, 1.0);
        c += (uShadowTint - 0.5) * (1.0 - ll) * (1.0 - ll) * uSplit * 0.35 + (uHighTint - 0.5) * ll * ll * uSplit * 0.35;
    }
    c = c * (1.0 - uFade * 0.12) + uFade * 0.08;
    // Soft glow: screen the blurred bright parts back over the picture.
    vec3 g = max(large - 0.45, 0.0) * 1.2 * uGlow;
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - g);
    vec2 d = (uv - 0.5) * vec2(uSize.x / max(uSize.x, uSize.y), uSize.y / max(uSize.x, uSize.y)) * 1.6;
    c *= 1.0 - uVignette * 0.45 * smoothstep(0.35, 1.0, dot(d, d));
    if (uGrain > 0.0) {
        float n = fract(sin(dot(floor(uv * uSize) + uSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        c += n * uGrain * 0.08;
    }
    return mix(c0, clamp(c, 0.0, 1.0), uStrength);
}

void main() {
    vec2 px = vUv * uSize;
    // Optional jaw refinement: sample slightly outward on the lower jaw sides (at most 3.5% of the face size).
    vec2 off = vec2(0.0);
    for (int i = 0; i < 3; i++) {
        if (i >= uFaces || uJaw <= 0.0) break;
        vec4 f = uFace[i]; vec2 ex = uAxis[i].xy; vec2 ey = uAxis[i].zw;
        vec2 d = px - f.xy;
        float lx = dot(d, ex) / f.z; float ly = dot(d, ey) / f.z;
        float wy = smoothstep(0.0, 0.22, ly) * (1.0 - smoothstep(0.42, 0.62, ly));
        float wx = smoothstep(0.12, 0.30, abs(lx)) * (1.0 - smoothstep(0.46, 0.66, abs(lx)));
        off += ex * sign(lx) * uJaw * 0.035 * f.z * wx * wy * f.w;
    }
    vec2 uv = vUv + off / uSize;

    vec3 c = texture(uCam, uv).rgb;
    vec3 orig = c;
    vec4 m = texture(uMask, uv);
    vec3 hb = texture(uHalf, uv).rgb;
    vec3 sm = texture(uSmooth, uv).rgb;
    vec3 lg = texture(uLarge, uv).rgb;
    float sk = m.r * skinProb(orig);

    // Skin smoothing, keeping about a quarter of the original fine texture so skin does not look plastic.
    vec3 detail = orig - hb;
    c = orig + softLimit(mix(sm, orig, 0.28) - orig) * (uSmoothAmt * sk);
    // Blemishes: small spots darker than the surrounding skin are filled from the surroundings.
    float spot = smoothstep(0.025, 0.09, luma(lg) - luma(orig)) * sk;
    c = mix(c, mix(sm, lg, 0.5), uBlemish * spot * 0.85);
    // Tone balance: evens blotchy redness towards the person's own average skin colour nearby (never a different tone).
    vec3 yc = toYcc(c); vec3 ly = toYcc(lg);
    yc.yz = mix(yc.yz, ly.yz, uTone * sk * 0.6);
    c = fromYcc(yc);
    // Skin brightness: a gentle midtone lift.
    c = c + (1.0 - c) * c * 0.45 * uBright * sk;

    for (int i = 0; i < 3; i++) {
        if (i >= uFaces) break;
        vec4 f = uFace[i]; vec2 ex = uAxis[i].xy; vec2 ey = uAxis[i].zw; float s = f.z; float vis = f.w;
        // Under eyes: lift the shadow just below each lower lid.
        float ue = ellipse(px, uLid[i].xy + ey * 0.05 * s, ex, ey, 0.085 * s, 0.04 * s) + ellipse(px, uLid[i].zw + ey * 0.05 * s, ex, ey, 0.085 * s, 0.04 * s);
        ue *= m.r * vis;
        c += softLimit(mix(sm, c, 0.4) - c) * clamp(uUnderEye * ue, 0.0, 1.0) * 0.8;
        c += (1.0 - c) * 0.16 * uUnderEye * ue * (1.0 - smoothstep(0.35, 0.75, luma(c)));
        // Facial light: a soft key light on the centre of the face.
        float key = blob(px, mix(uBridge[i].xy, f.xy, 0.4), 0.42 * s) * vis;
        c *= 1.0 + uLight * 0.14 * key * m.r;
        c += (1.0 - c) * 0.06 * uLight * key * m.r;
        // Makeup: blush, contour shading and highlight (colour and light only, shapes unchanged).
        float bl = (blob(px, uCheek[i].xy - ey * 0.03 * s, 0.11 * s) + blob(px, uCheek[i].zw - ey * 0.03 * s, 0.11 * s)) * m.r * vis;
        c = mix(c, c * vec3(1.0, 0.80, 0.82) + vec3(0.04, 0.0, 0.01), clamp(uBlush * bl, 0.0, 1.0) * 0.45);
        float sh = (blob(px, mix(uCheekbone[i].xy, uJawPt[i].xy, 0.45), 0.075 * s) + blob(px, mix(uCheekbone[i].zw, uJawPt[i].zw, 0.45), 0.075 * s)
                   + 0.6 * (blob(px, uNoseSide[i].xy, 0.03 * s) + blob(px, uNoseSide[i].zw, 0.03 * s))) * m.r * vis;
        float hi = (blob(px, mix(uBridge[i].xy, f.xy, 0.5), 0.035 * s) + 0.7 * blob(px, uBridge[i].zw, 0.09 * s)) * m.r * vis;
        c *= 1.0 - uContour * 0.13 * min(sh, 1.0);
        c += (1.0 - c) * uContour * 0.10 * min(hi, 1.0);
    }

    // Eyes: crisper detail and slightly brighter whites (size and shape unchanged).
    float eye = m.a;
    c = mix(c, c + (orig - hb) * 1.1, uEyes * eye * 0.8);
    float whites = eye * (1.0 - smoothstep(0.08, 0.25, sat(c))) * smoothstep(0.3, 0.55, luma(c));
    c = mix(c, c + (1.0 - c) * 0.22, uEyes * whites);
    // Teeth: less yellow and a little brighter, only on light, low saturation pixels inside the mouth.
    float th = m.b * smoothstep(0.22, 0.42, luma(c)) * (1.0 - smoothstep(0.22, 0.45, sat(c)));
    vec3 ty = toYcc(c);
    ty.y = mix(ty.y, max(ty.y, 0.5), uTeeth * th * 0.85);
    ty.z = mix(ty.z, 0.5 + (ty.z - 0.5) * 0.6, uTeeth * th);
    ty.x += uTeeth * th * 0.07;
    c = fromYcc(ty);
    // Lip colour: the chosen tint at the lips' own brightness.
    float lip = m.g * uLip;
    vec3 tinted = clamp(uLipTint * (luma(c) / max(luma(uLipTint), 0.05)), 0.0, 1.0);
    c = mix(c, mix(c, tinted, 0.75), lip * 0.6);

    o = vec4(grade(clamp(c, 0.0, 1.0), lg, vUv), 1.0);
}"""
}
