/**
 * VideoPlayerTracking Component - Manual Click-to-Identify
 * User clicks on detected players and selects who they are from roster
 */

import React, { useState, useRef, useEffect, useCallback } from "react";

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
  const [tesseractWorker, setTesseractWorker] = useState(null);
  const [detections, setDetections] = useState([]);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [trackedPlayers, setTrackedPlayers] = useState({}); // Map trackId to {playerNumber, playerName, lastSeen, confidence}
  const [selectedTrackId, setSelectedTrackId] = useState(null); // Which player user clicked
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0); // Which player to identify next (0-5)
  const [identificationComplete, setIdentificationComplete] = useState(false);
  const [ocrAttempts, setOcrAttempts] = useState({}); // Track OCR attempts per trackId
  const [timeoutCountdown, setTimeoutCountdown] = useState(null); // Countdown display (10, 9, 8...)
  const [showTimeoutModal, setShowTimeoutModal] = useState(false); // Show manual entry modal
  const [showBatchIdentifyModal, setShowBatchIdentifyModal] = useState(false); // Show all 6 players at once
  const [batchPlayers, setBatchPlayers] = useState([]); // Array of {trackId, bbox, image, ocrGuess}
  const [manualJerseyNumber, setManualJerseyNumber] = useState(''); // User's manual entry
  const [lockedTrackId, setLockedTrackId] = useState(null); // Store trackId when pausing
  const [lockedBboxImage, setLockedBboxImage] = useState(null); // Screenshot of bbox area
  const [playerScreenshot, setPlayerScreenshot] = useState(null); // Screenshot of locked player
  
  const animationFrameRef = useRef(null);
  const nextTrackIdRef = useRef(0); // Counter for assigning unique track IDs
  const previousDetectionsRef = useRef([]); // Store previous frame detections for tracking
  const detectionFrameCounterRef = useRef(0); // Count frames to skip heavy detection
  const DETECTION_INTERVAL = 3; // Run COCO-SSD every 3rd frame (huge performance boost!)
  const detectionBufferRef = useRef({}); // Consensus buffer: {trackId: {number: count, ...}}
  const timeoutRef = useRef(null); // 10-second timeout timer
  
  // Interactive court boundary controls
  const [courtBoundaries, setCourtBoundaries] = useState({
    netY: 0.30,           // 30% from top
    baselineY: 0.85,      // 85% from top
    netLeftX: 0.35,       // 35% from left (narrow at net)
    netRightX: 0.65,      // 65% from left (narrow at net)
    baselineLeftX: 0.02,  // 2% from left (WIDE at baseline, close to edge!)
    baselineRightX: 0.98  // 98% from left (WIDE at baseline, close to edge!)
  });
  const [showCourtControls, setShowCourtControls] = useState(false); // Start minimized!
  const [enableOCR, setEnableOCR] = useState(true); // OCR ON by default - tries during 10s timeout

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

  // Calculate centroid of a bounding box
  const getCentroid = (bbox) => {
    const [x, y, width, height] = bbox;
    return {
      x: x + width / 2,
      y: y + height / 2
    };
  };

  // Calculate Euclidean distance between two centroids
  const getDistance = (c1, c2) => {
    return Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
  };

  // Track players across frames using centroid matching
  const trackPlayers = (currentDetections) => {
    const previousDetections = previousDetectionsRef.current;
    const trackedDetections = [];
    
    // If no previous frame, assign new track IDs to all
    if (previousDetections.length === 0) {
      currentDetections.forEach(detection => {
        const trackId = nextTrackIdRef.current++;
        trackedDetections.push({
          ...detection,
          trackId,
          centroid: getCentroid(detection.bbox)
        });
      });
      previousDetectionsRef.current = trackedDetections;
      console.log(`🆕 Initialized ${trackedDetections.length} new track IDs:`, trackedDetections.map(t => t.trackId));
      return trackedDetections;
    }

    // Match current detections to previous using closest centroid
    const unmatchedCurrent = [...currentDetections];
    const unmatchedPrevious = [...previousDetections];
    
    // Build distance matrix
    const matches = [];
    currentDetections.forEach((curr, currIdx) => {
      const currCentroid = getCentroid(curr.bbox);
      
      previousDetections.forEach((prev, prevIdx) => {
        const distance = getDistance(currCentroid, prev.centroid);
        matches.push({ currIdx, prevIdx, distance, prevTrackId: prev.trackId });
      });
    });
    
    // Sort by distance (closest first)
    matches.sort((a, b) => a.distance - b.distance);
    
    // Assign matches (greedy - closest pairs first)
    const assignedCurrent = new Set();
    const assignedPrevious = new Set();
    let matchCount = 0;
    
    matches.forEach(match => {
      // Max distance threshold: 800 pixels (VERY high for fast-moving volleyball players!)
      // Players can jump 3+ feet, dive across court, rotate positions quickly
      if (match.distance < 800 && 
          !assignedCurrent.has(match.currIdx) && 
          !assignedPrevious.has(match.prevIdx)) {
        
        const detection = currentDetections[match.currIdx];
        trackedDetections.push({
          ...detection,
          trackId: match.prevTrackId, // Reuse previous track ID
          centroid: getCentroid(detection.bbox)
        });
        
        assignedCurrent.add(match.currIdx);
        assignedPrevious.add(match.prevIdx);
        matchCount++;
      }
    });
    
    // Assign new track IDs to unmatched detections
    let newTrackCount = 0;
    currentDetections.forEach((detection, idx) => {
      if (!assignedCurrent.has(idx)) {
        const trackId = nextTrackIdRef.current++;
        trackedDetections.push({
          ...detection,
          trackId,
          centroid: getCentroid(detection.bbox)
        });
        newTrackCount++;
      }
    });
    
    if (matchCount > 0 || newTrackCount > 0) {
      console.log(`🔄 Tracking: ${matchCount} matched, ${newTrackCount} new | Total active: ${trackedDetections.length}`);
      if (newTrackCount > 0) {
        console.log(`   ⚠️ Created ${newTrackCount} new trackIds (players moved >800px or were occluded)`);
      }
      // Show max distance of matched players to help tune threshold
      if (matchCount > 0) {
        const matchedDistances = matches
          .filter(m => assignedCurrent.has(m.currIdx))
          .map(m => Math.round(m.distance));
        if (matchedDistances.length > 0) {
          const maxDist = Math.max(...matchedDistances);
          const avgDist = Math.round(matchedDistances.reduce((a,b) => a+b, 0) / matchedDistances.length);
          console.log(`   📏 Movement: max ${maxDist}px, avg ${avgDist}px`);
        }
      }
    }
    
    previousDetectionsRef.current = trackedDetections;
    return trackedDetections;
  };

  // ADVANCED OCR: Extract jersey number with MULTIPLE preprocessing techniques
  const extractJerseyNumber = async (video, bbox, trackId) => {
    if (!tesseractWorker) return null;

    try {
      const [x, y, width, height] = bbox;
      
      // Function to try OCR with different preprocessing methods
      const tryOCRWithPreprocessing = async (preprocessFunc, methodName) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // LARGER crop for jersey - focus on chest area
        const jerseyX = x + width * 0.15;
        const jerseyY = y + height * 0.15;
        const jerseyWidth = width * 0.7;
        const jerseyHeight = height * 0.5;
        
        canvas.width = jerseyWidth;
        canvas.height = jerseyHeight;
        
        // Draw full resolution crop
        ctx.drawImage(
          video,
          jerseyX, jerseyY, jerseyWidth, jerseyHeight,
          0, 0, jerseyWidth, jerseyHeight
        );
        
        // Apply preprocessing
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        preprocessFunc(imageData);
        ctx.putImageData(imageData, 0, 0);
        
        // Scale up 4x for better OCR
        const scaledCanvas = document.createElement('canvas');
        const scaledCtx = scaledCanvas.getContext('2d');
        scaledCanvas.width = canvas.width * 4;
        scaledCanvas.height = canvas.height * 4;
        scaledCtx.imageSmoothingEnabled = false;
        scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
        
        // Run OCR with optimized config for jersey numbers
        // PSM 8 = Treat image as a single word (perfect for jersey numbers!)
        // Whitelist = Only allow digits 0-9 (no letters)
        const { data: { text } } = await tesseractWorker.recognize(scaledCanvas, {
          tessedit_pageseg_mode: '8',  // Single word mode
          tessedit_char_whitelist: '0123456789'  // Only digits
        });
        const numbers = text.replace(/\D/g, '').trim();
        
        console.log(`  📸 ${methodName}: raw="${text}" → numbers="${numbers}"`);
        
        if (numbers.length >= 1 && numbers.length <= 2) {
          const jerseyNumber = parseInt(numbers, 10);
          
          // Check if this number exists in FULL ROSTER (benchPlayers), not just courtPlayers!
          const matchingPlayer = benchPlayers?.find(p => 
            parseInt(p.number) === jerseyNumber || p.number === jerseyNumber.toString()
          );
          
          if (matchingPlayer) {
            console.log(`  ✅ ${methodName}: #${jerseyNumber} matches roster player ${matchingPlayer.name}`);
            return jerseyNumber;
          } else {
            console.log(`  ⚠️ ${methodName}: #${jerseyNumber} not found in roster`);
          }
        }
        return null;
      };
      
      // PREPROCESSING METHOD 1: High Contrast (Otsu-like thresholding)
      const highContrast = (imageData) => {
        const data = imageData.data;
        
        // Convert to grayscale
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        
        // Calculate histogram to find optimal threshold
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
          histogram[data[i]]++;
        }
        
        // Simple Otsu's method
        let sum = 0, sumB = 0, wB = 0, wF = 0;
        let mB, mF, max = 0, between, threshold = 128;
        const total = data.length / 4;
        
        for (let i = 0; i < 256; i++) sum += i * histogram[i];
        
        for (let i = 0; i < 256; i++) {
          wB += histogram[i];
          if (wB === 0) continue;
          wF = total - wB;
          if (wF === 0) break;
          sumB += i * histogram[i];
          mB = sumB / wB;
          mF = (sum - sumB) / wF;
          between = wB * wF * (mB - mF) * (mB - mF);
          if (between > max) {
            max = between;
            threshold = i;
          }
        }
        
        // Apply threshold
        for (let i = 0; i < data.length; i += 4) {
          const value = data[i] > threshold ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = value;
        }
      };
      
      // PREPROCESSING METHOD 2: Inverted (white numbers on black)
      const inverted = (imageData) => {
        const data = imageData.data;
        
        // Grayscale
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        
        // Threshold at 140
        for (let i = 0; i < data.length; i += 4) {
          const value = data[i] > 140 ? 0 : 255; // INVERTED!
          data[i] = data[i + 1] = data[i + 2] = value;
        }
      };
      
      // PREPROCESSING METHOD 3: Edge Enhancement
      const edgeEnhanced = (imageData) => {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const copy = new Uint8ClampedArray(data);
        
        // Grayscale first
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          copy[i] = copy[i + 1] = copy[i + 2] = gray;
        }
        
        // Simple edge detection (Sobel-like)
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const gx = copy[idx + 4] - copy[idx - 4];
            const gy = copy[idx + width * 4] - copy[idx - width * 4];
            const mag = Math.sqrt(gx * gx + gy * gy);
            data[idx] = data[idx + 1] = data[idx + 2] = Math.min(255, mag);
          }
        }
        
        // Threshold
        for (let i = 0; i < data.length; i += 4) {
          const value = data[i] > 100 ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = value;
        }
      };
      
      console.log(`🔢 Trying OCR for trackId ${trackId}...`);
      
      // Try all methods in sequence - return first successful match
      let result = await tryOCRWithPreprocessing(highContrast, "High Contrast");
      if (result) return result;
      
      result = await tryOCRWithPreprocessing(inverted, "Inverted");
      if (result) return result;
      
      result = await tryOCRWithPreprocessing(edgeEnhanced, "Edge Enhanced");
      if (result) return result;
      
      console.log(`  ❌ All methods failed for trackId ${trackId}`);
      return null;
      
    } catch (error) {
      console.warn(`⚠️ OCR failed for trackId ${trackId}:`, error);
      return null;
    }
  };

  // Capture screenshot of bounding box area
  const captureBboxScreenshot = (video, bbox) => {
    try {
      const [x, y, width, height] = bbox;
      
      // EXPAND BBOX TO CAPTURE JERSEY NUMBERS!
      // COCO-SSD often crops at waist, but jersey numbers are on chest
      // Expand upward by 50% of height, and add 20% padding on sides
      const expandUp = height * 0.5;    // Expand 50% upward to catch chest
      const expandSides = width * 0.2;  // 20% padding left/right
      const expandDown = height * 0.1;  // Small padding at bottom
      
      const expandedX = x - expandSides;
      const expandedY = y - expandUp;  // Move TOP edge UP
      const expandedWidth = width + (expandSides * 2);
      const expandedHeight = height + expandUp + expandDown;
      
      console.log(`📸 Capturing expanded bbox screenshot:
        - Original: (${x}, ${y}) ${width}x${height}
        - Expanded: (${expandedX}, ${expandedY}) ${expandedWidth}x${expandedHeight}
        - Expansion: ⬆️${expandUp}px up, ⬅️➡️${expandSides}px sides
        - Video size: ${video.videoWidth}x${video.videoHeight}`);
      
      // Validate bbox
      if (expandedWidth <= 0 || expandedHeight <= 0) {
        console.error('❌ Invalid bbox dimensions:', { width: expandedWidth, height: expandedHeight });
        return null;
      }
      
      // Clamp to video bounds
      const clampedX = Math.max(0, Math.min(expandedX, video.videoWidth));
      const clampedY = Math.max(0, Math.min(expandedY, video.videoHeight));
      const clampedWidth = Math.min(expandedWidth, video.videoWidth - clampedX);
      const clampedHeight = Math.min(expandedHeight, video.videoHeight - clampedY);
      
      console.log(`📐 Clamped bbox: (${clampedX}, ${clampedY}) ${clampedWidth}x${clampedHeight}`);
      
      // Create temporary canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = clampedWidth;
      tempCanvas.height = clampedHeight;
      const ctx = tempCanvas.getContext('2d');
      
      // Draw the bbox area from video
      ctx.drawImage(
        video,
        clampedX, clampedY, clampedWidth, clampedHeight,  // Source rectangle
        0, 0, clampedWidth, clampedHeight   // Destination rectangle
      );
      
      // Convert to data URL
      const imageData = tempCanvas.toDataURL('image/jpeg', 0.9);
      console.log(`✅ Captured bbox screenshot (${imageData.length} bytes)`);
      return imageData;
    } catch (error) {
      console.error('❌ Failed to capture bbox screenshot:', error);
      console.error('Stack trace:', error.stack);
      return null;
    }
  };

  // Try to auto-identify player by jersey number
  const tryAutoIdentify = async (trackId, jerseyNumber) => {
    // Find player in FULL ROSTER (benchPlayers), not courtPlayers!
    const matchingPlayers = benchPlayers.filter(p => 
      parseInt(p.number) === parseInt(jerseyNumber) || p.number === jerseyNumber
    );
    
    console.log(`🔍 Searching FULL ROSTER for #${jerseyNumber}... found ${matchingPlayers.length} matches`);
    
    if (matchingPlayers.length === 1) {
      const player = matchingPlayers[0];
      console.log(`✅ Auto-identified trackId ${trackId} as #${jerseyNumber} ${player.name}`);
      
      // Clear 10-second timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        setTimeoutCountdown(null);
        console.log('⏱️ Cleared timeout - auto-identified via OCR');
      }
      
      setTrackedPlayers(prev => ({
        ...prev,
        [trackId]: {
          playerNumber: jerseyNumber,
          playerName: player.name,
          lastSeen: Date.now(),
          confidence: 'high-ocr'
        }
      }));
      
      // Check if player is already on court
      const isOnCourt = courtPlayers?.some(p => p && p.number === jerseyNumber);
      
      if (isOnCourt) {
        console.log(`👍 Player #${jerseyNumber} already on court - OCR reaffirmed identity`);
      } else {
        console.log(`➕ Adding player #${jerseyNumber} to court...`);
        try {
          await handlePlayerDrop(player, currentPlayerIndex);
          console.log(`✅ Successfully added #${jerseyNumber} to court`);
        } catch (error) {
          console.warn(`⚠️ Could not add player to court:`, error);
        }
      }
      
      console.log(`✅ Total identified: ${Object.keys(trackedPlayers).length + 1} players`);
      
      return true;
    }
    
    return false;
  };

  // CONSENSUS VOTING: Collect multiple OCR detections and verify
  const addToConsensusBuffer = (trackId, jerseyNumber) => {
    const buffer = detectionBufferRef.current;
    
    if (!buffer[trackId]) {
      buffer[trackId] = { counts: {}, totalAttempts: 0 };
    }
    
    // Increment count for this number
    buffer[trackId].counts[jerseyNumber] = (buffer[trackId].counts[jerseyNumber] || 0) + 1;
    buffer[trackId].totalAttempts++;
    
    // Check for consensus (number appears in 3+ out of 5 attempts)
    const counts = buffer[trackId].counts;
    const attempts = buffer[trackId].totalAttempts;
    
    for (const [number, count] of Object.entries(counts)) {
      if (count >= 3 && attempts >= 5) {
        // CONSENSUS REACHED!
        console.log(`🎯 CONSENSUS: trackId ${trackId} is #${number} (${count}/${attempts} votes)`);
        return parseInt(number, 10);
      }
    }
    
    // Log current voting status
    if (attempts % 3 === 0) {
      console.log(`📊 Voting for trackId ${trackId}: ${JSON.stringify(counts)} (${attempts} attempts)`);
    }
    
    return null; // No consensus yet
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

  // Jersey color clustering to identify our team
  const getJerseyColor = (video, bbox) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const [x, y, width, height] = bbox;
    const jerseyY = y + height * 0.2;
    const jerseyHeight = height * 0.3;
    
    const imageData = ctx.getImageData(x, jerseyY, width, jerseyHeight);
    const data = imageData.data;
    
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    
    return {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count)
    };
  };

  const colorDistance = (c1, c2) => {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  };

  const clusterByJerseyColor = (video, players) => {
    if (players.length === 0) return { ourPlayers: [], oppPlayers: [] };
    
    const colors = players.map(p => ({
      player: p,
      color: getJerseyColor(video, p.bbox)
    }));
    
    // Simple clustering: find most common color (our team)
    const clusters = [];
    colors.forEach(({ color, player }) => {
      let assigned = false;
      for (let cluster of clusters) {
        if (colorDistance(color, cluster.centroid) < 60) {
          cluster.players.push(player);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        clusters.push({ centroid: color, players: [player] });
      }
    });
    
    // Largest cluster is our team
    clusters.sort((a, b) => b.players.length - a.players.length);
    
    // Check if there's a libero (different color)
    let ourPlayers = [];
    if (clusters.length >= 2 && clusters[1].players.length === 1) {
      // Combine main team + libero
      ourPlayers = [...clusters[0].players, ...clusters[1].players];
    } else {
      ourPlayers = clusters[0]?.players || [];
    }
    
    return { ourPlayers };
  };

  // Load COCO-SSD model and Tesseract
  useEffect(() => {
    if (!isActive) return;

    const loadModels = async () => {
      try {
        console.log('🤖 Loading TensorFlow.js backends...');
        console.log('📋 FULL ROSTER (benchPlayers):', benchPlayers?.length || 0, 'total players');
        console.log('🏐 COURT LINEUP (courtPlayers):', courtPlayers?.length || 0, 'on court');
        
        if (benchPlayers && benchPlayers.length > 0) {
          console.log('✅ Full roster loaded:', benchPlayers.map(p => `#${p?.number || '?'} ${p?.name || '?'}`).join(', '));
          console.log('🔍 RAW ROSTER STRUCTURE:', JSON.stringify(benchPlayers.slice(0, 3), null, 2), '... (showing first 3)');
          
          // Check if roster has valid data
          const hasValidData = benchPlayers.some(p => p && p.number && p.name);
          if (!hasValidData) {
            console.error('❌ WARNING: Roster exists but all players show as "#? ?" - check your team roster!');
          }
        } else {
          console.warn('⚠️ NO ROSTER LOADED! Make sure team is loaded before tracking.');
        }
        
        if (courtPlayers && courtPlayers.length > 0) {
          console.log('🏐 Current lineup:', courtPlayers.map(p => `#${p?.number || '?'} ${p?.name || '?'}`).join(', '));
        } else {
          console.log('🏐 Court lineup is empty (will be filled by tracking)');
        }
        
        // Import TensorFlow.js first to register backends
        const tf = await import('@tensorflow/tfjs');
        
        // Try to set backend (WebGL preferred, fallback to WASM or CPU)
        try {
          await tf.setBackend('webgl');
          await tf.ready();
          console.log('✅ WebGL backend initialized');
        } catch (webglError) {
          console.warn('⚠️ WebGL backend failed, trying WASM...', webglError);
          try {
            await tf.setBackend('wasm');
            await tf.ready();
            console.log('✅ WASM backend initialized');
          } catch (wasmError) {
            console.warn('⚠️ WASM backend failed, trying CPU...', wasmError);
            await tf.setBackend('cpu');
            await tf.ready();
            console.log('✅ CPU backend initialized (slow but works)');
          }
        }
        
        console.log(`🔧 Active backend: ${tf.getBackend()}`);
        console.log('📦 Loading COCO-SSD model...');
        
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        const loadedModel = await cocoSsd.load();
        setModel(loadedModel);
        console.log('✅ COCO-SSD model loaded successfully!');

        // Initialize Tesseract for OCR
        console.log('📝 Loading Tesseract OCR...');
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`🔍 OCR progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        
        // Build whitelist from roster jersey numbers (with safety checks)
        console.log(`🔍 Building OCR whitelist from FULL ROSTER...`);
        console.log(`📋 Roster at OCR init:`, benchPlayers?.map(p => `#${p?.number || '?'} ${p?.name || '?'}`));
        
        if (!benchPlayers || benchPlayers.length === 0) {
          console.error('❌ Cannot initialize OCR: No players in roster!');
          console.error('💡 Make sure your team roster is loaded before enabling AI tracking');
          return;
        }
        
        // Filter out players with undefined/null numbers from FULL ROSTER
        const validPlayers = benchPlayers.filter(p => p && p.number != null);
        
        if (validPlayers.length === 0) {
          console.error('❌ Cannot initialize OCR: No valid jersey numbers in roster!');
          console.error('💡 All players show as "#? ?" - check your team roster data');
          return;
        }
        
        // Extract all digits from valid jersey numbers
        const rosterNumbers = validPlayers.map(p => p.number.toString()).join('');
        const uniqueDigits = [...new Set(rosterNumbers)].join(''); // Get unique digits
        
        console.log(`✅ Valid players for OCR: ${validPlayers.length}/${benchPlayers.length}`);
        console.log(`📋 Jersey numbers: ${validPlayers.map(p => `#${p.number}`).join(', ')}`);
        console.log(`🎯 OCR whitelist (allowed digits): "${uniqueDigits}"`);
        
        if (!uniqueDigits || uniqueDigits.length === 0) {
          console.error('❌ Cannot initialize OCR: No digits in whitelist!');
          return;
        }
        
        await worker.setParameters({
          tessedit_char_whitelist: uniqueDigits, // Only digits from roster
          tessedit_pageseg_mode: '8', // Single word mode (better for 1-2 digit numbers)
        });
        setTesseractWorker(worker);
        console.log('✅ Tesseract OCR loaded successfully!');
        console.log(`🎯 Looking for jersey numbers: ${validPlayers.map(p => `#${p.number}`).join(', ')}`);
        
      } catch (error) {
        console.error('❌ Error loading COCO-SSD model:', error);
        console.error('💡 Try refreshing the page or checking your internet connection');
      }
    };
    
    loadModels();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Cleanup Tesseract worker
      if (tesseractWorker) {
        tesseractWorker.terminate();
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

    if (video.paused || video.ended) {
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

    // OPTIMIZATION: Skip heavy detection on most frames
    // Run COCO-SSD only every Nth frame, reuse previous detections otherwise
    detectionFrameCounterRef.current++;
    const shouldRunDetection = detectionFrameCounterRef.current % DETECTION_INTERVAL === 0;
    
    let predictions;
    if (shouldRunDetection) {
      // Run full COCO-SSD detection (expensive!)
      predictions = await model.detect(video);
    } else {
      // Skip detection - reuse previous frame's results (fast!)
      // Note: trackPlayers will handle position updates via centroid matching
      animationFrameRef.current = requestAnimationFrame(detectPlayers);
      return;
    }

    try {
      
      // Log detection results occasionally (throttled to ~10% of frames)
      const shouldLog = Math.random() < 0.1;
      
      if (shouldLog) {
        console.log(`🔍 COCO-SSD detected ${predictions.length} total objects`);
        console.log(`📋 Classes:`, predictions.map(p => `${p.class} (${Math.round(p.score * 100)}%)`));
      }
      
      // Get all detected people
      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;
      const frameArea = frameWidth * frameHeight;

      let people = predictions
        .filter(p => p.class === 'person' && p.score > 0.5)
        .map(p => {
          const bboxArea = p.bbox[2] * p.bbox[3];
          const areaRatio = bboxArea / frameArea;
          return {
            ...p,
            size: bboxArea,
            areaRatio: areaRatio
          };
        })
        .filter(p => {
          if (p.areaRatio > 0.4) return false;  // Too large (net/scoreboard)
          if (p.areaRatio < 0.003) return false; // Too small (noise)
          const aspectRatio = p.bbox[3] / p.bbox[2];
          if (aspectRatio < 0.5 || aspectRatio > 4) return false;
          return true;
        });

      if (shouldLog) {
        console.log(`👥 ${people.length} people passed size/aspect filters`);
      }

      // Filter to court area
      const { netY, baselineBehindY, netLeftX, netRightX, baselineLeftX, baselineRightX } = 
        detectCourtBoundaries(frameHeight, frameWidth);
      const playersOnCourt = people.filter(p => 
        isOnCourt(p.bbox, netY, baselineBehindY, netLeftX, netRightX, baselineLeftX, baselineRightX)
      );

      if (shouldLog) {
        console.log(`🏐 ${playersOnCourt.length} players on court (within boundaries)`);
      }

      // Skip frames with too many/few players (transitions)
      if (playersOnCourt.length < 3 || playersOnCourt.length > 8) {
        if (shouldLog) {
          console.warn(`⏭️ Skipping frame: ${playersOnCourt.length} players (need 3-8)`);
        }
        animationFrameRef.current = requestAnimationFrame(detectPlayers);
        return;
      }

      // Cluster by jersey color to get our team
      const { ourPlayers } = clusterByJerseyColor(video, playersOnCourt);

      if (shouldLog) {
        console.log(`👕 ${ourPlayers.length} players on our team (after color clustering)`);
      }

      // Sort by position (back row first, then front row)
      const sortedPlayers = ourPlayers
        .sort((a, b) => b.size - a.size)
        .slice(0, 6)
        .sort((a, b) => {
          const yDiff = a.bbox[1] - b.bbox[1];
          if (Math.abs(yDiff) > 50) return yDiff;
          return a.bbox[0] - b.bbox[0];
        });

      // Track players across frames
      const trackedDetections = trackPlayers(sortedPlayers);

      if (shouldLog) {
        console.log(`✅ Final: ${trackedDetections.length} tracked players to display`);
        console.log(`🏷️ Track IDs:`, trackedDetections.map(p => p.trackId));
      }

      // Try OCR on unidentified players (ONLY if enabled - throttled to every 60 frames ~2 seconds)
      if (enableOCR && tesseractWorker && Math.random() < 0.017) { // Reduced from 0.033 to 0.017 (slower but thorough)
        for (const player of trackedDetections) {
          const trackId = player.trackId;
          
          // Check state to see if already identified
          const isIdentified = trackedPlayers && trackedPlayers[trackId]?.playerNumber;
          if (isIdentified) continue;
          
          // Skip if we've already tried OCR too many times
          const attempts = ocrAttempts[trackId] || 0;
          if (attempts >= 10) continue; // Give up after 10 attempts (increased from 5)
          
          // Try OCR
          const jerseyNumber = await extractJerseyNumber(video, player.bbox, trackId);
          
          // Update attempt count
          setOcrAttempts(prev => ({
            ...prev,
            [trackId]: (prev[trackId] || 0) + 1
          }));
          
          if (jerseyNumber) {
            // Add to consensus buffer
            const consensusNumber = addToConsensusBuffer(trackId, jerseyNumber);
            
            if (consensusNumber) {
              // CONSENSUS REACHED! Try to auto-identify
              const success = await tryAutoIdentify(trackId, consensusNumber);
              if (success) {
                console.log(`🎯 Successfully auto-identified trackId ${trackId} via consensus!`);
              } else {
                console.log(`⚠️ Consensus jersey #${consensusNumber} doesn't match roster or is ambiguous`);
              }
            }
          }
          
          // Only process one player per frame to avoid lag
          break;
        }
      }

      setDetections(trackedDetections);
      
      // BATCH IDENTIFICATION: Collect ALL unidentified players and show them together!
      if (trackedDetections.length >= 3 && !identificationComplete && !showBatchIdentifyModal) {
        // Find ALL unidentified players
        const unidentifiedPlayers = [];
        
        for (let i = 0; i < trackedDetections.length; i++) {
          const player = trackedDetections[i];
          const trackId = player.trackId;
          const isIdentified = trackedPlayers && trackedPlayers[trackId]?.playerNumber;
          
          if (!isIdentified) {
            unidentifiedPlayers.push({ ...player, index: i });
            console.log(`🔍 Found unidentified player at index ${i}, trackId ${trackId}`);
          } else {
            console.log(`✅ Skipping trackId ${trackId} (already identified as #${trackedPlayers[trackId].playerNumber} ${trackedPlayers[trackId].playerName})`);
          }
        }
        
        // If we found unidentified players and have enough for batch (3-6), show batch modal
        if (unidentifiedPlayers.length >= 3 && videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          setIsPaused(true);
          console.log(`⏸️ Auto-paused to identify ${unidentifiedPlayers.length} players in batch`);
          
          // Capture screenshots and run OCR on all players
          const batchData = [];
          for (const player of unidentifiedPlayers) {
            const screenshot = captureBboxScreenshot(video, player.bbox);
            
            // Try OCR if enabled
            let ocrGuess = null;
            if (enableOCR && tesseractWorker) {
              console.log(`🤖 Running OCR on trackId ${player.trackId}...`);
              ocrGuess = await extractJerseyNumber(video, player.bbox, player.trackId);
              if (ocrGuess) {
                console.log(`   OCR guess: #${ocrGuess}`);
              }
            }
            
            batchData.push({
              trackId: player.trackId,
              bbox: player.bbox,
              image: screenshot,
              ocrGuess: ocrGuess,
              userInput: ocrGuess || '' // Pre-fill with OCR guess
            });
          }
          
          setBatchPlayers(batchData);
          setShowBatchIdentifyModal(true);
          console.log(`📋 Showing batch identification modal for ${batchData.length} players`);
          console.log(`📋 Showing batch identification modal for ${batchData.length} players`);
        } else if (unidentifiedPlayers.length > 0 && unidentifiedPlayers.length < 3) {
          // Only 1-2 unidentified - wait for more to appear for batch
          console.log(`ℹ️ Only ${unidentifiedPlayers.length} unidentified - waiting for more to batch identify`);
        } else {
          // All visible players are identified!
          console.log(`🎉 All ${trackedDetections.length} visible players are identified!`);
        }
      }
      
      drawBoundingBoxes(trackedDetections, canvas, video);
      
    } catch (error) {
      console.error('Detection error:', error);
    }

    animationFrameRef.current = requestAnimationFrame(detectPlayers);
  }, [model, isActive, videoRef, hoveredIndex, trackedPlayers, tesseractWorker, ocrAttempts, enableOCR, courtBoundaries]);

  // Auto-pause when advancing to next player
  useEffect(() => {
    if (!identificationComplete && videoRef.current && detections.length > 0) {
      const currentPlayer = detections[currentPlayerIndex];
      if (currentPlayer) {
        const trackId = currentPlayer.trackId;
        const isIdentified = trackedPlayers && trackedPlayers[trackId]?.playerNumber;
        
        // If current player is NOT identified, pause the video
        if (!isIdentified && !videoRef.current.paused) {
          videoRef.current.pause();
          setIsPaused(true);
          console.log(`⏸️ Paused for next player ${currentPlayerIndex + 1}`);
        }
      }
    }
  }, [currentPlayerIndex, detections, identificationComplete, trackedPlayers]);

  // Draw bounding boxes and court boundaries
  const drawBoundingBoxes = (people, canvas, video) => {
    const ctx = canvas.getContext('2d');
    canvas.width = video.offsetWidth;
    canvas.height = video.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Green border when AI is active
    ctx.strokeStyle = '#0F0';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;

    // Draw court boundaries
    const { netY, baselineBehindY, netLeftX, netRightX, baselineLeftX, baselineRightX } = 
      detectCourtBoundaries(video.videoHeight, video.videoWidth);
    
    // Log boundaries once
    if (Math.random() < 0.01) {
      console.log('📐 Court boundaries:', {
        net: `${(netY / video.videoHeight * 100).toFixed(1)}% from top`,
        baseline: `${(baselineBehindY / video.videoHeight * 100).toFixed(1)}% from top`,
        netLeft: `${(netLeftX / video.videoWidth * 100).toFixed(1)}% from left`,
        netRight: `${(netRightX / video.videoWidth * 100).toFixed(1)}% from left`,
        baselineLeft: `${(baselineLeftX / video.videoWidth * 100).toFixed(1)}% from left`,
        baselineRight: `${(baselineRightX / video.videoWidth * 100).toFixed(1)}% from left`
      });
    }
    
    // Net (yellow)
    ctx.strokeStyle = '#FF0';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(0, netY * scaleY);
    ctx.lineTo(canvas.width, netY * scaleY);
    ctx.stroke();
    ctx.fillStyle = '#FF0';
    ctx.font = '12px monospace';
    ctx.fillText('NET', 10, netY * scaleY + 15);
    
    // Baseline (red)
    ctx.strokeStyle = '#F00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, baselineBehindY * scaleY);
    ctx.lineTo(canvas.width, baselineBehindY * scaleY);
    ctx.stroke();
    ctx.fillStyle = '#F00';
    ctx.fillText('BASELINE', 10, baselineBehindY * scaleY - 5);
    
    // Left sideline (cyan trapezoid)
    ctx.strokeStyle = '#0FF';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(netLeftX * scaleX, netY * scaleY);
    ctx.lineTo(baselineLeftX * scaleX, baselineBehindY * scaleY);
    ctx.stroke();
    
    // Right sideline (cyan trapezoid)
    ctx.beginPath();
    ctx.moveTo(netRightX * scaleX, netY * scaleY);
    ctx.lineTo(baselineRightX * scaleX, baselineBehindY * scaleY);
    ctx.stroke();
    
    ctx.setLineDash([]);

    // Draw debug info
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(5, 5, 280, 50);
    ctx.fillStyle = '#0F0';
    ctx.font = '12px monospace';
    ctx.fillText(`Video: ${video.videoWidth}x${video.videoHeight}`, 10, 20);
    ctx.fillText(`Detections: ${people.length} players`, 10, 35);
    ctx.fillText(`Time: ${video.currentTime.toFixed(1)}s`, 10, 50);

    // Draw player boxes - only show current player to identify + already identified
    people.forEach((person, index) => {
      const [x, y, width, height] = person.bbox;
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;

      const trackId = person.trackId;
      
      // Check if this tracked player is identified
      const playerInfo = trackedPlayers[trackId];
      const isIdentified = playerInfo && playerInfo.playerNumber;
      const isCurrentPlayer = index === currentPlayerIndex && !isIdentified;
      const isHovered = hoveredIndex === trackId;
      
      // Only show: already identified (green) OR current player to identify (yellow/blue)
      if (!isIdentified && !isCurrentPlayer) {
        // Skip this player - not their turn yet
        return;
      }
      
      // Color: green if identified, blue if hovered current, yellow if current
      let color = isIdentified ? '#4CD964' : (isHovered && isCurrentPlayer ? '#00F' : '#FFD700');
      
      ctx.strokeStyle = color;
      ctx.lineWidth = isCurrentPlayer ? 5 : 2; // Thicker border for current player
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Show jersey number if identified
      if (isIdentified) {
        ctx.fillStyle = color;
        ctx.font = 'bold 20px Arial';
        
        // Add OCR badge for auto-identified players
        if (playerInfo.confidence === 'high') {
          ctx.fillText(`🤖 #${playerInfo.playerNumber}`, scaledX + 5, scaledY + 25);
        } else {
          ctx.fillText(`#${playerInfo.playerNumber}`, scaledX + 5, scaledY + 25);
        }
        
        // Show player name
        if (playerInfo.playerName) {
          ctx.font = 'bold 14px Arial';
          ctx.fillText(playerInfo.playerName, scaledX + 5, scaledY + 45);
        }
      }

      // Click hint when hovering over current player
      if (isCurrentPlayer && isHovered) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(scaledX, scaledY - 30, 150, 25);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Click to identify', scaledX + 5, scaledY - 12);
      }

      // Show "Player X of 6" label on current player
      if (isCurrentPlayer) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.fillRect(scaledX, scaledY + scaledHeight + 5, 120, 30);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`Player ${currentPlayerIndex + 1} of 6`, scaledX + 5, scaledY + scaledHeight + 25);
      }
      
      // Show countdown timer on current player
      if (isCurrentPlayer && timeoutCountdown !== null) {
        ctx.fillStyle = 'rgba(255, 69, 0, 0.95)';
        ctx.fillRect(scaledX + scaledWidth - 50, scaledY - 35, 45, 30);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`⏱️${timeoutCountdown}`, scaledX + scaledWidth - 48, scaledY - 12);
      }
    });
  };

  // Handle canvas click - only allow clicking current player
  const handleCanvasClick = (e) => {
    if (!canvasRef.current || !videoRef.current) return;
    if (identificationComplete) return; // All done

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = video.videoWidth / canvas.width;
    const scaleY = video.videoHeight / canvas.height;

    // Only allow clicking the current player
    if (currentPlayerIndex >= detections.length) return;
    
    const currentPlayer = detections[currentPlayerIndex];
    if (!currentPlayer) return;

    const [x, y, width, height] = currentPlayer.bbox;
    const scaledX = x / scaleX;
    const scaledY = y / scaleY;
    const scaledWidth = width / scaleX;
    const scaledHeight = height / scaleY;

    const clickedCurrent = (
      clickX >= scaledX &&
      clickX <= scaledX + scaledWidth &&
      clickY >= scaledY &&
      clickY <= scaledY + scaledHeight
    );

    if (clickedCurrent) {
      console.log(`👆 User clicked on current player (${currentPlayerIndex + 1} of 6), trackId: ${currentPlayer.trackId}`);
      setSelectedTrackId(currentPlayer.trackId);
      setShowPlayerSelector(true);
    }
  };

  // Handle canvas hover - only highlight current player
  const handleCanvasMove = (e) => {
    if (!canvasRef.current || !videoRef.current) return;
    if (identificationComplete) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleX = video.videoWidth / canvas.width;
    const scaleY = video.videoHeight / canvas.height;

    // Only highlight if hovering over current player
    if (currentPlayerIndex >= detections.length) {
      setHoveredIndex(null);
      return;
    }

    const currentPlayer = detections[currentPlayerIndex];
    if (!currentPlayer) {
      setHoveredIndex(null);
      return;
    }

    const [x, y, width, height] = currentPlayer.bbox;
    const scaledX = x / scaleX;
    const scaledY = y / scaleY;
    const scaledWidth = width / scaleX;
    const scaledHeight = height / scaleY;

    const isOverCurrent = (
      mouseX >= scaledX &&
      mouseX <= scaledX + scaledWidth &&
      mouseY >= scaledY &&
      mouseY <= scaledY + scaledHeight
    );

    setHoveredIndex(isOverCurrent ? currentPlayer.trackId : null);
  };

  // Handle player selection from roster
  const handlePlayerSelect = async (player) => {
    if (selectedTrackId === null) return;

    console.log(`✅ User manually identified trackId ${selectedTrackId} as #${player.number} ${player.name}`);
    
    // Clear 10-second timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setTimeoutCountdown(null);
      console.log('⏱️ Cleared timeout - player identified');
    }
    
    // Store the player info with their track ID
    setTrackedPlayers(prev => ({
      ...prev,
      [selectedTrackId]: {
        playerNumber: player.number,
        playerName: player.name,
        lastSeen: Date.now(),
        confidence: 'manual' // Mark as manually identified
      }
    }));
    
    console.log(`📚 Training data: trackId ${selectedTrackId} → #${player.number} (${player.name})`);
    console.log(`✅ Successfully identified trackId ${selectedTrackId} as #${player.number} ${player.name}`);
    
    // Check how many unique players we've identified
    const identifiedCount = Object.keys(trackedPlayers).length + 1; // +1 for the one we just added
    console.log(`✅ Total identified: ${identifiedCount} players`);
    
    // Check if player is already on court
    const isOnCourt = courtPlayers?.some(p => p && p.number === player.number);
    
    if (isOnCourt) {
      // Player already on court - just reaffirm the trackId mapping
      console.log(`👍 Player #${player.number} already on court - reaffirmed identity for trackId ${selectedTrackId}`);
    } else {
      // Player NOT on court yet - add them
      console.log(`➕ Adding player #${player.number} to court position ${currentPlayerIndex}...`);
      try {
        await handlePlayerDrop(player, currentPlayerIndex);
        console.log(`✅ Successfully added #${player.number} to court`);
      } catch (error) {
        console.warn(`⚠️ Could not add player to court:`, error);
        // Continue anyway - we still have the trackId mapping
      }
    }

    // Close selector
    setShowPlayerSelector(false);
    setSelectedTrackId(null);
    setLockedTrackId(null); // Clear locked trackId
    setLockedBboxImage(null); // Clear bbox screenshot
    
    // Resume playback - the detection loop will find the next unidentified player
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play();
      setIsPaused(false);
      console.log(`▶️ Resuming playback to find next unidentified player...`);
    }
  };

  // Handle "Keep Trying" - restart 20-second timer
  const handleKeepTrying = () => {
    console.log('🔄 User chose to keep trying OCR...');
    setShowTimeoutModal(false);
    
    // Restart the 20-second countdown
    setTimeoutCountdown(20);
    const countdownInterval = setInterval(() => {
      setTimeoutCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    
    timeoutRef.current = setTimeout(() => {
      console.log(`⏱️ 20-second timeout AGAIN! Showing modal...`);
      clearInterval(countdownInterval);
      setTimeoutCountdown(null);
      setShowTimeoutModal(true);
      setManualJerseyNumber('');
    }, 20000);
  };

  // Handle manual jersey number submission
  const handleManualSubmit = async () => {
    const jerseyNum = parseInt(manualJerseyNumber.trim());
    
    if (!jerseyNum || isNaN(jerseyNum)) {
      alert('Please enter a valid jersey number');
      return;
    }
    
    console.log(`✏️ User manually entered jersey #${jerseyNum} for training`);
    console.log(`📋 FULL ROSTER:`, benchPlayers?.map(p => `#${p.number} ${p.name}`) || 'NO ROSTER!');
    console.log(`🔍 RAW ROSTER DATA:`, JSON.stringify(benchPlayers, null, 2));
    
    // Safety check - roster exists
    if (!benchPlayers || benchPlayers.length === 0) {
      alert('⚠️ No players in roster! Please make sure your team is loaded.');
      return;
    }
    
    // Check if roster has valid data
    const hasValidData = benchPlayers.some(p => p && p.number && p.name);
    if (!hasValidData) {
      alert('⚠️ Roster data is incomplete!\n\nAll players show as "#? ?"\n\nPlease check your team roster is properly loaded.');
      console.error('❌ Invalid roster structure:', benchPlayers);
      return;
    }
    
    // Get the locked trackId (set when we paused)
    let trackId = lockedTrackId;
    
    // FALLBACK: If no locked trackId, try to get from current detections
    if (!trackId) {
      console.warn('⚠️ No locked trackId! Trying fallback from detections...');
      const currentPlayer = detections[currentPlayerIndex];
      if (currentPlayer) {
        trackId = currentPlayer.trackId;
        console.log(`✅ Fallback: Using trackId ${trackId} from detections`);
      } else {
        console.error('❌ No locked trackId AND no current player in detections!');
        console.error(`📊 Debug info:
          - lockedTrackId: ${lockedTrackId}
          - currentPlayerIndex: ${currentPlayerIndex}
          - detections.length: ${detections.length}
          - detections:`, detections);
        alert('⚠️ Cannot identify player!\n\nNo player locked and no detections available.\n\nTry clicking "Select from Roster" instead.');
        return;
      }
    }
    
    console.log(`🎯 Using trackId: ${trackId}`);
    console.log(`🔍 ===== DETAILED SEARCH DEBUG =====`);
    console.log(`   Searching for: #${jerseyNum} (type: ${typeof jerseyNum})`);
    console.log(`   courtPlayers:`, courtPlayers);
    console.log(`   benchPlayers:`, benchPlayers);
    
    // Search in BOTH court AND bench (court takes priority for same number)
    const courtMatches = courtPlayers?.filter(p => {
      if (!p) {
        console.log(`   ⚠️ Court player is null/undefined`);
        return false;
      }
      const match = parseInt(p.number) === jerseyNum || p.number === jerseyNum;
      console.log(`   🏐 Court check: #${p.number} (type: ${typeof p.number}) === #${jerseyNum}? ${match}`);
      return match;
    }) || [];
    
    const benchMatches = benchPlayers?.filter(p => {
      if (!p) {
        console.log(`   ⚠️ Bench player is null/undefined`);
        return false;
      }
      const match = parseInt(p.number) === jerseyNum || p.number === jerseyNum;
      console.log(`   💺 Bench check: #${p.number} (type: ${typeof p.number}) === #${jerseyNum}? ${match}`);
      return match;
    }) || [];
    
    // Combine (prefer court player if duplicate numbers exist)
    const matchingPlayers = [...courtMatches];
    benchMatches.forEach(bp => {
      if (!courtMatches.some(cp => cp._id === bp._id || cp.number === bp.number)) {
        matchingPlayers.push(bp);
      }
    });
    
    console.log(`🔍 ===== SEARCH RESULTS =====`);
    console.log(`   Court matches: ${courtMatches.length}`, courtMatches);
    console.log(`   Bench matches: ${benchMatches.length}`, benchMatches);
    console.log(`   Total unique: ${matchingPlayers.length}`, matchingPlayers);
    console.log(`================================`);
    
    if (matchingPlayers.length === 1) {
      const player = matchingPlayers[0];
      console.log(`✅ Manual entry matched: #${jerseyNum} ${player.name}`);
      
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        setTimeoutCountdown(null);
      }
      
      // Store the player info in trackedPlayers
      setTrackedPlayers(prev => ({
        ...prev,
        [trackId]: {
          playerNumber: jerseyNum,
          playerName: player.name,
          lastSeen: Date.now(),
          confidence: 'manual-trained' // Mark as manually trained for OCR improvement
        }
      }));
      
      console.log(`📚 Training data collected: trackId ${trackId} → #${jerseyNum} (${player.name})`);
      console.log(`✅ Successfully identified trackId ${trackId} as #${jerseyNum} ${player.name}`);
      
      // Check if player is already on court
      const isOnCourt = courtPlayers?.some(p => p && p.number === jerseyNum);
      
      if (isOnCourt) {
        // Player already on court - just reaffirm the trackId mapping
        console.log(`👍 Player #${jerseyNum} already on court - reaffirmed identity for trackId ${trackId}`);
      } else {
        // Player NOT on court yet - add them
        console.log(`➕ Adding player #${jerseyNum} to court position ${currentPlayerIndex}...`);
        try {
          await handlePlayerDrop(player, currentPlayerIndex);
          console.log(`✅ Successfully added #${jerseyNum} to court`);
        } catch (error) {
          console.warn(`⚠️ Could not add player to court:`, error);
          // Continue anyway - we still have the trackId mapping
        }
      }
      
      // Check how many unique players we've identified
      const identifiedCount = Object.keys(trackedPlayers).length + 1; // +1 for the one we just added
      console.log(`✅ Total identified: ${identifiedCount} players`);
      
      // Resume video to look for more unidentified players
      // The detection loop will auto-pause on the next unidentified player it finds
      setShowTimeoutModal(false);
      setManualJerseyNumber('');
      setLockedTrackId(null); // Clear locked trackId
      setLockedBboxImage(null); // Clear bbox screenshot
      
      // Resume playback - the detection loop will find the next unidentified player
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play();
        setIsPaused(false);
        console.log(`▶️ Resuming playback to find next unidentified player...`);
      }
      
    } else if (matchingPlayers.length === 0) {
      // Not in roster - show helpful message
      const courtNumbers = courtPlayers
        ?.filter(p => p && p.number != null)
        .map(p => `#${p.number}`)
        .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
        .join(', ') || 'None';
        
      const benchNumbers = benchPlayers
        ?.filter(p => p && p.number != null)
        .filter(p => !courtPlayers?.some(cp => cp?.number === p.number))
        .map(p => `#${p.number}`)
        .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
        .join(', ') || 'None';
        
      alert(`❌ Jersey #${jerseyNum} not found!\n\n🏐 On Court: ${courtNumbers}\n💺 On Bench: ${benchNumbers}\n\n💡 Tip: Check the number in the photo above.`);
    } else {
      // Multiple matches - use click selector instead
      alert(`⚠️ Multiple players with #${jerseyNum}.\n\nOpening player selector to choose the correct one...`);
      setShowTimeoutModal(false);
      setShowPlayerSelector(true);
      setSelectedTrackId(trackId);
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play().catch(err => {
        console.warn('Play blocked:', err);
      });
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
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
          <div style={{
            backgroundColor: '#1C1C1E',
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ color: '#FFF', marginBottom: '20px' }}>
              👆 Who is this player?
            </h2>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '15px'
            }}>
              {benchPlayers
                .filter(p => !Object.values(trackedPlayers).some(t => t.playerNumber === p.number))
                .map(player => (
                  <button
                    key={player.id}
                    onClick={() => handlePlayerSelect(player)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: '12px',
                      padding: '20px',
                      color: '#FFF',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'center'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = 'rgba(76, 217, 100, 0.3)';
                      e.target.style.borderColor = '#4CD964';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
                      #{player.number}
                    </div>
                    <div style={{ fontSize: '14px' }}>
                      {player.name}
                    </div>
                  </button>
                ))}
            </div>

            <button
              onClick={() => {
                setShowPlayerSelector(false);
                setSelectedTrackId(null);
              }}
              style={{
                marginTop: '20px',
                width: '100%',
                padding: '15px',
                backgroundColor: '#FF3B30',
                color: '#FFF',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Play/Pause Button */}
      <button
        onClick={togglePlayPause}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          border: '3px solid #FFF',
          color: '#FFF',
          fontSize: '24px',
          cursor: 'pointer',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {isPaused ? '▶️' : '⏸️'}
      </button>

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

          {/* OCR Toggle */}
          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enableOCR}
                onChange={(e) => setEnableOCR(e.target.checked)}
                style={{ marginRight: '10px', width: '18px', height: '18px' }}
              />
              <div>
                <div style={{ fontWeight: 'bold' }}>🤖 Enable Advanced OCR</div>
                <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '3px' }}>
                  3 methods: Otsu, Inverted, Edge<br/>
                  20sec window, retries every 5sec
                </div>
              </div>
            </label>
          </div>
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

      {/* Instructions */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: '#FFF',
        padding: '15px',
        borderRadius: '12px',
        fontSize: '14px',
        zIndex: 100,
        maxWidth: '300px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
          📝 {enableOCR ? '🤖 AI Mode (Advanced)' : '👆 Manual Mode'}
        </div>
        <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
          {enableOCR ? (
            <>
              AI trying 3 methods per player:<br/>
              • Otsu threshold<br/>
              • Inverted colors<br/>
              • Edge detection<br/>
              <span style={{ color: '#4CD964' }}>Takes ~2sec each</span>
            </>
          ) : (
            <>
              1. Click <span style={{ color: '#FFD700' }}>🎯 Court Settings</span> if needed<br/>
              2. Adjust boundaries to fit court<br/>
              3. Play video ▶️<br/>
              4. Click <span style={{ color: '#FFD700' }}>yellow box</span><br/>
              5. Select from roster
            </>
          )}
        </div>
        <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 'bold' }}>
          {identificationComplete ? (
            <span style={{ color: '#4CD964' }}>✅ All 6 identified!</span>
          ) : (
            <>
              <span style={{ color: '#FFD700' }}>
                Player {currentPlayerIndex + 1} of 6
              </span>
              {enableOCR && tesseractWorker && (
                <div style={{ fontSize: '11px', color: '#4CD964', marginTop: '5px' }}>
                  🤖 Auto: {Object.values(trackedPlayers).filter(p => p.confidence === 'high').length}/6 | 
                  👆 Manual: {Object.values(trackedPlayers).filter(p => p.confidence === 'manual').length}/6
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
        onMouseLeave={() => setHoveredIndex(null)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: isActive ? 'auto' : 'none',
          cursor: hoveredIndex !== null ? 'pointer' : 'default',
          zIndex: 2
        }}
      />

      {/* BATCH IDENTIFICATION MODAL - Show all 6 players at once! */}
      {showBatchIdentifyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
          overflowY: 'auto'
        }}>
          <div style={{
            backgroundColor: '#FFF',
            borderRadius: '20px',
            padding: '30px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.4)'
          }}>
            {/* Header */}
            <div style={{
              fontSize: '28px',
              fontWeight: 'bold',
              marginBottom: '10px',
              color: '#333',
              textAlign: 'center'
            }}>
              🏐 Identify All Players ({batchPlayers.length})
            </div>
            
            <div style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '25px',
              textAlign: 'center'
            }}>
              OCR has made guesses - verify and correct if needed
            </div>
            
            {/* Player Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px',
              marginBottom: '25px'
            }}>
              {batchPlayers.map((player, idx) => (
                <div key={player.trackId} style={{
                  border: '2px solid #DDD',
                  borderRadius: '12px',
                  padding: '15px',
                  backgroundColor: '#F9F9F9'
                }}>
                  {/* Player Number Label */}
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#999',
                    marginBottom: '8px'
                  }}>
                    Player {idx + 1}
                  </div>
                  
                  {/* Player Image */}
                  {player.image && (
                    <img 
                      src={player.image}
                      alt={`Player ${idx + 1}`}
                      style={{
                        width: '100%',
                        height: '150px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        border: '2px solid ' + (player.ocrGuess ? '#4CAF50' : '#FFC107'),
                        marginBottom: '12px'
                      }}
                    />
                  )}
                  
                  {/* OCR Guess Display */}
                  {player.ocrGuess && (
                    <div style={{
                      fontSize: '13px',
                      color: '#4CAF50',
                      fontWeight: 'bold',
                      marginBottom: '8px',
                      textAlign: 'center',
                      backgroundColor: '#E8F5E9',
                      padding: '6px',
                      borderRadius: '6px'
                    }}>
                      🤖 OCR: #{player.ocrGuess}
                    </div>
                  )}
                  
                  {!player.ocrGuess && (
                    <div style={{
                      fontSize: '13px',
                      color: '#FF9800',
                      fontWeight: 'bold',
                      marginBottom: '8px',
                      textAlign: 'center',
                      backgroundColor: '#FFF3E0',
                      padding: '6px',
                      borderRadius: '6px'
                    }}>
                      ❓ OCR: Unknown
                    </div>
                  )}
                  
                  {/* Jersey Number Input */}
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    marginBottom: '6px',
                    fontWeight: 'bold'
                  }}>
                    Jersey #:
                  </div>
                  <input
                    type="number"
                    value={player.userInput}
                    onChange={(e) => {
                      const newBatch = [...batchPlayers];
                      newBatch[idx].userInput = e.target.value;
                      setBatchPlayers(newBatch);
                    }}
                    placeholder="Enter number"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      border: '2px solid #DDD',
                      borderRadius: '8px',
                      textAlign: 'center',
                      outline: 'none'
                    }}
                    autoFocus={idx === 0}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              ))}
            </div>
            
            {/* Submit Button */}
            <button
              onClick={() => {
                // Identify all players
                let successCount = 0;
                batchPlayers.forEach(player => {
                  if (player.userInput) {
                    const jerseyNumber = player.userInput;
                    const matchingPlayers = benchPlayers.filter(p => 
                      parseInt(p.number) === parseInt(jerseyNumber) || p.number === jerseyNumber
                    );
                    
                    if (matchingPlayers.length === 1) {
                      const matchedPlayer = matchingPlayers[0];
                      setTrackedPlayers(prev => ({
                        ...prev,
                        [player.trackId]: {
                          playerNumber: jerseyNumber,
                          playerName: matchedPlayer.name,
                          lastSeen: Date.now(),
                          confidence: player.ocrGuess === jerseyNumber ? 'high-ocr' : 'manual'
                        }
                      }));
                      successCount++;
                      console.log(`✅ Identified trackId ${player.trackId} as #${jerseyNumber} ${matchedPlayer.name}`);
                    } else {
                      console.warn(`⚠️ Could not match #${jerseyNumber} to roster`);
                    }
                  }
                });
                
                console.log(`🎉 Batch identified ${successCount}/${batchPlayers.length} players!`);
                
                // Close modal and resume
                setShowBatchIdentifyModal(false);
                setBatchPlayers([]);
                
                if (videoRef.current && videoRef.current.paused) {
                  videoRef.current.play();
                  setIsPaused(false);
                  console.log(`▶️ Resuming playback after batch identification`);
                }
              }}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                fontWeight: 'bold',
                backgroundColor: '#4CAF50',
                color: '#FFF',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)'
              }}
            >
              ✅ Identify All Players
            </button>
            
            {/* Skip Button */}
            <button
              onClick={() => {
                console.log('❌ User skipped batch identification');
                setShowBatchIdentifyModal(false);
                setBatchPlayers([]);
                
                if (videoRef.current && videoRef.current.paused) {
                  videoRef.current.play();
                  setIsPaused(false);
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor: 'transparent',
                color: '#999',
                border: 'none',
                marginTop: '10px',
                cursor: 'pointer'
              }}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* Timeout Modal - Ask for Manual Entry */}
      {showTimeoutModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#FFF',
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '450px',
            maxHeight: '90vh',
            width: '90%',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Header */}
            <div style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '15px',
              color: '#333',
              textAlign: 'center'
            }}>
              ⏱️ OCR Timeout
            </div>
            
            {/* Message */}
            <div style={{
              fontSize: '16px',
              color: '#666',
              marginBottom: '20px',
              lineHeight: '1.5',
              textAlign: 'center'
            }}>
              Couldn't identify player {currentPlayerIndex + 1} of 6 in 10 seconds.
              <br />
              <strong>Who is this player?</strong>
            </div>
            
            {/* Player Screenshot */}
            {lockedBboxImage ? (
              <div style={{
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '14px',
                  color: '#999',
                  marginBottom: '8px',
                  fontWeight: 'bold'
                }}>
                  📸 Player Image:
                </div>
                <img 
                  src={lockedBboxImage} 
                  alt="Detected player"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    border: '3px solid #FFD700',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                  }}
                  onError={(e) => {
                    console.error('❌ Failed to load bbox image');
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            ) : (
              <div style={{
                marginBottom: '20px',
                textAlign: 'center',
                padding: '20px',
                backgroundColor: '#FFF3CD',
                borderRadius: '8px',
                border: '2px dashed #FFC107'
              }}>
                <div style={{ fontSize: '14px', color: '#856404' }}>
                  ⚠️ Screenshot not available<br/>
                  <small>Check console for bbox info</small>
                </div>
              </div>
            )}
            
            {/* Jersey Number Input */}
            <div style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '10px',
              textAlign: 'center',
              fontWeight: 'bold'
            }}>
              Enter jersey number:
            </div>
            
            {/* Available Numbers - Court First, Then Bench */}
            {benchPlayers && benchPlayers.length > 0 && (
              <div style={{
                backgroundColor: '#F0F8FF',
                border: '2px solid #4CD964',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '15px'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#333',
                  marginBottom: '8px',
                  textAlign: 'center'
                }}>
                  📋 Available Jersey Numbers:
                </div>
                
                {/* On Court (Priority) */}
                {courtPlayers && courtPlayers.length > 0 && courtPlayers.some(p => p && p.number != null) && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{
                      fontSize: '11px',
                      color: '#666',
                      marginBottom: '4px',
                      fontWeight: 'bold'
                    }}>
                      🏐 On Court (most likely):
                    </div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: '#007AFF'
                    }}>
                      {courtPlayers
                        ?.filter(p => p && p.number != null)
                        .map(p => `#${p.number}`)
                        .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
                        .join('  •  ')}
                    </div>
                  </div>
                )}
                
                {/* On Bench (Alternatives) */}
                <div>
                  <div style={{
                    fontSize: '11px',
                    color: '#666',
                    marginBottom: '4px',
                    fontWeight: 'bold'
                  }}>
                    💺 Bench (alternatives):
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#555'
                  }}>
                    {benchPlayers
                      ?.filter(p => p && p.number != null)
                      .filter(p => !courtPlayers?.some(cp => cp?.number === p.number)) // Exclude court players
                      .map(p => `#${p.number}`)
                      .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
                      .join('  •  ') || 'All players on court'}
                  </div>
                </div>
              </div>
            )}
            
            {/* Jersey Number Input */}
            <input
              type="number"
              value={manualJerseyNumber}
              onChange={(e) => setManualJerseyNumber(e.target.value)}
              placeholder="Enter jersey #"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleManualSubmit();
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '18px',
                border: '2px solid #DDD',
                borderRadius: '8px',
                marginBottom: '20px',
                textAlign: 'center',
                fontWeight: 'bold'
              }}
            />
            
            {/* PRIMARY ACTION - Select from Roster */}
            <button
              onClick={() => {
                console.log('👆 User chose to select from roster');
                setShowTimeoutModal(false);
                
                // Get trackId (locked or fallback to current detection)
                let trackId = lockedTrackId;
                if (!trackId) {
                  console.warn('⚠️ No locked trackId! Using fallback...');
                  const currentPlayer = detections[currentPlayerIndex];
                  if (currentPlayer) {
                    trackId = currentPlayer.trackId;
                    console.log(`✅ Fallback: Using trackId ${trackId}`);
                  }
                }
                
                if (trackId) {
                  setShowPlayerSelector(true);
                  setSelectedTrackId(trackId);
                } else {
                  console.error('❌ No trackId available!');
                  alert('⚠️ Error: No player detected. Please try again.');
                }
              }}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                fontWeight: 'bold',
                backgroundColor: '#FF9500',
                color: '#FFF',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '15px',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              👥 Select from Roster (Recommended)
            </button>

            {/* Secondary Buttons */}
            <div style={{
              display: 'flex',
              gap: '10px',
              marginBottom: '10px'
            }}>
              {/* Keep Trying Button */}
              <button
                onClick={handleKeepTrying}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  backgroundColor: '#007AFF',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                🔄 Keep Trying OCR
              </button>
              
              {/* Submit Button */}
              <button
                onClick={handleManualSubmit}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  backgroundColor: '#4CD964',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                ✅ Submit Number
              </button>
            </div>
            
            {/* Skip Button */}
            <button
              onClick={() => {
                console.log('⏭️ User chose to skip this player');
                setShowTimeoutModal(false);
                setLockedTrackId(null); // Clear locked trackId
                setLockedBboxImage(null); // Clear bbox screenshot
                
                // Resume playback - detection loop will find next unidentified player
                if (videoRef.current && videoRef.current.paused) {
                  videoRef.current.play();
                  setIsPaused(false);
                  console.log(`▶️ Resuming playback to find next unidentified player...`);
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                backgroundColor: '#F5F5F5',
                color: '#666',
                border: '1px solid #DDD',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#E8E8E8'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#F5F5F5'}
            >
              Skip This Player →
            </button>
            
            {/* Training Note */}
            <div style={{
              marginTop: '15px',
              fontSize: '12px',
              color: '#999',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              💡 Your manual entries help improve OCR accuracy
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VideoPlayerTracking;