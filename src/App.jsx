import React, { useEffect, useMemo, useRef, useState } from "react";

const OVERLAYS = {
  3: {
    startSample: "/overlays/sample-kissco-3.png",
    preview: "/overlays/kissco-preview-3.png",
    final: "/overlays/kissco-3.png",
  },
  4: {
    startSample: "/overlays/sample-kissco-4.png",
    preview: "/overlays/kissco-preview-4.png",
    final: "/overlays/kissco-4.png",
  },
};

// Slots defined in a 600x1800 coordinate system
const BASE_STRIP_W = 600;
const BASE_STRIP_H = 1800;

// Inner photo windows
const SLOTS_PX = {
  4: [
    { x: 60, y: 50, w: 480, h: 385 },
    { x: 60, y: 485, w: 480, h: 380 },
    { x: 60, y: 922, w: 480, h: 368 },
    { x: 60, y: 1352, w: 480, h: 368 },
  ],
  3: [
    { x: 60, y: 60, w: 480, h: 444 },
    { x: 60, y: 536, w: 480, h: 444 },
    { x: 60, y: 1009, w: 480, h: 444 },
  ],
};

// Final bleed (export)
const FINAL_BLEED_BY_FRAME = {
  3: { x: 4, y: 6 },
  4: { x: 10, y: 12 },
};

const COUNTDOWN_SECONDS = 5;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForVideoReady(v) {
  return new Promise((res) => {
    if (!v) return res();
    if (v.readyState >= 2 && v.videoWidth > 0) return res();
    const onReady = () => {
      v.removeEventListener("loadeddata", onReady);
      res();
    };
    v.addEventListener("loadeddata", onReady);
  });
}

function expandRect(r, bleed) {
  return {
    x: r.x - bleed.x,
    y: r.y - bleed.y,
    w: r.w + bleed.x * 2,
    h: r.h + bleed.y * 2,
  };
}

// cover-crop drawing (like CSS object-fit: cover)
function drawCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.width;
  const ih = img.height;
  const ir = iw / ih;
  const br = dw / dh;

  let sw, sh, sx, sy;

  if (ir > br) {
    sh = ih;
    sw = ih * br;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = iw / br;
    sx = 0;
    sy = (ih - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

async function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`Failed to load image: ${src}`));
    im.src = src;
  });
}

// Convert PX rects (600x1800 system) to % for responsive DOM preview positioning
function slotPxToDomStyle(r) {
  return {
    left: `${(r.x / BASE_STRIP_W) * 100}%`,
    top: `${(r.y / BASE_STRIP_H) * 100}%`,
    width: `${(r.w / BASE_STRIP_W) * 100}%`,
    height: `${(r.h / BASE_STRIP_H) * 100}%`,
  };
}

