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

const BASE_STRIP_W = 600;
const BASE_STRIP_H = 1800;

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

const COUNTDOWN = 5;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slotPxToDomStyle(r) {
  return {
    left: `${(r.x / BASE_STRIP_W) * 100}%`,
    top: `${(r.y / BASE_STRIP_H) * 100}%`,
    width: `${(r.w / BASE_STRIP_W) * 100}%`,
    height: `${(r.h / BASE_STRIP_H) * 100}%`,
  };
}

export default function App() {
  const [step, setStep] = useState("start");
  const [mode, setMode] = useState(null);
  const [frame, setFrame] = useState(4);
  const [shots, setShots] = useState([]);
  const [countdown, setCountdown] = useState(null);

  const videoRef = useRef(null);
  const overlaySet = OVERLAYS[frame];
  const slotsPx = useMemo(() => SLOTS_PX[frame], [frame]);

  useEffect(() => {
    if (step !== "booth") return;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      });
  }, [step]);

  async function capture() {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL("image/jpeg", 0.9);
  }

  async function takePhotos() {
    const collected = [];

    for (let i = 0; i < frame; i++) {
      for (let n = COUNTDOWN; n >= 1; n--) {
        setCountdown(n);
        await sleep(1000);
      }
      setCountdown(null);

      const shot = await capture();
      collected.push(shot);
      setShots([...collected]);
      await sleep(600);
    }
  }

  return (
    <div className="app">
      <div className="screen">

        {step === "start" && (
          <>
            <div className="startWrap">
              <img className="startStrip" src={OVERLAYS[4].startSample} />
              <img className="startStrip" src={OVERLAYS[3].startSample} />
            </div>
            <button className="primaryBtn largeStart" onClick={() => setStep("filter")}>
              TAP TO START
            </button>
          </>
        )}

        {step === "filter" && (
          <>
            <div className="titleSmall">PICK YOUR COLOR</div>
            <div className="buttonRow">
              <button className={`bigPill ${mode==="color"?"active":""}`} onClick={()=>setMode("color")}>COLOR</button>
              <button className={`bigPill ${mode==="bw"?"active":""}`} onClick={()=>setMode("bw")}>B&amp;W</button>
            </div>
            <button className="primaryBtn" disabled={!mode} onClick={()=>setStep("frame")}>NEXT</button>
          </>
        )}

        {step === "frame" && (
          <>
            <div className="titleSmall">PICK YOUR FRAME</div>

            <div className="frameChoices">
              {[3,4].map(n=>(
                <div key={n} className={`frameCard ${frame===n?"selected":""}`} onClick={()=>setFrame(n)}>
                  <img src={OVERLAYS[n].preview} />
                  <div>{n} STRIP</div>
                </div>
              ))}
            </div>

            <div className="stickyBar">
              <button className="secondaryBtn" onClick={()=>setStep("filter")}>BACK</button>
              <button className="primaryBtn" onClick={()=>setStep("booth")}>START</button>
            </div>
          </>
        )}

        {step === "booth" && (
          <>
            <div className="titleSmall">GET READY!</div>

            <div className="boothArea">

              <div className="cameraWrap">
                <video ref={videoRef} autoPlay playsInline muted className="video"/>
                {countdown && <div className="countdown">{countdown}</div>}
              </div>

              <div className="stripPreview">
                {slotsPx.map((r,i)=>(
                  <div key={i} className="previewSlot" style={slotPxToDomStyle(r)}>
                    {shots[i] && <img src={shots[i]} />}
                  </div>
                ))}
                <img className="stripOverlay" src={overlaySet.final}/>
              </div>

            </div>

            <div className="stickyBar">
              <button className="secondaryBtn" onClick={()=>setStep("frame")}>BACK</button>
              <button className="primaryBtn" onClick={takePhotos}>TAKE PHOTOS</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

