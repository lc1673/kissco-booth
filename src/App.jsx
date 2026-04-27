import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const videoRef = useRef(null);

  const [screen, setScreen] = useState("home");
  const [selectedFrame, setSelectedFrame] = useState("square");
  const [selectedFilter, setSelectedFilter] = useState("color");
  const [photos, setPhotos] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [isTakingPhotos, setIsTakingPhotos] = useState(false);

  const TOTAL_PHOTOS = 3;

  const stripImages = {
    squarePreview: "/5sos-square-preview.png",
    starPreview: "/5sos-star-preview.png",
    squareFinal: "/5sos-square.png",
    starFinal: "/5sos-star.png",
  };

  // Same square photo slots used for BOTH square + star strips
  const photoSlots = [
    { x: 60, y: 60, w: 480, h: 444 },
    { x: 60, y: 536, w: 480, h: 444 },
    { x: 60, y: 1009, w: 480, h: 444 },
  ];

  useEffect(() => {
    if (screen === "booth") {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [screen]);

  const getStripImage = (type, mode) => {
    if (mode === "preview") {
      return type === "star"
        ? stripImages.starPreview
        : stripImages.squarePreview;
    }

    return type === "star" ? stripImages.starFinal : stripImages.squareFinal;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      alert("Camera access is needed to use the booth.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startBooth = async () => {
    if (!videoRef.current) return;

    setPhotos([]);
    setIsTakingPhotos(true);

    const capturedPhotos = [];

    for (let i = 0; i < TOTAL_PHOTOS; i++) {
      for (let count = 3; count > 0; count--) {
        setCountdown(count);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      setCountdown("★");
      await new Promise((resolve) => setTimeout(resolve, 450));

      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.translate(canvas.width, 0);
      context.scale(-1, 1);

      context.filter = selectedFilter === "bw" ? "grayscale(100%)" : "none";
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      context.filter = "none";

      const photoData = canvas.toDataURL("image/png");

      capturedPhotos.push(photoData);
      setPhotos([...capturedPhotos]);

      await new Promise((resolve) => setTimeout(resolve, 650));
    }

    setCountdown(null);
    setIsTakingPhotos(false);
    stopCamera();
    setScreen("final");
  };

  const goHome = () => {
    stopCamera();
    setPhotos([]);
    setCountdown(null);
    setIsTakingPhotos(false);
    setScreen("home");
  };

  const retakePhotos = () => {
    setPhotos([]);
    setCountdown(null);
    setIsTakingPhotos(false);
    setScreen("booth");
  };

  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  };

  const drawCoverImage = (context, image, x, y, w, h) => {
    const imageRatio = image.width / image.height;
    const slotRatio = w / h;

    let sx;
    let sy;
    let sw;
    let sh;

    if (imageRatio > slotRatio) {
      sh = image.height;
      sw = image.height * slotRatio;
      sx = (image.width - sw) / 2;
      sy = 0;
    } else {
      sw = image.width;
      sh = image.width / slotRatio;
      sx = 0;
      sy = (image.height - sh) / 2;
    }

    context.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  };

  const createFinalStripImage = async () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 600;
    canvas.height = 1800;

    context.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < photos.length; i++) {
      const photoImage = await loadImage(photos[i]);
      const slot = photoSlots[i];

      context.save();

      if (selectedFilter === "bw") {
        context.filter = "grayscale(100%)";
      }

      drawCoverImage(context, photoImage, slot.x, slot.y, slot.w, slot.h);
      context.restore();
    }

    const finalFrameImage = await loadImage(
      getStripImage(selectedFrame, "final")
    );

    context.drawImage(finalFrameImage, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/png");
    });
  };

  const shareFinalStrip = async () => {
    try {
      const blob = await createFinalStripImage();

      const file = new File([blob], "5sos-photo-strip.png", {
        type: "image/png",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "5SOS Photo Booth",
          text: "My 5SOS photo strip!",
          files: [file],
        });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "5sos-photo-strip.png";
        link.click();
      }
    } catch (error) {
      console.error("Share failed:", error);
      alert("Could not share the strip. Try again.");
    }
  };

  const renderStars = () => (
    <div className="star-bg">
      {Array.from({ length: 28 }).map((_, index) => (
        <span key={index}>★</span>
      ))}
    </div>
  );

  const renderStrip = (type, mode = "preview") => {
    const stripSrc = getStripImage(type, mode);
    const shouldShowPhotos = mode === "booth" || mode === "final";

    if (mode === "preview") {
      return (
        <div className={`strip strip-${type} preview`}>
          <img
            src={stripSrc}
            alt={`${type} strip preview`}
            className="strip-design-image preview-only"
          />
        </div>
      );
    }

    return (
      <div className={`strip strip-${type} ${mode}`}>
        <div className="strip-photo-layer">
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className={`design-photo-window ${type} slot-${slot + 1}`}
            >
              {shouldShowPhotos && photos[slot] ? (
                <img
                  src={photos[slot]}
                  alt={`Photo ${slot + 1}`}
                  className={selectedFilter === "bw" ? "strip-photo-bw" : ""}
                />
              ) : (
                <div className="design-placeholder">{slot + 1}</div>
              )}
            </div>
          ))}
        </div>

        <img
          src={stripSrc}
          alt={`${type} strip design`}
          className="strip-design-image"
        />
      </div>
    );
  };

  return (
    <div className="app">
      {renderStars()}

      {screen === "home" && (
        <main className="home-screen">
          <section className="hero-card">
            <p className="eyebrow">5SOS PHOTO BOOTH</p>

            <h1>Everyone’s a Star in the 5SOS Booth</h1>

            <p className="subtitle">
              Pick your photo style, choose your strip, and capture your own
              5SOS-inspired star moment.
            </p>

            <div className="selected-row">
              <div>
                <span>Photo Filter</span>
                <strong>{selectedFilter === "bw" ? "B&W" : "Color"}</strong>
              </div>

              <div>
                <span>Strip Design</span>
                <strong>
                  {selectedFrame === "star" ? "Star Strip" : "Square Strip"}
                </strong>
              </div>
            </div>

            <div className="section-box">
              <h2>Pick photo style</h2>

              <div className="filter-row">
                <button
                  type="button"
                  className={selectedFilter === "color" ? "active" : ""}
                  onClick={() => setSelectedFilter("color")}
                >
                  Color
                </button>

                <button
                  type="button"
                  className={selectedFilter === "bw" ? "active" : ""}
                  onClick={() => setSelectedFilter("bw")}
                >
                  B&W
                </button>
              </div>
            </div>

            <div className="section-box">
              <h2>Pick your strip design</h2>

              <div className="strip-grid">
                <button
                  type="button"
                  className={`strip-card ${
                    selectedFrame === "square" ? "active" : ""
                  }`}
                  onClick={() => setSelectedFrame("square")}
                >
                  {selectedFrame === "square" && (
                    <span className="badge">Selected</span>
                  )}

                  {renderStrip("square", "preview")}

                  <strong>□ Square Strip</strong>
                </button>

                <button
                  type="button"
                  className={`strip-card ${
                    selectedFrame === "star" ? "active" : ""
                  }`}
                  onClick={() => setSelectedFrame("star")}
                >
                  {selectedFrame === "star" && (
                    <span className="badge">Selected</span>
                  )}

                  {renderStrip("star", "preview")}

                  <strong>★ Star Strip</strong>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="start-button"
              onClick={() => setScreen("booth")}
            >
              Start My Star Strip
            </button>
          </section>
        </main>
      )}

      {screen === "booth" && (
        <main className="booth-screen">
          <div className="top-bar">
            <button type="button" onClick={goHome}>
              ← Back
            </button>

            <p>
              {selectedFilter === "bw" ? "B&W" : "Color"} +{" "}
              {selectedFrame === "star" ? "Star Strip" : "Square Strip"}
            </p>
          </div>

          <section className="booth-grid">
            <div className="camera-card">
              <div className="camera-frame">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={selectedFilter === "bw" ? "bw-video" : ""}
                />

                {countdown && <div className="countdown">{countdown}</div>}
              </div>

              <button
                type="button"
                className="capture-button"
                onClick={startBooth}
                disabled={isTakingPhotos}
              >
                {isTakingPhotos ? "Taking Photos..." : "Take 3 Photos"}
              </button>
            </div>

            <div className="live-strip">
              {renderStrip(selectedFrame, "booth")}
            </div>
          </section>
        </main>
      )}

      {screen === "final" && (
        <main className="final-screen">
          <section className="hero-card final-card">
            <p className="eyebrow">YOUR 5SOS STRIP</p>

            <h1>Final Booth Strip</h1>

            <p className="subtitle">
              Here’s your finished {selectedFilter === "bw" ? "B&W" : "color"}{" "}
              {selectedFrame === "star" ? "star" : "square"} strip.
            </p>

            <div className="final-strip">
              {renderStrip(selectedFrame, "final")}
            </div>

            <div className="final-actions">
              <button type="button" onClick={retakePhotos}>
                Retake
              </button>

              <button type="button" onClick={shareFinalStrip}>
                Share / Download
              </button>

              <button type="button" onClick={goHome}>
                New Strip
              </button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;