export default function App() {
  const [step, setStep] = useState("start"); // start | filter | frame | booth | result
  const [mode, setMode] = useState(null); // "color" | "bw"
  const [frame, setFrame] = useState(4); // 3 | 4

  const overlaySet = OVERLAYS[frame];
  const slotsPx = useMemo(() => SLOTS_PX[frame], [frame]);

  const videoRef = useRef(null);
  const shutterRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [flashOn, setFlashOn] = useState(false);

  const [shots, setShots] = useState([]); // dataURLs
  const [finalUrl, setFinalUrl] = useState("");

  // Start camera only in booth
  useEffect(() => {
    if (step !== "booth") return;

    let cancelled = false;

    async function startCam() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        if (cancelled) return;

        setStream(s);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      } catch (e) {
        console.error(e);
        alert("Camera permission required (HTTPS on mobile).");
      }
    }

    startCam();

    return () => {
      cancelled = true;
    };
  }, [step]);

  // Stop stream when leaving booth
  useEffect(() => {
    if (step !== "booth" && stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }, [step, stream]);

  function resetAll() {
    setMode(null);
    setFrame(4);
    setShots([]);
    setFinalUrl("");
    setCountdown(null);
    setFlashOn(false);
    setStep("start");
  }

  async function captureFrameFromVideo() {
    const v = videoRef.current;
    if (!v) return "";

    await waitForVideoReady(v);

    const vw = v.videoWidth || 1280;
    const vh = v.videoHeight || 720;

    const outW = 1600;
    const outH = Math.round((outW * vh) / vw);

    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d");

    // Mirror selfie
    ctx.save();
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, outW, outH);
    ctx.restore();

    if (mode === "bw") {
      const imgData = ctx.getImageData(0, 0, outW, outH);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    return c.toDataURL("image/jpeg", 0.92);
  }

  async function buildFinalStrip(photos) {
    // Load overlay FIRST so canvas matches overlay’s REAL pixel size
    const overlayImg = await loadImage(overlaySet.final);
    const W = overlayImg.naturalWidth || overlayImg.width;
    const H = overlayImg.naturalHeight || overlayImg.height;

    const sx = W / BASE_STRIP_W;
    const sy = H / BASE_STRIP_H;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const imgs = await Promise.all(photos.map((src) => loadImage(src)));

    ctx.clearRect(0, 0, W, H);

    // Photos under overlay
    const bleed = FINAL_BLEED_BY_FRAME[frame] || { x: 0, y: 0 };
    imgs.forEach((im, i) => {
      const r0 = slotsPx[i];
      if (!r0) return;
      const r = expandRect(r0, bleed);
      drawCover(ctx, im, r.x * sx, r.y * sy, r.w * sx, r.h * sy);
    });

    // Overlay on top
    ctx.drawImage(overlayImg, 0, 0, W, H);

    return canvas.toDataURL("image/png");
  }

  async function takePhotos() {
    try {
      setShots([]);
      setFinalUrl("");

      const collected = [];

      for (let i = 0; i < frame; i++) {
        for (let n = COUNTDOWN_SECONDS; n >= 1; n--) {
          setCountdown(n);
          await sleep(1000);
        }
        setCountdown(null);

        setFlashOn(true);

        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        try {
       if (shutterRef.current) {
       shutterRef.current.currentTime = 0;
       await shutterRef.current.play();
       }
      } catch {}

      await sleep(220);
      setFlashOn(false);

        const dataUrl = await captureFrameFromVideo();
        collected.push(dataUrl);

        // preview updates as you capture
        setShots([...collected]);

        if (i < frame - 1) await sleep(900);
      }

      const built = await buildFinalStrip(collected);
      setFinalUrl(built);
      setStep("result");
    } catch (e) {
      console.error(e);
      alert("Something went wrong while building the strip.");
    }
  }

  async function downloadStrip() {
  if (!finalUrl) return;

  const filename = `kissco-strip-${frame}-${mode || "color"}.png`;

  try {
    const res = await fetch(finalUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // ✅ iOS Safari often ignores download attr — open in new tab fallback
    setTimeout(() => {
      try { window.open(url, "_blank"); } catch {}
      URL.revokeObjectURL(url);
    }, 200);
  } catch (e) {
    console.error(e);
    // fallback: open the image directly
    window.open(finalUrl, "_blank");
  }
}

  async function shareStrip() {
    if (!finalUrl) return;
    try {
      const res = await fetch(finalUrl);
      const blob = await res.blob();
      const file = new File([blob], "kissco-strip.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Kissco Booth",
          text: "My photo strip 💗",
          files: [file],
        });
      } else {
        downloadStrip();
      }
    } catch {
      downloadStrip();
    }
  }

  return (
    <div className="app">
      <div className="screen">
        <audio ref={shutterRef} src="/assets/shutter.mp3" preload="auto" />

        {step === "start" && (
          <>
            <div className="startRow">
              <div className="startStrips">
                <img className="startStrip tiltLeft" src={OVERLAYS[4].startSample} alt="sample strip left" />
                <img className="startStrip tiltRight" src={OVERLAYS[3].startSample} alt="sample strip right" />
              </div>

              <button className="tapBtn" onClick={() => setStep("filter")} aria-label="Tap to start">
                <svg className="tapSvg" viewBox="0 0 200 200">
                  <defs>
                    <path
                      id="circlePath"
                      d="M 100, 100 m -74, 0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0"
                    />
                  </defs>
                  <text className="tapText">
                    <textPath href="#circlePath" startOffset="50%" textAnchor="middle">
                      TAP TO START • TAP TO START • TAP TO START •
                    </textPath>
                  </text>
                </svg>
                <div className="tapCenter"></div>
              </button>
            </div>

            <div className="credit lower">BOOTH MADE BY @LEILASVISUALS</div>
          </>
        )}

        {step === "filter" && (
          <>
            <div className="center">
              <div className="titleSmall">PICK YOUR COLOR</div>
            </div>

            <div className="buttonRow">
              <button className={`bigPill ${mode === "color" ? "active" : ""}`} onClick={() => setMode("color")}>
                COLOR
              </button>
              <div className="orText">OR</div>
              <button className={`bigPill ${mode === "bw" ? "active" : ""}`} onClick={() => setMode("bw")}>
                B&amp;W
              </button>
            </div>

            <button className="primaryBtn" disabled={!mode} onClick={() => setStep("frame")}>
              NEXT
            </button>

            <div className="credit lower">BOOTH MADE BY @LEILASVISUALS</div>
          </>
        )}

        {step === "frame" && (
          <>
            <div className="center">
              <div className="titleSmall">PICK YOUR FRAME</div>
            </div>

            <div className="frameChoices">
              {[3, 4].map((n) => (
                <div key={n} className={`frameCard ${frame === n ? "selected" : ""}`} onClick={() => setFrame(n)}>
                  <img
                    className="frameImg"
                    src={OVERLAYS[n].preview || OVERLAYS[n].final}
                    alt={`frame ${n}`}
                    onError={(e) => (e.currentTarget.src = OVERLAYS[n].final)}
                  />
                  <div className="frameLabel">{n} STRIP</div>
                </div>
              ))}
            </div>

             <div className="frameButtonRow">
            <button className="secondaryBtn" onClick={() => setStep("filter")}>BACK</button>
            <button className="primaryBtn" onClick={() => setStep("booth")}>START</button>
          </div>

            <div className="credit lower">BOOTH MADE BY @LEILASVISUALS</div>
          </>
        )}

        {step === "booth" && (
          <>
            <div className="boothHeader">
              <div className="titleSmall">GET READY!</div>
              <div className="subSmall">THERE IS A {COUNTDOWN_SECONDS} SECOND TIMER BETWEEN SHOTS.</div>
            </div>

            <div className="boothGrid">
              <div className="cameraWrap">
              <video
                className={`video ${mode === "bw" ? "bw" : ""}`}
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />
                <div className={`flash ${flashOn ? "on" : ""}`} />
                {countdown && <div className="countdown">{countdown}</div>}
              </div>

              <div className="stripPreviewWrap" style={{ overflow: "hidden" }}>
                <div className="stripGlow" />

                <div className="stripPreview">
                  {/* White placeholders */}
                  {slotsPx.map((r0, idx) => (
                    <div
                      key={`pholder-${idx}`}
                      className="placeholder"
                      style={{ ...slotPxToDomStyle(r0) }}
                    />
                  ))}

                  {/* Photos */}
                  {slotsPx.map((r0, idx) => (
                    <div key={`shot-${idx}`} className="previewSlot" style={{ ...slotPxToDomStyle(r0) }}>
                      {shots[idx] ? <img src={shots[idx]} alt={`shot ${idx + 1}`} /> : null}
                    </div>
                  ))}

                  {/* Overlay */}
                  <img className="stripOverlay" src={overlaySet.final} alt="preview strip overlay" />
                </div>
              </div>
            </div>

            <div className="buttonRowResult">
              <button className="secondaryBtn" onClick={() => setStep("frame")}>
                BACK
              </button>
              <button className="primaryBtn" onClick={takePhotos}>
                TAKE PHOTOS
              </button>
            </div>

            <div className="credit lower">BOOTH MADE BY @LEILASVISUALS</div>
          </>
        )}

        {step === "result" && (
          <>
            <div className="center">
              <div className="titleSmall">YOU LOOK SO GOOD!</div>
            </div>

            <div className="resultWrap">
              {finalUrl ? (
                <img className="finalStrip" src={finalUrl} alt="final strip" />
              ) : (
                <div className="loadingBox">BUILDING…</div>
              )}
            </div>

            <div className="buttonRowResult">
              <button className="primaryBtn" onClick={downloadStrip} disabled={!finalUrl}>
                DOWNLOAD
              </button>
              <button className="secondaryBtn" onClick={shareStrip} disabled={!finalUrl}>
                SHARE
              </button>
              <button className="secondaryBtn" onClick={resetAll}>
                START OVER
              </button>
            </div>

            <div className="credit lower">BOOTH MADE BY @LEILASVISUALS</div>
          </>
        )}
      </div>
    </div>
  );
}
