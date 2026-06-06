import { useEffect, useRef, useState } from "react";
import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from "@aws-sdk/client-transcribe-streaming";

const useEnhancedVoiceCommands = (
  handleCommand, 
  courtPlayers, 
  voiceEnabled, 
  gameState = {},
  transcriptionTier = 'FREE', // 'FREE' or 'PREMIUM'
  awsConfig = null, // AWS config for premium tier
  onUsageUpdate = null // Callback for usage tracking
) => {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [usageMinutes, setUsageMinutes] = useState(0);
  const [tier, setTier] = useState(transcriptionTier);
  
  // Existing refs
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);
  const handleCommandRef = useRef(handleCommand);
  const isRestartingRef = useRef(false);
  const lastRestartTime = useRef(0);
  const courtPlayersRef = useRef(courtPlayers);
  const gameStateRef = useRef(gameState);
  const consecutiveRestarts = useRef(0);
  const maxConsecutiveRestarts = useRef(3);
  const isAndroidTablet = useRef(false);
  
  // AWS Transcribe refs
  const transcribeClientRef = useRef(null);
  const audioStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const usageStartTimeRef = useRef(null);
  const audioContextRef = useRef(null);
  const micStreamRef = useRef(null);

  // Detect Android tablet (specifically Samsung devices)
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    isAndroidTablet.current = /android/.test(userAgent) && 
                             (/tablet/.test(userAgent) || /sm-t/.test(userAgent) || window.innerWidth > 768);
    
    if (isAndroidTablet.current) {
      maxConsecutiveRestarts.current = 2;
      console.log("🎙️ Android tablet detected - using conservative voice settings");
    }
  }, []);

  // Update refs without triggering re-renders
  useEffect(() => {
    handleCommandRef.current = handleCommand;
    courtPlayersRef.current = courtPlayers;
    gameStateRef.current = gameState;
  }, [handleCommand, courtPlayers, gameState]);

  // Usage tracking
  const trackUsage = (minutes) => {
    setUsageMinutes(prev => prev + minutes);
    if (onUsageUpdate) {
      onUsageUpdate(minutes);
    }
  };

  // Initialize AWS Transcribe client
  const initializeAWSTranscribe = async () => {
    if (!awsConfig) {
      console.error("🎙️ AWS config required for premium tier");
      return false;
    }

    try {
      transcribeClientRef.current = new TranscribeStreamingClient({
        region: awsConfig.region,
        credentials: awsConfig.credentials
      });
      console.log("🎙️ AWS Transcribe client initialized");
      return true;
    } catch (error) {
      console.error("🎙️ Failed to initialize AWS Transcribe:", error);
      return false;
    }
  };

  // Convert audio to AWS-compatible format
  const createAudioStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      micStreamRef.current = stream;
      
      // Create audio context for processing
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // Create async iterator for audio chunks
      const audioChunks = [];
      let isStreamActive = true;
      
      processor.onaudioprocess = (event) => {
        if (!isStreamActive) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        // Convert Float32Array to Int16Array for AWS
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        audioChunks.push(pcmData);
      };
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      // Return async iterator
      return {
        async *[Symbol.asyncIterator]() {
          while (isStreamActive) {
            if (audioChunks.length > 0) {
              const chunk = audioChunks.shift();
              yield { AudioEvent: { AudioChunk: chunk.buffer } };
            } else {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        },
        stop: () => {
          isStreamActive = false;
          if (processor) processor.disconnect();
          if (source) source.disconnect();
        }
      };
    } catch (error) {
      console.error("🎙️ Failed to create audio stream:", error);
      return null;
    }
  };

  // Start AWS Transcribe streaming
  const startAWSTranscription = async () => {
    if (!transcribeClientRef.current) {
      const initialized = await initializeAWSTranscribe();
      if (!initialized) return false;
    }

    try {
      const audioStream = await createAudioStream();
      if (!audioStream) return false;

      audioStreamRef.current = audioStream;
      usageStartTimeRef.current = Date.now();

      const command = new StartStreamTranscriptionCommand({
        LanguageCode: "en-US",
        MediaEncoding: "pcm",
        MediaSampleRateHertz: 16000,
        AudioStream: audioStream
      });

      const response = await transcribeClientRef.current.send(command);
      
      // Process transcription results
      (async () => {
        try {
          for await (const event of response.TranscriptResultStream) {
            if (event.TranscriptEvent) {
              const results = event.TranscriptEvent.Transcript.Results;
              
              for (const result of results) {
                if (!result.IsPartial && result.Alternatives && result.Alternatives.length > 0) {
                  const transcript = result.Alternatives[0].Transcript;
                  console.log("🎙️ AWS Transcribe heard:", transcript);
                  
                  // Show what we heard
                  setLastCommand(transcript);
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                  timeoutRef.current = setTimeout(() => setLastCommand(""), 2000);

                  // Parse and execute command using existing logic
                  const command = parseSimpleCommand(transcript);
                  if (command) {
                    console.log("✅ Executing AWS command:", command);
                    handleCommandRef.current(command);
                  } else {
                    console.log("❌ No AWS command found");
                  }
                }
              }
            }
          }
        } catch (streamError) {
          console.error("🎙️ AWS stream processing error:", streamError);
          setConnectionStatus("failed");
        }
      })();

      setIsListening(true);
      setConnectionStatus("connected");
      console.log("🎙️ AWS Transcribe streaming started");
      return true;
      
    } catch (error) {
      console.error("🎙️ AWS Transcribe start error:", error);
      setConnectionStatus("failed");
      return false;
    }
  };

  // Stop AWS Transcribe streaming
  const stopAWSTranscription = () => {
    try {
      // Calculate usage
      if (usageStartTimeRef.current) {
        const usageMs = Date.now() - usageStartTimeRef.current;
        const usageMinutes = usageMs / (1000 * 60);
        trackUsage(usageMinutes);
        usageStartTimeRef.current = null;
      }

      // Stop audio stream
      if (audioStreamRef.current && audioStreamRef.current.stop) {
        audioStreamRef.current.stop();
      }

      // Close microphone stream
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      audioStreamRef.current = null;
      setIsListening(false);
      setConnectionStatus("disconnected");
      console.log("🎙️ AWS Transcribe stopped");
      
    } catch (error) {
      console.error("🎙️ Error stopping AWS Transcribe:", error);
    }
  };

  // Tier switching function
  const switchTier = async (newTier) => {
    console.log(`🎙️ Switching from ${tier} to ${newTier}`);
    
    // Stop current recognition
    if (tier === 'PREMIUM') {
      stopAWSTranscription();
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (error) {
        console.log("🎙️ Error stopping Web Speech API:", error);
      }
    }
    
    setTier(newTier);
    setConnectionStatus("disconnected");
    
    // Small delay before starting new service
    setTimeout(() => {
      if (voiceEnabled) {
        startListening(newTier);
      }
    }, 1000);
  };

  // Unified start listening function
  const startListening = async (currentTier = tier) => {
    if (currentTier === 'PREMIUM') {
      return await startAWSTranscription();
    } else {
      return startWebSpeechAPI();
    }
  };

  // Enhanced parsePlayerNumbers function (keeping your existing implementation)
  const parsePlayerNumbers = (numberStr, courtPlayers) => {
    const playerNumbers = courtPlayers
      .map(p => parseInt(p.number))
      .filter(num => !isNaN(num))
      .sort((a, b) => b - a);
    
    console.log("🎯 Available player numbers for parsing:", playerNumbers);
    console.log("🎯 Trying to parse:", numberStr);
    
    if (numberStr.length === 1) {
      const singleDigit = parseInt(numberStr);
      if (playerNumbers.includes(singleDigit)) {
        console.log("🎯 Single digit optimization:", [singleDigit]);
        return [singleDigit];
      }
      console.log("🎯 Single digit not found in player numbers");
      return [];
    }
    
    if (numberStr.length >= 4) {
      console.log("🎯 Long string detected, trying multiple strategies");
      
      const digitSplit = numberStr.split('').map(Number);
      const validDigitSplit = digitSplit.filter(num => playerNumbers.includes(num));
      if (validDigitSplit.length >= 2 && validDigitSplit.length === digitSplit.length) {
        console.log("🎯 Digit split strategy succeeded:", validDigitSplit);
        return validDigitSplit;
      }
      
      const results = [];
      let pos = 0;
      while (pos < numberStr.length) {
        if (pos + 2 <= numberStr.length) {
          const twoDigit = parseInt(numberStr.substring(pos, pos + 2));
          if (playerNumbers.includes(twoDigit)) {
            results.push(twoDigit);
            pos += 2;
            continue;
          }
        }
        if (pos + 1 <= numberStr.length) {
          const oneDigit = parseInt(numberStr.substring(pos, pos + 1));
          if (playerNumbers.includes(oneDigit)) {
            results.push(oneDigit);
            pos += 1;
            continue;
          }
        }
        break;
      }
      if (pos === numberStr.length && results.length >= 2) {
        console.log("🎯 Mixed parsing strategy succeeded:", results);
        return results;
      }
    }
    
    const parseRecursive = (str, position = 0, result = []) => {
      if (position >= str.length) {
        const isValidLength = result.length >= 2 && result.length <= 3;
        console.log("🎯 Recursive parse result:", result, "Valid:", isValidLength);
        return isValidLength ? result : null;
      }
      
      for (const len of [2, 1]) {
        if (position + len <= str.length) {
          const numberStr = str.substring(position, position + len);
          const number = parseInt(numberStr);
          
          if (playerNumbers.includes(number)) {
            console.log(`🎯 Found valid player #${number} at position ${position}`);
            const parsed = parseRecursive(str, position + len, [...result, number]);
            if (parsed) return parsed;
          }
        }
      }
      
      console.log(`🎯 No valid player found at position ${position}`);
      return null;
    };
    
    const smartParsed = parseRecursive(numberStr);
    if (smartParsed && smartParsed.length > 0) {
      console.log("🎯 Recursive parsing succeeded:", smartParsed);
      return smartParsed;
    }
    
    console.log("🎯 All parsing methods failed");
    return [];
  };

  // Enhanced forceToInteger function (keeping your existing implementation)
  const forceToInteger = (text) => {
    let cleaned = text.toLowerCase().trim();
    
    cleaned = cleaned.replace(/[:\-;,\.]/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (/^\d+$/.test(cleaned)) {
      return cleaned;
    }
    
    const quickMap = {
      'zero': '0', 'one': '1', 'won': '1', 'two': '2', 'to': '2', 'too': '2', 
      'three': '3', 'tree': '3', 'four': '4', 'for': '4', 'five': '5',
      'six': '6', 'sex': '6', 'seven': '7', 'eight': '8', 'ate': '8',
      'nine': '9', 'niner': '9', 'ten': '10', 'eleven': '11', 'twelve': '12',
      'thirteen': '13', 'fourteen': '14', 'fifteen': '15', 'sixteen': '16',
      'seventeen': '17', 'eighteen': '18', 'nineteen': '19', 'twenty': '20',
      'twenty-one': '21', 'twenty one': '21', 'twenty-two': '22', 'twenty two': '22',
      'twenty-three': '23', 'twenty three': '23', 'twenty-four': '24', 'twenty four': '24',
      'twenty-five': '25', 'twenty five': '25', 'twenty-six': '26', 'twenty six': '26',
      'twenty-seven': '27', 'twenty seven': '27', 'twenty-eight': '28', 'twenty eight': '28',
      'twenty-nine': '29', 'twenty nine': '29', 'thirty': '30'
    };
    
    if (quickMap[cleaned]) {
      return quickMap[cleaned];
    }
    
    const words = cleaned.split(/\s+/);
    let converted = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (['block kill', 'block error', 'block in play', 'kill', 'error', 'ace', 'in play'].includes(word)) {
        converted.push(...words.slice(i));
        break;
      }
      
      if (word === 'to') {
        const nextWord = words[i + 1];
        if (nextWord && ['kill', 'error', 'ace', 'in', 'play'].includes(nextWord)) {
          continue;
        } else {
          converted.push('2');
        }
      }
      else if (quickMap[word]) {
        converted.push(quickMap[word]);
      } else if (/^\d+$/.test(word)) {
        converted.push(word);
      } else {
        if (!['the', 'and', 'then', 'um', 'uh'].includes(word)) {
          converted.push(word);
        }
      }
    }
    
    return converted.join(' ');
  };

  // Keep your existing parseSimpleCommand function exactly as is
  const parseSimpleCommand = (transcript) => {
    // [Your existing parseSimpleCommand implementation goes here - it's quite long so I'm not repeating it]
    // This function should remain exactly the same as in your original code
    const originalText = transcript.toLowerCase().trim();
    const gameState = gameStateRef.current;
    
    const advancedLoggingEnabled = gameState.advancedLoggingEnabled;
    
    const allowSequence = (gameState.ballState === "inplay" && !gameState.showServeZoneOverlay) ||
                         (gameState.ballState === "serve" && gameState.currentServeSide === "opponent");
    
    console.log("🎙️ Processing with context:", originalText, {
      ballState: gameState.ballState,
      showServeZoneOverlay: gameState.showServeZoneOverlay,
      showAceTargetModal: gameState.showAceTargetModal,
      blockCirclesVisible: gameState.blockCirclesVisible,
      touchCount: gameState.touches?.length || 0,
      currentServeSide: gameState.currentServeSide,
      allowSequence: allowSequence,
      advancedLoggingEnabled: advancedLoggingEnabled,
      approach: "word-first parsing",
      tier: tier // Add tier info to context
    });

    // *** NEW: ACE TARGET MODAL COMMANDS ***
    if (gameState.showAceTargetModal) {
      console.log("🎾 Processing ace target modal command:", originalText);
      
      if (originalText.match(/^(unsure|not\s+sure|don'?t\s+know|unclear|uncertain)$/)) {
        console.log("✅ Ace target: unsure");
        return {
          type: "ace_target",
          action: "unsure"
        };
      }
      
      const convertedText = forceToInteger(originalText);
      const numberMatch = convertedText.match(/^(\d+)$/);
      if (numberMatch) {
        const playerNumber = parseInt(numberMatch[1]);
        
        const player = courtPlayersRef.current.find(p => parseInt(p.number) === playerNumber);
        if (player) {
          const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
          console.log(`✅ Ace target: Player #${playerNumber} at slot ${slotIndex}`);
          return {
            type: "ace_target",
            action: "select_player",
            slotIndex: slotIndex,
            playerNumber: playerNumber,
            player: player
          };
        } else {
          console.log(`❌ Player #${playerNumber} not found on court`);
          return null;
        }
      }
      
      console.log("❌ No valid ace target command found");
      return null;
    }

    // [Continue with the rest of your parseSimpleCommand logic...]
    // I'll include just a few key parts to show the structure, but you should
    // copy your entire existing parseSimpleCommand function here

    const possibleNumber = forceToInteger(originalText);
    console.log("🔍 Number conversion result:", { original: originalText, converted: possibleNumber });
    
    if (/^\d+$/.test(possibleNumber)) {
      const playerNumber = parseInt(possibleNumber);
      const player = courtPlayersRef.current.find(p => parseInt(p.number) === playerNumber);
      if (player) {
        console.log(`✅ Converted "${originalText}" → Player ${playerNumber}`);
        const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
        return {
          type: "player_touch",
          slotIndex,
          player,
          number: playerNumber
        };
      }
    }

    // [Rest of your parsing logic goes here...]
    
    console.log("❌ No valid command found for context:", {
      text: originalText,
      ballState: gameState.ballState,
      tier: tier
    });
    return null;
  };

  // Start Web Speech API (your existing logic)
  const startWebSpeechAPI = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported");
      setConnectionStatus("not_supported");
      return false;
    }

    if (recognitionRef.current || isRestartingRef.current) {
      console.log("🎙️ Recognition already exists or restarting, skipping setup");
      return false;
    }

    console.log("🎙️ Setting up new Web Speech API recognition");
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    
    if (isAndroidTablet.current) {
      recognition.continuous = false;
      console.log("🎙️ Using single-shot mode for Android tablet");
    }

    recognition.onstart = () => {
      setIsListening(true);
      setConnectionStatus("connected");
      isRestartingRef.current = false;
      consecutiveRestarts.current = 0;
      console.log("🎙️ Web Speech API started");
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log("🎙️ Web Speech API ended");
      
      if (!voiceEnabled || isRestartingRef.current || tier !== 'FREE') {
        console.log("🎙️ Not restarting - voice disabled, manual stop, or tier changed");
        isRestartingRef.current = false;
        return;
      }
      
      if (consecutiveRestarts.current >= maxConsecutiveRestarts.current) {
        console.log(`🎙️ Too many consecutive restarts (${consecutiveRestarts.current}), pausing auto-restart`);
        setConnectionStatus("failed");
        setTimeout(() => {
          consecutiveRestarts.current = 0;
        }, 10000);
        return;
      }
      
      const now = Date.now();
      const timeSinceLastRestart = now - lastRestartTime.current;
      const minRestartDelay = isAndroidTablet.current ? 3000 : 2000;
      
      if (timeSinceLastRestart > minRestartDelay) {
        console.log("🎙️ Auto-restarting Web Speech API after silence");
        isRestartingRef.current = true;
        lastRestartTime.current = now;
        consecutiveRestarts.current += 1;
        
        const restartDelay = isAndroidTablet.current ? 2500 : 1500;
        
        setTimeout(() => {
          if (voiceEnabled && !recognitionRef.current && tier === 'FREE') {
            try {
              if (isAndroidTablet.current) {
                const newRecognition = new SpeechRecognition();
                recognitionRef.current = newRecognition;
                newRecognition.continuous = false;
                newRecognition.interimResults = false;
                newRecognition.lang = "en-US";
                
                newRecognition.onstart = recognition.onstart;
                newRecognition.onend = recognition.onend;
                newRecognition.onresult = recognition.onresult;
                newRecognition.onerror = recognition.onerror;
              }
              
              recognitionRef.current.start();
              console.log("🎙️ Web Speech API restarted successfully");
            } catch (error) {
              console.log("🎙️ Restart failed:", error.message);
              isRestartingRef.current = false;
              setConnectionStatus("failed");
              consecutiveRestarts.current += 1;
            }
          } else {
            isRestartingRef.current = false;
          }
        }, restartDelay);
      } else {
        console.log(`🎙️ Restart skipped - too soon (${timeSinceLastRestart}ms ago)`);
        isRestartingRef.current = false;
        consecutiveRestarts.current += 1;
      }
    };

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;

      const transcript = result[0].transcript;
      console.log("🎙️ Web Speech API heard:", transcript);

      setLastCommand(transcript);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setLastCommand(""), 2000);

      const command = parseSimpleCommand(transcript);
      if (command) {
        console.log("✅ Executing Web Speech command:", command);
        handleCommandRef.current(command);
      } else {
        console.log("❌ No Web Speech command found");
      }
      
      if (isAndroidTablet.current && voiceEnabled && tier === 'FREE') {
        setTimeout(() => {
          if (voiceEnabled && !isRestartingRef.current) {
            console.log("🎙️ Single-shot restart for tablet");
            try {
              recognition.start();
            } catch (error) {
              console.log("🎙️ Single-shot restart failed:", error.message);
              setConnectionStatus("failed");
            }
          }
        }, 500);
      }
    };

    recognition.onerror = (event) => {
      console.log("🎙️ Web Speech API Error:", event.error);
      isRestartingRef.current = false;
      
      if (event.error === 'not-allowed') {
        setConnectionStatus("mic_denied");
        return;
      }
      
      if (event.error === 'no-speech') {
        console.log("🎙️ No speech detected - this is normal");
        return;
      }
      
      if (event.error === 'aborted') {
        console.log("🎙️ Recognition aborted - likely manual stop");
        setConnectionStatus("disconnected");
        return;
      }
      
      console.log("🎙️ Setting status to failed due to error:", event.error);
      setConnectionStatus("failed");
      consecutiveRestarts.current += 1;
      
      if (voiceEnabled && event.error === 'network') {
        const networkRetryDelay = isAndroidTablet.current ? 5000 : 3000;
        setTimeout(() => {
          if (voiceEnabled && recognitionRef.current && !isRestartingRef.current) {
            console.log("🎙️ Attempting restart after network error");
            try {
              recognition.start();
            } catch (error) {
              console.log("🎙️ Network error restart failed:", error.message);
            }
          }
        }, networkRetryDelay);
      }
    };

    try {
      recognition.start();
      setConnectionStatus("connecting");
      return true;
    } catch (error) {
      console.error("🎙️ Failed to start Web Speech API:", error);
      setConnectionStatus("failed");
      isRestartingRef.current = false;
      return false;
    }
  };

  // Main effect for starting/stopping voice recognition
  useEffect(() => {
    if (!voiceEnabled) {
      console.log("🎙️ Voice disabled - cleaning up");
      
      if (tier === 'PREMIUM') {
        stopAWSTranscription();
      } else if (recognitionRef.current) {
        try {
          isRestartingRef.current = true;
          recognitionRef.current.stop();
          recognitionRef.current = null;
        } catch (error) {
          console.log("🎙️ Error stopping recognition:", error.message);
        }
      }
      
      setIsListening(false);
      setConnectionStatus("disabled");
      isRestartingRef.current = false;
      consecutiveRestarts.current = 0;
      return;
    }

    // Start the appropriate recognition service
    startListening();

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      if (tier === 'PREMIUM') {
        stopAWSTranscription();
      } else if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.log("🎙️ Stop failed:", error);
        }
        recognitionRef.current = null;
      }
      
      setIsListening(false);
      setConnectionStatus("disconnected");
      isRestartingRef.current = false;
      consecutiveRestarts.current = 0;
    };
  }, [voiceEnabled, tier]); // Now depends on both voiceEnabled and tier

  // Manual restart function
  const manualRestart = () => {
    console.log("🎙️ Manual restart requested for tier:", tier);
    
    const now = Date.now();
    const timeSinceLastRestart = now - lastRestartTime.current;
    const minManualRestartDelay = isAndroidTablet.current ? 5000 : 3000;
    
    if (timeSinceLastRestart < minManualRestartDelay) {
      console.log(`🎙️ Manual restart too soon (${timeSinceLastRestart}ms ago), ignoring`);
      return false;
    }
    
    if (!voiceEnabled) {
      console.log("🎙️ Cannot restart - voice commands are disabled");
      return false;
    }
    
    consecutiveRestarts.current = 0;
    isRestartingRef.current = true;
    lastRestartTime.current = now;
    setConnectionStatus("connecting");
    
    // Stop current service
    if (tier === 'PREMIUM') {
      stopAWSTranscription();
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (error) {
        console.log("🎙️ Error stopping for manual restart:", error.message);
      }
    }
    
    const manualRestartDelay = isAndroidTablet.current ? 2000 : 1000;
    setTimeout(() => {
      if (voiceEnabled) {
        isRestartingRef.current = false;
        startListening();
      }
    }, manualRestartDelay);
    
    return true;
  };

  return {
    isListening,
    lastCommand,
    connectionStatus,
    usageMinutes,
    tier,
    manualRestart,
    switchTier,
    // Additional info for UI
    isPremium: tier === 'PREMIUM',
    canUpgrade: tier === 'FREE' && awsConfig,
    accuracyLevel: tier === 'PREMIUM' ? 'High (95%+)' : 'Standard (80%+)'
  };
};

export default useEnhancedVoiceCommands;