import { useEffect, useRef, useState, useMemo } from "react";

const useMobileOptimizedVoiceCommands = (handleCommand, courtPlayers, voiceEnabled, gameState = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);
  const handleCommandRef = useRef(handleCommand);
  const courtPlayersRef = useRef(courtPlayers);
  const gameStateRef = useRef(gameState);
  const sessionActiveRef = useRef(false);
  const lastStartTime = useRef(0);

  // Detect mobile device once
  const isMobile = useMemo(() => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
  }, []);

  // Update refs without triggering re-renders
  useEffect(() => {
    handleCommandRef.current = handleCommand;
    courtPlayersRef.current = courtPlayers;
    gameStateRef.current = gameState;
  }, [handleCommand, courtPlayers, gameState]);

  // Cached number map for performance
  const numberMap = useMemo(() => ({
    'zero': '0', 'oh': '0',
    'one': '1', 'won': '1',
    'two': '2', 'to': '2', 'too': '2',
    'three': '3', 'tree': '3',
    'four': '4', 'for': '4',
    'five': '5', 'six': '6',
    'seven': '7', 'eight': '8', 'ate': '8',
    'nine': '9', 'ten': '10',
    'eleven': '11', 'twelve': '12'
  }), []);

  // Simplified parsing for mobile performance
  const parseCommand = (transcript) => {
    const text = transcript.toLowerCase().trim();
    const gameState = gameStateRef.current;
    
    // Early exit for empty text
    if (!text) return null;

    // Priority 1: Modal contexts (highest priority)
    if (gameState.showAceTargetModal) {
      if (/^(unsure|not sure|don'?t know)$/.test(text)) {
        return { type: "ace_target", action: "unsure" };
      }
      
      const num = parseInt(text);
      if (!isNaN(num)) {
        const player = courtPlayersRef.current.find(p => parseInt(p.number) === num);
        if (player) {
          const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
          return {
            type: "ace_target",
            action: "select_player",
            slotIndex,
            playerNumber: num
          };
        }
      }
    }

    // Priority 2: Simple number conversion and player touches
    let processedText = text;
    
    // Quick number word replacement (only common ones for performance)
    for (const [word, digit] of Object.entries(numberMap)) {
      if (processedText === word) {
        processedText = digit;
        break;
      }
    }

    // Single number for player touch
    const num = parseInt(processedText);
    if (!isNaN(num) && processedText === num.toString()) {
      const player = courtPlayersRef.current.find(p => parseInt(p.number) === num);
      if (player) {
        const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
        return {
          type: "player_touch",
          slotIndex,
          player,
          number: num
        };
      }
    }

    // Priority 3: Serve zone (only when overlay active)
    if (gameState.showServeZoneOverlay && gameState.ballState === "serve") {
      if (/^(unsure|not sure)$/.test(text)) {
        return { type: "serve_zone", action: "unsure" };
      }
      
      const zoneMatch = text.match(/^(?:zone )?(\d+(?:-\d+)?)$/);
      if (zoneMatch) {
        return {
          type: "serve_zone",
          action: "select_zone",
          zone: zoneMatch[1]
        };
      }
    }

    // Priority 4: Error types (simplified)
    if (/^(out|net|foot fault)$/.test(text)) {
      if (gameState.showErrorTypeModal || gameState.showServeZoneOverlay) {
        const errorType = text.includes("net") ? "In Net" :
                         text.includes("foot") ? "Foot Fault" : "Out";
        return {
          type: "serve_zone",
          action: "service_error",
          errorType
        };
      }
    }

    // Priority 5: Simple actions (optimized lookup)
    const actionMap = {
      'ace': { type: 'serve_action', action: 'Ace' },
      'kill': { type: 'rally_action', action: 'Kill' },
      'error': { type: 'contextual', action: 'Error' },
      'out': { type: 'rally_action', action: 'Error' },
      'net': { type: 'rally_action', action: 'Error' },
      'in play': { type: 'contextual', action: 'InPlay' },
      'good': { type: 'contextual', action: 'InPlay' },
      'rotate': { type: 'court_action', action: 'rotate' },
      'switch serve': { type: 'court_action', action: 'switch_serve' },
      'undo': { type: 'court_action', action: 'undo' },
      'replay': { type: 'court_action', action: 'replay' }
    };

    const command = actionMap[text];
    if (command) {
      // Handle contextual actions
      if (command.type === 'contextual') {
        if (gameState.ballState === 'serve') {
          return { type: 'serve_action', action: command.action };
        } else if (gameState.ballState === 'inplay') {
          return { type: 'rally_action', action: command.action };
        }
      }
      
      // Validate context
      if (command.type === 'serve_action' && gameState.ballState === 'serve') return command;
      if (command.type === 'rally_action' && gameState.ballState === 'inplay') return command;
      if (command.type === 'court_action') return command;
    }

    // Priority 6: Number sequences (simplified for mobile)
    const allowSequence = (gameState.ballState === "inplay" && !gameState.showServeZoneOverlay) ||
                         (gameState.ballState === "serve" && gameState.currentServeSide === "opponent");
    
    if (allowSequence) {
      const sequenceMatch = text.match(/^(.+) (kill|error|ace|in play)$/);
      if (sequenceMatch) {
        const numberPart = sequenceMatch[1];
        const result = sequenceMatch[2];
        
        // Quick space-separated number parsing
        const numbers = numberPart.split(' ')
          .map(s => {
            const mapped = numberMap[s];
            return mapped ? parseInt(mapped) : parseInt(s);
          })
          .filter(n => !isNaN(n) && courtPlayersRef.current.some(p => parseInt(p.number) === n));
        
        if (numbers.length >= 2) {
          return {
            type: "sequence",
            numbers,
            result
          };
        }
      }
    }

    return null;
  };

  // Mobile-optimized recognition setup
  useEffect(() => {
    if (!voiceEnabled) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsListening(false);
      setConnectionStatus("disabled");
      sessionActiveRef.current = false;
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setConnectionStatus("not_supported");
      return;
    }

    if (recognitionRef.current && sessionActiveRef.current) {
      return; // Already active
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    // Mobile-optimized configuration
    recognition.continuous = false; // Disable continuous on mobile for better performance
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setConnectionStatus("connected");
      sessionActiveRef.current = true;
      lastStartTime.current = Date.now();
    };

    recognition.onend = () => {
      setIsListening(false);
      sessionActiveRef.current = false;
      
      // On mobile, don't auto-restart immediately - wait for manual trigger
      setConnectionStatus("disconnected");
    };

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;

      const transcript = result[0].transcript.trim();
      
      // Show what we heard
      setLastCommand(transcript);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setLastCommand(""), 2000);

      // Parse and execute command
      const command = parseCommand(transcript);
      if (command) {
        handleCommandRef.current(command);
        
        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }

      // Auto-restart with delay for mobile (less aggressive)
      if (voiceEnabled) {
        setTimeout(() => {
          if (voiceEnabled && !sessionActiveRef.current) {
            manualRestart();
          }
        }, 1000); // Longer delay for better performance
      }
    };

    recognition.onerror = (event) => {
      sessionActiveRef.current = false;
      
      if (event.error === 'not-allowed') {
        setConnectionStatus("mic_denied");
        return;
      }
      
      if (event.error === 'no-speech') {
        setConnectionStatus("disconnected");
        return;
      }
      
      setConnectionStatus("failed");
    };

    // Start recognition
    try {
      recognition.start();
      setConnectionStatus("connecting");
    } catch (error) {
      setConnectionStatus("failed");
      sessionActiveRef.current = false;
    }

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          // Ignore cleanup errors
        }
        recognitionRef.current = null;
      }
      setIsListening(false);
      setConnectionStatus("disconnected");
      sessionActiveRef.current = false;
    };
  }, [voiceEnabled]);

  // Simplified manual restart
  const manualRestart = () => {
    if (!voiceEnabled) return false;
    
    const now = Date.now();
    if (now - lastStartTime.current < 1000) return false; // Prevent rapid restarts
    
    sessionActiveRef.current = false;
    setConnectionStatus("connecting");
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (error) {
        // Ignore stop errors
      }
    }
    
    // Restart after cleanup
    setTimeout(() => {
      if (voiceEnabled) {
        try {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = "en-US";
            recognition.maxAlternatives = 1;
            
            recognition.onstart = () => {
              setIsListening(true);
              setConnectionStatus("connected");
              sessionActiveRef.current = true;
              lastStartTime.current = Date.now();
            };
            
            recognition.onend = () => {
              setIsListening(false);
              sessionActiveRef.current = false;
              setConnectionStatus("disconnected");
            };
            
            recognition.onresult = (event) => {
              const result = event.results[event.results.length - 1];
              if (!result.isFinal) return;
              
              const transcript = result[0].transcript.trim();
              setLastCommand(transcript);
              
              const command = parseCommand(transcript);
              if (command) {
                handleCommandRef.current(command);
                if (navigator.vibrate) navigator.vibrate(50);
              }
              
              // Auto-restart with delay
              if (voiceEnabled) {
                setTimeout(() => {
                  if (voiceEnabled && !sessionActiveRef.current) {
                    manualRestart();
                  }
                }, 1000);
              }
            };
            
            recognition.onerror = (event) => {
              sessionActiveRef.current = false;
              setConnectionStatus(event.error === 'not-allowed' ? "mic_denied" : "failed");
            };
            
            recognition.start();
            return true;
          }
        } catch (error) {
          setConnectionStatus("failed");
          return false;
        }
      }
      return false;
    }, 100);
    
    return true;
  };

  return {
    isListening,
    lastCommand,
    connectionStatus,
    manualRestart,
    isMobile
  };
};

export default useMobileOptimizedVoiceCommands;