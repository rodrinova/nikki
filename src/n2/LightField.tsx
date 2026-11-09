import { useEffect, useRef, useState } from 'react';

/**
 * O campo de luz da NIKKI 2: o fundo é feito de luzes que dizem coisas (o mês, a hora, quem está). Um shader muito
 * pequeno, desenhado a 1/6 da resolução (a luz é suave, não precisa de mais) e a 30 imagens por segundo, que para
 * quando a página não se vê. Sem WebGL, com «reduzir movimento», «poupar dados», ligação lenta ou um aparelho
 * modesto: os mesmos focos em gradientes de CSS, parados.
 */
export interface Light { x: number; y: number; r: number; i: number; c: string } // x, y, r em 0..1 do ecrã; i 0..1; c #RRGGBB

const MAX = 5;
const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [1, 0.48, 0.12];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Aparelho e ligação que aguentam um fundo animado? */
export function rich(): boolean {
  if (typeof window === 'undefined') return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  if (nav.connection?.saveData || /(^|-)2g$/.test(nav.connection?.effectiveType ?? '')) return false;
  if ((nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 2) return false;
  return true;
}

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FS = `precision mediump float;
uniform vec2 res;uniform float t;uniform vec4 L[${MAX}];uniform vec3 C[${MAX}];uniform int n;
float h(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/res; uv.y=1.-uv.y; float a=res.x/res.y;
  vec3 col=vec3(.043);
  for(int k=0;k<${MAX};k++){ if(k>=n) break;
    vec4 l=L[k]; float s=float(k)*1.7;
    vec2 c=l.xy+.035*vec2(sin(t*.11+s),cos(t*.09+s*1.3));
    vec2 d=(uv-c)*vec2(a,1.);
    float r=l.z*(1.+.06*sin(t*.23+s));
    col+=C[k]*l.w*exp(-dot(d,d)/(r*r));
  }
  col+=(h(gl_FragCoord.xy+t)-.5)/255.*2.;
  gl_FragColor=vec4(col,1.);
}`;

export function LightField({ lights, dim = 1 }: { lights: Light[]; dim?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(lights); live.current = lights;
  const dimRef = useRef(dim); dimRef.current = dim;
  const [gl, setGl] = useState(() => rich());
  useEffect(() => {
    if (!gl) return;
    const cv = ref.current!;
    const g = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!g) { setGl(false); return; }
    const sh = (type: number, src: string) => { const s = g.createShader(type)!; g.shaderSource(s, src); g.compileShader(s); return s; };
    const pr = g.createProgram()!;
    g.attachShader(pr, sh(g.VERTEX_SHADER, VS)); g.attachShader(pr, sh(g.FRAGMENT_SHADER, FS)); g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) { setGl(false); return; }
    g.useProgram(pr);
    const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    const pl = g.getAttribLocation(pr, 'p'); g.enableVertexAttribArray(pl); g.vertexAttribPointer(pl, 2, g.FLOAT, false, 0, 0);
    const uRes = g.getUniformLocation(pr, 'res'), uT = g.getUniformLocation(pr, 't'), uL = g.getUniformLocation(pr, 'L'), uC = g.getUniformLocation(pr, 'C'), uN = g.getUniformLocation(pr, 'n');
    const size = () => { const w = Math.max(32, Math.round(innerWidth / 6)), h = Math.max(32, Math.round(innerHeight / 6)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; g.viewport(0, 0, w, h); } };
    let id = 0, last = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      id = requestAnimationFrame(frame);
      if (document.hidden || now - last < 33) return; // 30 por segundo chega
      last = now; size();
      const ls = live.current.slice(0, MAX);
      const L = new Float32Array(MAX * 4), C = new Float32Array(MAX * 3);
      ls.forEach((l, k) => { L.set([l.x, l.y, l.r, l.i * dimRef.current], k * 4); C.set(hex(l.c), k * 3); });
      g.uniform2f(uRes, cv.width, cv.height); g.uniform1f(uT, (now - t0) / 1000);
      g.uniform4fv(uL, L); g.uniform3fv(uC, C); g.uniform1i(uN, ls.length);
      g.drawArrays(g.TRIANGLES, 0, 3);
    };
    id = requestAnimationFrame(frame);
    const lost = (e: Event) => { e.preventDefault(); setGl(false); };
    cv.addEventListener('webglcontextlost', lost);
    return () => { cancelAnimationFrame(id); cv.removeEventListener('webglcontextlost', lost); g.getExtension('WEBGL_lose_context')?.loseContext(); };
  }, [gl]);
  if (!gl) {
    // Parado: os mesmos focos em gradientes.
    const bg = lights.slice(0, MAX).map((l) => {
      const [r, g, b] = hex(l.c).map((v) => Math.round(v * 255));
      return `radial-gradient(${Math.round(l.r * 220)}vmax ${Math.round(l.r * 220)}vmax at ${Math.round(l.x * 100)}% ${Math.round(l.y * 100)}%, rgba(${r},${g},${b},${(l.i * dim * 0.85).toFixed(2)}), transparent 70%)`;
    }).join(',');
    return <div className="n2-field still" aria-hidden="true" style={{ background: `${bg}${bg ? ',' : ''}#0B0B0B` }} />;
  }
  return <canvas ref={ref} className="n2-field" aria-hidden="true" />;
}
