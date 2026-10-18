// Weather effects: rain, snow, clouds, heat glow, frost, lightning, stars.
const fx = (() => {
  const cv = document.getElementById("fx"), ctx = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W, H, drops = [], flakes = [], clouds = [], stars = [], cfg = null, raf = 0, flash = 0, t = 0;
  const R = Math.random;
  const light = () => document.body.dataset.theme === "light";

  function size() { W = cv.width = innerWidth; H = cv.height = innerHeight; if (cfg) build(); }
  addEventListener("resize", size);

  function build() {
    const nRain = cfg.rain ? Math.round(70 + Math.min(cfg.rain, 10) * 45) : 0;
    const nSnow = cfg.snow ? Math.round(90 + Math.min(cfg.snow, 5) * 45) : 0;
    const fast = 1 + Math.min(cfg.rain, 10) / 8;
    drops = Array.from({ length: nRain }, () => ({ x: R() * (W + 200), y: R() * H, l: 10 + R() * 14, v: (11 + R() * 9) * fast }));
    flakes = Array.from({ length: nSnow }, () => ({ x: R() * W, y: R() * H, r: 1 + R() * 2.5, v: 0.6 + R() * 1.6, p: R() * 6 }));
    clouds = Array.from({ length: Math.round(cfg.clouds / 11) + (cfg.mist ? 4 : 0) }, () => ({ x: R() * W, y: R() * H * 0.6, r: 90 + R() * 150, v: 0.12 + R() * 0.3 }));
    stars = cfg.night && cfg.clouds < 55 && !cfg.rain && !cfg.snow ? Array.from({ length: 110 }, () => ({ x: R() * W, y: R() * H * 0.7, r: R() * 1.3 + 0.2, p: R() * 6 })) : [];
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    t += 0.016;
    const lt = light();

    if (cfg.temp >= 28) {            // heat: warm sun glow, grows with temperature
      const k = Math.min(1, (cfg.temp - 27) / 14), pulse = 1 + Math.sin(t * 1.2) * 0.05;
      const g = ctx.createRadialGradient(W * 0.88, -40, 10, W * 0.88, -40, Math.max(W, H) * (0.5 + k * 0.5) * pulse);
      g.addColorStop(0, `rgba(255,${170 - k * 60},60,${(lt ? 0.35 : 0.3) * k + 0.1})`); g.addColorStop(1, "rgba(255,150,40,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (cfg.temp <= 3) {             // cold: icy frost from the edges
      const k = Math.min(1, (3 - cfg.temp) / 15 + 0.25);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "rgba(160,215,255,0)"); g.addColorStop(1, `rgba(160,215,255,${(lt ? 0.35 : 0.3) * k})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    stars.forEach((s) => { ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t + s.p)); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.3); ctx.fill(); });
    ctx.globalAlpha = 1;

    const base = cfg.storm ? 0.16 : 0.05 + (cfg.clouds / 100) * 0.1;   // clouds: more cover = more clouds, darker
    const col = lt ? (cfg.storm ? "70,80,105" : "95,110,135") : (cfg.storm ? "90,100,130" : "150,170,200");
    clouds.forEach((c) => {
      for (let i = 0; i < 3; i++) {
        const cx = c.x + i * c.r * 0.6, cy = c.y + (i % 2) * c.r * 0.15, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r);
        g.addColorStop(0, `rgba(${col},${base})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.fillRect(cx - c.r, cy - c.r, c.r * 2, c.r * 2);
      }
      c.x += c.v; if (c.x - c.r > W) c.x = -c.r * 2.5;
    });

    ctx.strokeStyle = lt ? "rgba(30,90,170,.55)" : "rgba(150,200,255,.5)"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    drops.forEach((d) => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.2, d.y + d.l); d.y += d.v; d.x -= d.v * 0.2; if (d.y > H) { d.y = -20; d.x = R() * (W + 200); } });
    ctx.stroke();

    ctx.fillStyle = lt ? "rgba(90,140,190,.75)" : "rgba(255,255,255,.8)";
    flakes.forEach((f) => { f.y += f.v; f.x += Math.sin(t + f.p) * 0.5; if (f.y > H) { f.y = -5; f.x = R() * W; } ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.3); ctx.fill(); });

    if (cfg.storm) {                 // lightning
      if (R() < 0.004) flash = 1;
      if (flash > 0) { ctx.fillStyle = `rgba(${lt ? "120,90,200" : "255,255,255"},${flash * 0.22})`; ctx.fillRect(0, 0, W, H); flash -= 0.06; }
    }
    if (!still) raf = requestAnimationFrame(frame);
  }

  return {
    set(c) { cfg = c; size(); cancelAnimationFrame(raf); frame(); },
  };
})();
