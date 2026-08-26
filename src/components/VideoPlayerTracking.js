/**
 * VideoPlayerTracking Component - Manual Click-to-Identify
 * User clicks on detected players and selects who they are from roster
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createWorker } from 'tesseract.js';
// tf and cocoSsd are loaded from CDN in public/index.html as UMD globals.
// Keeping them out of the webpack bundle prevents the multi-minute compile hang.
/* global tf, cocoSsd */

const VideoPlayerTracking = ({ 
  videoRef, 
  onPlayerClick, 
  courtPlayers, 
  isActive = false,
  match,
  onAddPoint,
  benchPlayers,
  handlePlayerDrop,
  setPlayerStats,
  playerStats,
  currentMatchId,
  setActionLog
}) => {
  const canvasRef = useRef(null);
  const [model, setModel] = useState(null);
  const [modelReady, setModelReady] = useState(false); // shows loading state in pill
  const [detections, setDetections] = useState([]);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [trackedPlayers, setTrackedPlayers] = useState({});
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [identificationComplete, setIdentificationComplete] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // 4-point court calibration — hasCalibrated gates the isOnCourt filter
  const [calibrating, setCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState([]); // up to 4 tapped corners
  const [hasCalibrated, setHasCalibrated] = useState(false);
  
  const animationFrameRef = useRef(null);
  const nextTrackIdRef = useRef(0); // Counter for assigning unique track IDs
  const previousDetectionsRef = useRef([]); // Store previous frame detections for tracking
  const ocrWorkerRef = useRef(null);       // Tesseract worker (initialized once)
  const lastOcrAttemptRef = useRef({});    // trackId → timestamp, throttles OCR per track
  // trackId → { bbox, velX, velY }
  // velX/velY = centroid displacement from the frame before last to last frame.
  // Used both for velocity-predicted matching (ID-swap prevention) and as a
  // wider-threshold fallback pool that survives pause/resume gaps.
  const lastKnownBboxRef = useRef({});
  const detectionFrameCounterRef = useRef(0);
  const DETECTION_INTERVAL = 3;
  const detectionBufferRef = useRef({});

  // Interactive court boundary controls
  const [courtBoundaries, setCourtBoundaries] = useState({
    netY: 0.30,
    baselineY: 0.85,
    netLeftX: 0.35,
    netRightX: 0.65,
    baselineLeftX: 0.02,
    baselineRightX: 0.98,
  });
  const [showCourtControls, setShowCourtControls] = useState(false);

  // Court boundary detection (trapezoid for end view) - now uses state
  const detectCourtBoundaries = (videoHeight, videoWidth) => {
    return {
      netY: videoHeight * courtBoundaries.netY,
      baselineBehindY: videoHeight * courtBoundaries.baselineY,
      netLeftX: videoWidth * courtBoundaries.netLeftX,
      netRightX: videoWidth * courtBoundaries.netRightX,
      baselineLeftX: videoWidth * courtBoundaries.baselineLeftX,
      baselineRightX: videoWidth * courtBoundaries.baselineRightX
    };
  };

  // Greedy centroid tracker — called once per frame with ALL new detections so
  // each previous slot is matched at most once (prevents duplicate IDs).
  //
  // Two-pool strategy:
  //   Primary (300px): velocity-predicted position from last frame.
  //     Projecting forward by each player's current velocity keeps them
  //     distinguishable when they cross paths — without prediction the
  //     centroids converge and the wrong one wins.
  //   Fallback (500px): last-known position with no velocity, used when a
  //     player reappears after a pause/resume gap where prediction is stale.
  // Two-pass tracker:
  //   Pass 1 — manually-identified players get first pick of the nearest detection.
  //            Prevents an unidentified bbox from stealing the slot when paths cross.
  //   Pass 2 — remaining bboxes matched to unidentified prev tracks via velocity
  //            prediction, then fall back to last-known position (wide threshold)
  //            for pause/resume re-entry.
  const assignTrackIds = (newBboxes, prevDetections, lastKnown = {}, knownPlayers = {}, threshold = 300) => {
    const usedPrev = new Set();
    const usedLast = new Set();
    const result   = new Array(newBboxes.length).fill(null);

    // Pass 1: identified tracks claim their slot first
    const identifiedPrev = prevDetections.filter(p => knownPlayers[p.trackId]);
    for (const p of identifiedPrev) {
      const entry = lastKnown[p.trackId];
      const velX = entry?.velX ?? 0;
      const velY = entry?.velY ?? 0;
      const px = p.bbox[0] + p.bbox[2] / 2 + velX;
      const py = p.bbox[1] + p.bbox[3] / 2 + velY;
      let bestIdx = -1, bestDist = Infinity;
      newBboxes.forEach((bbox, i) => {
        if (result[i] !== null) return;
        const cx = bbox[0] + bbox[2] / 2;
        const cy = bbox[1] + bbox[3] / 2;
        const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
        if (dist < threshold && dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      if (bestIdx !== -1) {
        result[bestIdx] = { bbox: newBboxes[bestIdx], trackId: p.trackId };
        usedPrev.add(p.trackId);
      }
    }

    // Pass 2: unidentified bboxes matched to remaining prev tracks
    newBboxes.forEach((bbox, i) => {
      if (result[i] !== null) return;
      const cx = bbox[0] + bbox[2] / 2;
      const cy = bbox[1] + bbox[3] / 2;
      let best = null, bestDist = Infinity;

      for (const p of prevDetections) {
        if (usedPrev.has(p.trackId)) continue;
        const entry = lastKnown[p.trackId];
        const velX = entry?.velX ?? 0;
        const velY = entry?.velY ?? 0;
        const px = p.bbox[0] + p.bbox[2] / 2 + velX;
        const py = p.bbox[1] + p.bbox[3] / 2 + velY;
        const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
        if (dist < threshold && dist < bestDist) { bestDist = dist; best = { trackId: p.trackId, pool: 'prev' }; }
      }

      if (!best) {
        for (const [tid, entry] of Object.entries(lastKnown)) {
          const trackId = Number(tid);
          if (usedPrev.has(trackId) || usedLast.has(trackId)) continue;
          const px = entry.bbox[0] + entry.bbox[2] / 2;
          const py = entry.bbox[1] + entry.bbox[3] / 2;
          const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
          if (dist < 500 && dist < bestDist) { bestDist = dist; best = { trackId, pool: 'last' }; }
        }
      }

      if (best) {
        if (best.pool === 'prev') usedPrev.add(best.trackId);
        else usedLast.add(best.trackId);
        result[i] = { bbox, trackId: best.trackId };
      } else {
        result[i] = { bbox, trackId: nextTrackIdRef.current++ };
      }
    });

    return result;
  };

  // Check if player is on court (inside trapezoid)
  const isOnCourt = (bbox, netY, baselineBehindY, netLeftX, netRightX, baselineLeftX, baselineRightX) => {
    const playerCenterY = bbox[1] + bbox[3] / 2;
    const playerCenterX = bbox[0] + bbox[2] / 2;
    
    // Must be BETWEEN net and baseline vertically
    if (playerCenterY <= netY || playerCenterY >= baselineBehindY) {
      return false;
    }
    
    // Interpolate sideline position based on Y (trapezoid shape)
    const progress = (playerCenterY - netY) / (baselineBehindY - netY);
    const leftBoundary = netLeftX + progress * (baselineLeftX - netLeftX);
    const rightBoundary = netRightX + progress * (baselineRightX - netRightX);
    
    return playerCenterX > leftBoundary && playerCenterX < rightBoundary;
  };


  // Extract the upper-chest strip from a bbox, scale it up, boost contrast,
  // then run Tesseract digit-only OCR. Returns "1" – "99" or null.
  const attemptJerseyOCR = useCallback(async (bbox, video) => {
    if (!ocrWorkerRef.current || !video) return null;
    try {
      const [x, y, w, h] = bbox;
      // Upper 45% of the box is where the number sits (chest/upper-back)
      const rx = x + w * 0.10;
      const ry = y + h * 0.10;
      const rw = w * 0.80;
      const rh = h * 0.45;

      // Scale up so digits are at least 60px tall for Tesseract
      const scale = Math.max(1, Math.ceil(60 / rh));
      const tmp = document.createElement('canvas');
      tmp.width  = Math.round(rw * scale);
      tmp.height = Math.round(rh * scale);
      const ctx = tmp.getContext('2d');

      // Draw the video region with contrast boost
      ctx.filter = 'grayscale(1) contrast(3) brightness(1.4)';
      ctx.drawImage(video, rx, ry, rw, rh, 0, 0, tmp.width, tmp.height);

      const { data: { text, confidence } } = await ocrWorkerRef.current.recognize(tmp);
      const digits = text.trim().replace(/\D/g, '');
      if (confidence < 40 || digits.length === 0 || digits.length > 2) return null;
      return digits;
    } catch {
      return null;
    }
  }, []);

  // Load COCO-SSD — best choice for broadcast volleyball where players are small
  // in a wide frame (2000px+). MoveNet downsamples to 192px and loses small players;
  // COCO-SSD runs SSD at 300px and reliably finds people at broadcast scale.
  useEffect(() => {
    if (!isActive) return;

    const loadModels = async () => {
      try {
        console.log('🤖 Waiting for TF.js CDN scripts...');

        // Poll until the CDN globals are available (injected dynamically in index.html)
        await new Promise((resolve, reject) => {
          const start = Date.now();
          const check = () => {
            if (window.tf && window.cocoSsd) return resolve();
            if (Date.now() - start > 30000) return reject(new Error('TF.js CDN timed out after 30s'));
            setTimeout(check, 200);
          };
          check();
        });

        console.log('✅ TF.js CDN globals ready');

        // WebGL backend for GPU acceleration
        try {
          await window.tf.setBackend('webgl');
          await window.tf.ready();
          console.log('✅ WebGL backend');
        } catch {
          await window.tf.setBackend('cpu');
          await window.tf.ready();
          console.log('⚠️ CPU backend (slower)');
        }

        // mobilenet_v2 balances speed and accuracy for broadcast player detection
        const detector = await window.cocoSsd.load({ base: 'mobilenet_v2' });
        setModel(detector);
        setModelReady(true);
        console.log('✅ COCO-SSD loaded');

        // Tesseract: digit-only worker for jersey number OCR
        try {
          const worker = await createWorker('eng', 1, { logger: () => {} });
          await worker.setParameters({
            tessedit_char_whitelist: '0123456789',
            tessedit_pageseg_mode: '7', // single text line
          });
          ocrWorkerRef.current = worker;
          console.log('✅ Tesseract OCR ready (jersey numbers)');
        } catch (err) {
          console.warn('⚠️ Tesseract failed to load — jersey OCR disabled:', err.message);
        }

      } catch (error) {
        console.error('❌ Error loading COCO-SSD:', error);
      }
    };

    loadModels();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive]);

  // Detect players and ball
  const detectPlayers = useCallback(async () => {
    if (!model || !videoRef.current || !canvasRef.current || !isActive) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Log video state every ~1 second (throttled)
    if (Math.random() < 0.033) { // ~1/30 frames at 30fps
      console.log(`📹 Video state: ${video.paused ? 'PAUSED' : 'PLAYING'} | Time: ${video.currentTime.toFixed(1)}s | Ready: ${video.readyState}/4 | Size: ${video.videoWidth}x${video.videoHeight}`);
    }

    if (video.ended) {
      animationFrameRef.current = requestAnimationFrame(detectPlayers);
      return;
    }

    // Validate video is ready
    if (video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectPlayers);
      return;
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      animationFrameRef.current = requestAnimationFrame(detectPlayers);
      return;
    }

    // Run COCO-SSD every Nth frame to stay within GPU budget
    detectionFrameCounterRef.current++;
    if (detectionFrameCounterRef.current % DETECTION_INTERVAL !== 0) {
      animationFrameRef.current = requestAnimationFrame(detectPlayers);
      return;
    }

    try {
      // COCO-SSD detect — returns [{bbox:[x,y,w,h], class, score}]
      // Low minScore (0.15) — players in broadcast footage score lower because they're small
      const predictions = await model.detect(video, 20, 0.15);
      const people = predictions.filter(p => p.class === 'person');

      const frameWidth  = video.videoWidth;
      const frameHeight = video.videoHeight;
      const frameArea   = frameWidth * frameHeight;

      const { netY, baselineBehindY, netLeftX, netRightX, baselineLeftX, baselineRightX } =
        detectCourtBoundaries(frameHeight, frameWidth);

      // Log every 30 frames (not random) so diagnosis is reliable
      const shouldLog = detectionFrameCounterRef.current % 90 === 0;
      if (shouldLog) {
        console.log(`👥 COCO-SSD raw: ${predictions.length} objects total`);
        console.log(`   people (${people.length}): ${people.map(p => `score=${p.score.toFixed(2)} bbox=[${p.bbox.map(v=>Math.round(v)).join(',')}]`).join(' | ')}`);
        if (hasCalibrated) {
          console.log(`   court zone: Y ${Math.round(netY)}–${Math.round(baselineBehindY)}px, X ${Math.round(netLeftX)}–${Math.round(netRightX)}px@net / ${Math.round(baselineLeftX)}–${Math.round(baselineRightX)}px@baseline`);
        }
      }

      const prev = previousDetectionsRef.current;

      // Filter — remove crowd rows, noise, and (if calibrated) off-court detections
      const validPeople = people
        .map(p => {
          const bbox = p.bbox;          // [x, y, w, h] in video pixel coords
          const [, , w, h] = bbox;
          const areaRatio = (w * h) / frameArea;
          // Reject truly tiny noise
          if (areaRatio < 0.0005) return null;
          // Reject anything too large (full crowd row, referee table, etc.)
          if (areaRatio > 0.35) return null;
          // Reject wide-aspect-ratio blobs: real people are taller than they are wide
          if (w > h * 2.0) return null;
          // Reject anything wider than 15% of the frame (eliminates crowd-row detections)
          if (w > frameWidth * 0.15) return null;
          // Court filter — only if user has calibrated
          if (hasCalibrated && !isOnCourt(bbox, netY, baselineBehindY, netLeftX, netRightX, baselineLeftX, baselineRightX)) return null;
          return { bbox, score: p.score };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const yDiff = b.bbox[1] - a.bbox[1]; // back-row first
          if (Math.abs(yDiff) > 50) return yDiff;
          return a.bbox[0] - b.bbox[0];
        })
        .slice(0, 6);

      // Assign persistent IDs via greedy centroid matching.
      // Pass lastKnownBboxRef so identities survive pause/resume gaps.
      const assigned = assignTrackIds(validPeople.map(p => p.bbox), prev, lastKnownBboxRef.current, trackedPlayers);
      const trackedDetections = validPeople.map((p, i) => ({
        ...p,
        trackId: assigned[i].trackId,
        size: p.bbox[2] * p.bbox[3],
      }));

      // Persist each player's position and velocity so the next frame can
      // predict where they'll be (reduces ID swaps when players cross).
      trackedDetections.forEach(d => {
        const prev = lastKnownBboxRef.current[d.trackId];
        const cx = d.bbox[0] + d.bbox[2] / 2;
        const cy = d.bbox[1] + d.bbox[3] / 2;
        const prevCx = prev ? (prev.bbox[0] + prev.bbox[2] / 2) : cx;
        const prevCy = prev ? (prev.bbox[1] + prev.bbox[3] / 2) : cy;
        lastKnownBboxRef.current[d.trackId] = {
          bbox: d.bbox,
          velX: cx - prevCx,   // centroid displacement from previous detection frame
          velY: cy - prevCy,
        };
      });
      previousDetectionsRef.current = trackedDetections;

      // Fire-and-forget OCR for each unidentified detection (throttled to once per 3s per track).
      // Runs async so it never blocks the detection loop.
      if (ocrWorkerRef.current) {
        const allRosterPlayers = [...(courtPlayers || []), ...(benchPlayers || [])];
        const now = Date.now();
        trackedDetections.forEach(d => {
          if (trackedPlayers[d.trackId]?.playerNumber) return; // already named
          const last = lastOcrAttemptRef.current[d.trackId] || 0;
          if (now - last < 3000) return; // throttle
          lastOcrAttemptRef.current[d.trackId] = now;
          attemptJerseyOCR(d.bbox, video).then(number => {
            if (!number) return;
            const match = allRosterPlayers.find(p => String(p.number) === number);
            if (!match) return;
            console.log(`🔢 OCR auto-identified trackId ${d.trackId} as #${match.number} ${match.name}`);
            setTrackedPlayers(prev => {
              if (prev[d.trackId]?.playerNumber) return prev; // user already assigned it
              const next = { ...prev };
              // Clear any other trackId that already claims this number
              for (const [tid, info] of Object.entries(next)) {
                if (info.playerNumber === match.number && Number(tid) !== d.trackId) delete next[tid];
              }
              next[d.trackId] = {
                playerNumber: match.number,
                playerName: match.name,
                lastSeen: Date.now(),
                confidence: 'ocr',
              };
              return next;
            });
          });
        });
      }

      if (shouldLog) {
        console.log(`   → after filters: ${trackedDetections.length} on court | IDs: [${trackedDetections.map(p => p.trackId).join(', ')}]`);
      }

      setDetections(trackedDetections);
      drawBoundingBoxes(trackedDetections, canvas, video);

      // Auto-pause when players are found and not yet all identified,
      // so the user has time to click the boxes.
      // Auto-resume when the selector is closed (handled in handlePlayerSelect).
      const unidentifiedCount = trackedDetections.filter(
        d => !trackedPlayers[d.trackId]?.playerNumber
      ).length;
      if (trackedDetections.length > 0 && unidentifiedCount > 0 && !video.paused) {
        video.pause();
        setIsPaused(true);
      }

    } catch (error) {
      console.error('Detection error:', error);
    }

    animationFrameRef.current = requestAnimationFrame(detectPlayers);
  }, [model, isActive, videoRef, hoveredIndex, trackedPlayers, courtBoundaries, identificationComplete, hasCalibrated]);

  // Mark identification complete when all 6 are assigned
  useEffect(() => {
    const count = Object.keys(trackedPlayers).length;
    if (count >= 6 && !identificationComplete) {
      setIdentificationComplete(true);
    }
  }, [trackedPlayers, identificationComplete]);

  // Draw bounding boxes and court boundaries.
  // The video element uses object-fit:cover, meaning the video is scaled uniformly
  // to FILL the container — the excess is cropped. We must use a single coverScale
  // (not separate scaleX/scaleY) so bboxes land on top of the actual pixels.
  const drawBoundingBoxes = (people, canvas, video) => {
    const ctx = canvas.getContext('2d');
    canvas.width = video.offsetWidth;
    canvas.height = video.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Green border when AI is active
    ctx.strokeStyle = '#0F0';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    // object-fit:cover transform:
    //   coverScale = the single scale factor that fills the canvas (larger of the two axes)
    //   ox / oy    = canvas-pixel offset of the video's top-left corner (negative = cropped)
    const coverScale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const ox = (canvas.width  - video.videoWidth  * coverScale) / 2;
    const oy = (canvas.height - video.videoHeight * coverScale) / 2;
    // Helpers: video pixel → canvas pixel
    const vcx = vx => vx * coverScale + ox;
    const vcy = vy => vy * coverScale + oy;

    // Draw court boundaries
    const { netY, baselineBehindY, netLeftX, netRightX, baselineLeftX, baselineRightX } =
      detectCourtBoundaries(video.videoHeight, video.videoWidth);

    // Net (yellow)
    ctx.strokeStyle = '#FF0';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(0, vcy(netY));
    ctx.lineTo(canvas.width, vcy(netY));
    ctx.stroke();
    ctx.fillStyle = '#FF0';
    ctx.font = '12px monospace';
    ctx.fillText('NET', 10, vcy(netY) + 15);

    // Baseline (red)
    ctx.strokeStyle = '#F00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, vcy(baselineBehindY));
    ctx.lineTo(canvas.width, vcy(baselineBehindY));
    ctx.stroke();
    ctx.fillStyle = '#F00';
    ctx.fillText('BASELINE', 10, vcy(baselineBehindY) - 5);

    // Left sideline (cyan trapezoid)
    ctx.strokeStyle = '#0FF';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(vcx(netLeftX),      vcy(netY));
    ctx.lineTo(vcx(baselineLeftX), vcy(baselineBehindY));
    ctx.stroke();

    // Right sideline (cyan trapezoid)
    ctx.beginPath();
    ctx.moveTo(vcx(netRightX),      vcy(netY));
    ctx.lineTo(vcx(baselineRightX), vcy(baselineBehindY));
    ctx.stroke();

    ctx.setLineDash([]);

    // Debug info
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(5, 5, 280, 50);
    ctx.fillStyle = '#0F0';
    ctx.font = '12px monospace';
    ctx.fillText(`Video: ${video.videoWidth}x${video.videoHeight}`, 10, 20);
    ctx.fillText(`Detections: ${people.length} players`, 10, 35);
    ctx.fillText(`Time: ${video.currentTime.toFixed(1)}s`, 10, 50);

    // Draw player boxes
    people.forEach((person) => {
      const [x, y, width, height] = person.bbox;
      const sx = vcx(x);
      const sy = vcy(y);
      const sw = width  * coverScale;
      const sh = height * coverScale;

      const trackId = person.trackId;
      const playerInfo = trackedPlayers[trackId];
      const isIdentified = playerInfo && playerInfo.playerNumber;
      const isHovered = hoveredIndex === trackId;

      // Green if identified, gold if not, brighter on hover
      const color = isIdentified ? '#4CD964' : (isHovered ? '#FFD700' : 'rgba(255,215,0,0.6)');
      ctx.strokeStyle = color;
      ctx.lineWidth = isHovered ? 4 : 2;
      ctx.strokeRect(sx, sy, sw, sh);

      if (isIdentified) {
        ctx.fillStyle = '#4CD964';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`#${playerInfo.playerNumber}`, sx + 4, sy + 22);
        if (playerInfo.playerName) {
          ctx.font = 'bold 13px Arial';
          ctx.fillText(playerInfo.playerName.split(' ')[0], sx + 4, sy + 38);
        }
      } else {
        // "?" label + "tap to ID" hint on hover
        ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.45)';
        ctx.fillRect(sx, sy, 28, 26);
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('?', sx + 8, sy + 18);
        if (isHovered) {
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.fillRect(sx, sy - 28, 130, 24);
          ctx.fillStyle = '#FFF';
          ctx.font = 'bold 13px Arial';
          ctx.fillText('Click to identify', sx + 4, sy - 10);
        }
      }
    });
  };

  // Handle canvas click — any unidentified box is clickable at any time.
  // Converts the canvas click back to video-pixel coords using the cover transform,
  // then tests against bboxes (which are in video-pixel coords).
  const handleCanvasClick = (e) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video  = videoRef.current;
    const rect   = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Reverse the object-fit:cover transform to get video-pixel coords
    const coverScale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const ox = (canvas.width  - video.videoWidth  * coverScale) / 2;
    const oy = (canvas.height - video.videoHeight * coverScale) / 2;
    const vx = (cx - ox) / coverScale;
    const vy = (cy - oy) / coverScale;

    for (const person of detections) {
      const [x, y, w, h] = person.bbox;
      if (vx >= x && vx <= x + w && vy >= y && vy <= y + h) {
        console.log(`👆 Clicked player trackId=${person.trackId}`);
        setSelectedTrackId(person.trackId);
        setShowPlayerSelector(true);
        return;
      }
    }
  };

  // Handle canvas hover — highlight whichever box the cursor is over.
  // Uses the same cover transform as handleCanvasClick.
  const handleCanvasMove = (e) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video  = videoRef.current;
    const rect   = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const coverScale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const ox = (canvas.width  - video.videoWidth  * coverScale) / 2;
    const oy = (canvas.height - video.videoHeight * coverScale) / 2;
    const vx = (cx - ox) / coverScale;
    const vy = (cy - oy) / coverScale;

    for (const person of detections) {
      const [x, y, w, h] = person.bbox;
      if (vx >= x && vx <= x + w && vy >= y && vy <= y + h) {
        setHoveredIndex(person.trackId);
        return;
      }
    }
    setHoveredIndex(null);
  };

  // 4-point court calibration tap handler
  const handleCalibClick = (e) => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    const rect   = canvas.getBoundingClientRect();
    // Map canvas CSS coords → video pixel coords (reverse object-fit:cover transform)
    const coverScale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const ox = (canvas.width  - video.videoWidth  * coverScale) / 2;
    const oy = (canvas.height - video.videoHeight * coverScale) / 2;
    const px = (e.clientX - rect.left - ox) / coverScale;
    const py = (e.clientY - rect.top  - oy) / coverScale;

    const next = [...calibPoints, { x: px, y: py }];
    setCalibPoints(next);

    if (next.length === 4) {
      // Sort points: top-left, top-right, bottom-right, bottom-left by Y then X
      const sorted = [...next].sort((a, b) => a.y - b.y);
      const top    = sorted.slice(0, 2).sort((a, b) => a.x - b.x); // [TL, TR]
      const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x); // [BL, BR]
      const [TL, TR, BL, BR] = [top[0], top[1], bottom[0], bottom[1]];

      setCourtBoundaries({
        netY:          TL.y / video.videoHeight,
        baselineY:     BL.y / video.videoHeight,
        netLeftX:      TL.x / video.videoWidth,
        netRightX:     TR.x / video.videoWidth,
        baselineLeftX: BL.x / video.videoWidth,
        baselineRightX:BR.x / video.videoWidth,
      });
      setCalibrating(false);
      setCalibPoints([]);
      setHasCalibrated(true);
      console.log('✅ Court calibrated from 4 tapped corners');
    }
  };

  // Handle player selection from roster
  const handlePlayerSelect = async (player) => {
    if (selectedTrackId === null) return;

    console.log(`✅ User identified trackId ${selectedTrackId} as #${player.number} ${player.name}`);

    setTrackedPlayers(prev => {
      const next = { ...prev };
      // Remove any other trackId already claiming this player number (prevents duplicates)
      for (const [tid, info] of Object.entries(next)) {
        if (info.playerNumber === player.number && Number(tid) !== selectedTrackId) {
          delete next[tid];
        }
      }
      next[selectedTrackId] = {
        playerNumber: player.number,
        playerName: player.name,
        lastSeen: Date.now(),
        confidence: 'manual',
      };
      return next;
    });

    // If not already on court, add them
    const alreadyOnCourt = courtPlayers?.some(p => p && p.number === player.number);
    if (!alreadyOnCourt) {
      try {
        await handlePlayerDrop(player, null);
      } catch (err) {
        console.warn('Could not add player to court:', err);
      }
    }

    setShowPlayerSelector(false);
    setSelectedTrackId(null);

    // Resume once this identification is saved — the detection loop will re-pause
    // if there are still unidentified players, so the cycle continues naturally.
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPaused(false);
    }
  };

  // Start detection when model loads
  useEffect(() => {
    if (model && isActive) {
      console.log('🎬 Starting detection loop... AI is now active!');
      detectPlayers();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        console.log('🛑 Detection loop stopped');
      }
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate();
        ocrWorkerRef.current = null;
      }
    };
  }, [model, isActive, detectPlayers]);

  return (
    <>
      {/* Player Selection Modal */}
      {showPlayerSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          {(() => {
            // Exclude players already tagged on OTHER boxes — the current box's own
            // assignment is kept available so the user can reassign it to someone new.
            const isReassignment = !!(trackedPlayers[selectedTrackId]);
            const taggedNums = new Set(
              Object.entries(trackedPlayers)
                .filter(([tid]) => Number(tid) !== selectedTrackId)
                .map(([, t]) => t.playerNumber)
            );

            // On-court players — during reassignment show ALL (tagged or not),
            // since picking one clears its old box assignment automatically.
            const courtOptions = (courtPlayers || [])
              .filter(p => p && p.name && p.name !== '?' && p.number && p.number !== '?'
                           && (isReassignment || !taggedNums.has(p.number)));

            // Empty slots gate bench selection — same logic as VolleyballCourt's hasEmptyCourtSlots
            const hasOpenSlots = (courtPlayers || []).some(
              p => !p || p.name === '?' || p.number === '?' || p.number == null
            );

            // Bench players (not yet on court, not yet AI-tagged) — selectable only when there's room
            const benchOptions = hasOpenSlots
              ? (benchPlayers || []).filter(p => !taggedNums.has(p.number))
              : [];

            // Plain render functions (not React components) so React doesn't
            // unmount/remount buttons on each state update — that was the shimmer.
            const renderBtn = (player, tint) => {
              const bg  = tint ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.1)';
              const bdr = tint ? 'rgba(0,122,255,0.45)' : 'rgba(255,255,255,0.3)';
              return (
                <button
                  key={player.id || player.number}
                  onClick={() => handlePlayerSelect(player)}
                  style={{ borderRadius: 12, padding: 16, color: '#FFF', cursor: 'pointer',
                           textAlign: 'center', border: `2px solid ${bdr}`, backgroundColor: bg }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(76,217,100,0.3)'; e.currentTarget.style.borderColor = '#4CD964'; }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = bg; e.currentTarget.style.borderColor = bdr; }}
                >
                  <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 6 }}>#{player.number}</div>
                  <div style={{ fontSize: 13 }}>{player.name}</div>
                </button>
              );
            };
            const label = txt => <div style={{ color: '#8E8E93', fontSize: 11, fontWeight: 700, letterSpacing: 1.2, marginBottom: 10 }}>{txt}</div>;
            const grid  = items => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>{items}</div>;

            return (
              <div style={{ backgroundColor: '#1C1C1E', borderRadius: 16, padding: 28, maxWidth: 600, maxHeight: '80vh', overflowY: 'auto' }}>
                <h2 style={{ color: '#FFF', marginBottom: 20 }}>
                  {isReassignment
                    ? `🔄 Reassign #${trackedPlayers[selectedTrackId].playerNumber} (${trackedPlayers[selectedTrackId].playerName?.split(' ')[0]})?`
                    : '👆 Who is this player?'}
                </h2>

                {courtOptions.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    {label('ON COURT')}
                    {grid(courtOptions.map(p => renderBtn(p, true)))}
                  </div>
                )}

                {benchOptions.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    {label('BENCH — FILL OPEN SLOT')}
                    {grid(benchOptions.map(p => renderBtn(p, false)))}
                  </div>
                )}

                {courtOptions.length === 0 && benchOptions.length === 0 && (
                  <p style={{ color: '#8E8E93', textAlign: 'center', margin: '20px 0' }}>All players identified.</p>
                )}

                {!hasOpenSlots && benchOptions.length === 0 && courtOptions.length > 0 && (
                  <p style={{ color: '#FF9500', fontSize: 12, marginTop: 8 }}>Court is full — bench players unavailable.</p>
                )}

                <button
                  onClick={() => { setShowPlayerSelector(false); setSelectedTrackId(null); }}
                  style={{ marginTop: 16, width: '100%', padding: 14, backgroundColor: '#FF3B30', color: '#FFF', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Court Boundary Controls */}
      {showCourtControls && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          color: '#FFF',
          padding: '15px',
          borderRadius: '12px',
          fontSize: '12px',
          zIndex: 150,
          minWidth: '280px',
          maxWidth: '320px',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🎯 Adjust Court Boundaries</span>
            <button 
              onClick={() => setShowCourtControls(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFF',
                cursor: 'pointer',
                fontSize: '18px'
              }}
            >×</button>
          </div>

          {/* Net Height */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span>Net (Top ↕️): {Math.round(courtBoundaries.netY * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={courtBoundaries.netY * 100}
              onChange={(e) => setCourtBoundaries(prev => ({ ...prev, netY: e.target.value / 100 }))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Baseline Height */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span>Baseline (Bottom ↕️): {Math.round(courtBoundaries.baselineY * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={courtBoundaries.baselineY * 100}
              onChange={(e) => setCourtBoundaries(prev => ({ ...prev, baselineY: e.target.value / 100 }))}
              style={{ width: '100%' }}
            />
          </div>

          <hr style={{ margin: '10px 0', opacity: 0.3 }} />

          {/* Net Left Sideline */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span>Net Left ←: {Math.round(courtBoundaries.netLeftX * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={courtBoundaries.netLeftX * 100}
              onChange={(e) => setCourtBoundaries(prev => ({ ...prev, netLeftX: e.target.value / 100 }))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Net Right Sideline */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span>Net Right →: {Math.round(courtBoundaries.netRightX * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={courtBoundaries.netRightX * 100}
              onChange={(e) => setCourtBoundaries(prev => ({ ...prev, netRightX: e.target.value / 100 }))}
              style={{ width: '100%' }}
            />
          </div>

          <hr style={{ margin: '10px 0', opacity: 0.3 }} />

          {/* Baseline Left Sideline */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span>Baseline Left ←: {Math.round(courtBoundaries.baselineLeftX * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={courtBoundaries.baselineLeftX * 100}
              onChange={(e) => setCourtBoundaries(prev => ({ ...prev, baselineLeftX: e.target.value / 100 }))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Baseline Right Sideline */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span>Baseline Right →: {Math.round(courtBoundaries.baselineRightX * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={courtBoundaries.baselineRightX * 100}
              onChange={(e) => setCourtBoundaries(prev => ({ ...prev, baselineRightX: e.target.value / 100 }))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Reset Button */}
          <button
            onClick={() => setCourtBoundaries({
              netY: 0.30,
              baselineY: 0.85,
              netLeftX: 0.35,
              netRightX: 0.65,
              baselineLeftX: 0.02,
              baselineRightX: 0.98
            })}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#FF9500',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginTop: '5px'
            }}
          >
            🔄 Reset to Default
          </button>

        </div>
      )}

      {/* Show Court Controls Button (when hidden) */}
      {!showCourtControls && (
        <button
          onClick={() => setShowCourtControls(true)}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            padding: '12px 18px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            border: '2px solid #FFD700',
            borderRadius: '10px',
            color: '#FFF',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 150
          }}
        >
          🎯 Court Settings
        </button>
      )}

      {/* Status pill — top-right */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: '#FFF', padding: '4px 10px', borderRadius: 20,
        fontSize: 12, fontWeight: 600, zIndex: 100, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {!modelReady ? (
          <span style={{ color: '#FFD700' }}>⏳ Loading AI…</span>
        ) : identificationComplete ? (
          <span style={{ color: '#4CD964' }}>✅ {Object.keys(trackedPlayers).length}/6</span>
        ) : (
          <span>
            🤖 {Object.keys(trackedPlayers).length}/6
            {detections.length > 0
              ? <span style={{ opacity: 0.7, marginLeft: 4 }}>· {detections.length} detected · click a box</span>
              : <span style={{ color: '#FF9500', marginLeft: 4 }}>· no one detected — check console</span>}
          </span>
        )}
      </div>

      {/* Play / Pause — bottom-right */}
      <button
        onClick={() => {
          if (!videoRef.current) return;
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
            setIsPaused(false);
          } else {
            videoRef.current.pause();
            setIsPaused(true);
          }
        }}
        style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 110,
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(0,0,0,0.7)', border: '2px solid #FFF',
          color: '#FFF', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {isPaused ? '▶' : '⏸'}
      </button>

      {/* Calibrate court button — bottom-left */}
      <button
        onClick={() => { setCalibrating(true); setCalibPoints([]); }}
        style={{
          position: 'absolute', bottom: 10, left: 10, zIndex: 110,
          background: calibrating ? '#FF9500' : (hasCalibrated ? 'rgba(0,0,0,0.6)' : '#FF9500'),
          color: '#FFF', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {calibrating
          ? `Tap court corners (${calibPoints.length}/4)`
          : hasCalibrated ? '🎯 Re-calibrate' : '⚠️ Tap 4 court corners to filter'}
      </button>

      <canvas
        ref={canvasRef}
        onClick={calibrating ? handleCalibClick : handleCanvasClick}
        onMouseMove={handleCanvasMove}
        onMouseLeave={() => setHoveredIndex(null)}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: isActive ? 'auto' : 'none',
          cursor: calibrating ? 'crosshair' : (hoveredIndex !== null ? 'pointer' : 'default'),
          zIndex: 2,
        }}
      />

    </>
  );
};

export default VideoPlayerTracking;
