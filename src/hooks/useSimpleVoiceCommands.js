// Reverted to pre-July state (2025-07-25) — removed native iOS plugin, AudioContext, command queue
import { useEffect, useRef, useState } from "react";

const useSimpleVoiceCommands = (handleCommand, courtPlayers, voiceEnabled, gameState = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  
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

  // Detect Android tablet (specifically Samsung devices)
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    isAndroidTablet.current = /android/.test(userAgent) && 
                             (/tablet/.test(userAgent) || /sm-t/.test(userAgent) || window.innerWidth > 768);
    
    // Samsung tablets need more conservative restart behavior
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

  // ENHANCED: Rapid-fire optimized number parsing for volleyball sequences
  const parsePlayerNumbers = (numberStr, courtPlayers) => {
    const playerNumbers = courtPlayers
      .map(p => parseInt(p.number))
      .filter(num => !isNaN(num))
      .sort((a, b) => b - a); // Sort descending to try 2-digit numbers first
    
    console.log("⚡ Rapid parsing:", numberStr, "Available:", playerNumbers);
    
    // OPTIMIZATION: Handle single digits immediately
    if (numberStr.length === 1) {
      const singleDigit = parseInt(numberStr);
      if (playerNumbers.includes(singleDigit)) {
        console.log("⚡ Single digit optimization:", [singleDigit]);
        return [singleDigit];
      }
      console.log("⚡ Single digit not found in player numbers");
      return [];
    }
    
    // RAPID PARSING: For 2-6 character strings (typical volleyball sequences)
    if (numberStr.length >= 2 && numberStr.length <= 6) {
      console.log("⚡ Rapid sequence parsing for volleyball pace");
      
      // Strategy 1: Try all valid 2-3 touch combinations efficiently
      const combinations = [];
      
      // 2-touch combinations (most common)
      for (let i = 1; i < numberStr.length; i++) {
        const first = parseInt(numberStr.substring(0, i));
        const second = parseInt(numberStr.substring(i));
        if (playerNumbers.includes(first) && playerNumbers.includes(second)) {
          combinations.push([first, second]);
        }
      }
      
      // 3-touch combinations (full volleyball sequence)
      for (let i = 1; i < numberStr.length - 1; i++) {
        for (let j = i + 1; j < numberStr.length; j++) {
          const first = parseInt(numberStr.substring(0, i));
          const second = parseInt(numberStr.substring(i, j));
          const third = parseInt(numberStr.substring(j));
          if (playerNumbers.includes(first) && playerNumbers.includes(second) && playerNumbers.includes(third)) {
            combinations.push([first, second, third]);
          }
        }
      }
      
      // Prefer 3-touch (complete volleyball play), then 2-touch
      const best = combinations.find(c => c.length === 3) || combinations.find(c => c.length === 2);
      if (best) {
        console.log("⚡ Rapid parsing success:", best);
        return best;
      }
      
      // Fallback: All single digits for very fast speech
      if (numberStr.length >= 2) {
        const digitSplit = numberStr.split('').map(Number);
        const validDigitSplit = digitSplit.filter(num => playerNumbers.includes(num));
        if (validDigitSplit.length >= 2 && validDigitSplit.length === digitSplit.length) {
          console.log("⚡ Digit split fallback:", validDigitSplit);
          return validDigitSplit;
        }
      }
    }
    
    // LONGER SEQUENCES: Keep original complex parsing for edge cases
    if (numberStr.length >= 4) {
      console.log("⚡ Long string detected, trying comprehensive strategies");
      
      // Strategy 1: Try all 1-digit splits: "1521" → [1, 5, 2, 1]
      const digitSplit = numberStr.split('').map(Number);
      const validDigitSplit = digitSplit.filter(num => playerNumbers.includes(num));
      if (validDigitSplit.length >= 2 && validDigitSplit.length === digitSplit.length) {
        console.log("⚡ Digit split strategy succeeded:", validDigitSplit);
        return validDigitSplit;
      }
      
      // Strategy 2: Try mixed 2-digit and 1-digit parsing
      const results = [];
      let pos = 0;
      while (pos < numberStr.length) {
        // Try 2-digit first
        if (pos + 2 <= numberStr.length) {
          const twoDigit = parseInt(numberStr.substring(pos, pos + 2));
          if (playerNumbers.includes(twoDigit)) {
            results.push(twoDigit);
            pos += 2;
            continue;
          }
        }
        // Fall back to 1-digit
        if (pos + 1 <= numberStr.length) {
          const oneDigit = parseInt(numberStr.substring(pos, pos + 1));
          if (playerNumbers.includes(oneDigit)) {
            results.push(oneDigit);
            pos += 1;
            continue;
          }
        }
        // If we can't match anything, stop
        break;
      }
      if (pos === numberStr.length && results.length >= 2) {
        console.log("⚡ Mixed parsing strategy succeeded:", results);
        return results;
      }
    }
    
    console.log("⚡ All parsing methods failed");
    return [];
  };

  // ENHANCED: Rapid word-to-number conversion optimized for volleyball pace
  const forceToInteger = (text) => {
    let cleaned = text.toLowerCase().trim();
    
    // Remove common speech recognition punctuation first
    cleaned = cleaned.replace(/[:\-;,\.]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Direct number match first
    if (/^\d+$/.test(cleaned)) {
      return cleaned;
    }
    
    // ENHANCED: Expanded word-to-digit conversion with volleyball-specific mishears
    const quickMap = {
      'zero': '0', 'oh': '0',
      'one': '1', 'won': '1', 'want': '1',
      'two': '2', 'to': '2', 'too': '2', 'tue': '2',
      'three': '3', 'tree': '3', 'free': '3',
      'four': '4', 'for': '4', 'fore': '4',
      'five': '5', 'fife': '5',
      'six': '6', 'sex': '6', 'sick': '6',
      'seven': '7', 'sev': '7',
      'eight': '8', 'ate': '8', 'ait': '8',
      'nine': '9', 'niner': '9', 'night': '9',
      'ten': '10',
      'eleven': '11', 'elev': '11',
      'twelve': '12', 'twel': '12',
      'thirteen': '13', 'thir': '13',
      'fourteen': '14', 'four': '14',
      'fifteen': '15', 'fif': '15',
      'sixteen': '16', 'six': '16',
      'seventeen': '17', 'sev': '17',
      'eighteen': '18', 'eigh': '18',
      'nineteen': '19', 'nine': '19',
      'twenty': '20',
      'twenty-one': '21', 'twenty one': '21',
      'twenty-two': '22', 'twenty two': '22',
      'twenty-three': '23', 'twenty three': '23',
      'twenty-four': '24', 'twenty four': '24',
      'twenty-five': '25', 'twenty five': '25',
      'twenty-six': '26', 'twenty six': '26',
      'twenty-seven': '27', 'twenty seven': '27',
      'twenty-eight': '28', 'twenty eight': '28',
      'twenty-nine': '29', 'twenty nine': '29',
      'thirty': '30'
    };
    
    // Try direct word replacement first
    if (quickMap[cleaned]) {
      return quickMap[cleaned];
    }
    
    // RAPID CONVERSION: Handle sequences with mixed words and numbers optimized for speed
    const words = cleaned.split(/\s+/);
    let converted = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Check if this is an action word (kill, error, ace, etc.)
      if (['block', 'kill', 'error', 'ace', 'in', 'play'].includes(word)) {
        // Keep the rest as-is for action parsing
        converted.push(...words.slice(i));
        break;
      }
      
      // Special handling for "to" - only convert if it's clearly meant as "two"
      if (word === 'to') {
        // Don't convert "to" if it's followed by an action word (likely a filler)
        const nextWord = words[i + 1];
        if (nextWord && ['kill', 'error', 'ace', 'in', 'play'].includes(nextWord)) {
          // Skip this filler word
          continue;
        } else {
          // Convert to "2" if it seems to be a number
          converted.push('2');
        }
      }
      // Convert number words to digits
      else if (quickMap[word]) {
        converted.push(quickMap[word]);
      } else if (/^\d+$/.test(word)) {
        // Keep existing numbers
        converted.push(word);
      } else {
        // Filter out common filler words but keep unknown words
        if (!['the', 'and', 'then', 'um', 'uh'].includes(word)) {
          converted.push(word);
        }
      }
    }
    
    const result = converted.join(' ');
    console.log("⚡ Rapid conversion:", { original: text, result });
    return result;
  };

  // ENHANCED: Context-aware command parsing optimized for volleyball pace
  const parseSimpleCommand = (transcript) => {
    const originalText = transcript.toLowerCase().trim();
    const gameState = gameStateRef.current;
    
    // Get advanced logging setting from game state
    const advancedLoggingEnabled = gameState.advancedLoggingEnabled;
    
    // Calculate allowSequence using current game state
    const allowSequence = (gameState.ballState === "inplay" && !gameState.showServeZoneOverlay) ||
                         (gameState.ballState === "serve" && gameState.currentServeSide === "opponent");
    
    console.log("⚡ Processing rapid command:", originalText, {
      ballState: gameState.ballState,
      showServeZoneOverlay: gameState.showServeZoneOverlay,
      showAceTargetModal: gameState.showAceTargetModal,
      blockCirclesVisible: gameState.blockCirclesVisible,
      touchCount: gameState.touches?.length || 0,
      currentServeSide: gameState.currentServeSide,
      allowSequence: allowSequence,
      advancedLoggingEnabled: advancedLoggingEnabled,
      approach: "rapid volleyball parsing"
    });

    // *** ACE TARGET MODAL COMMANDS (keep existing) ***
    if (gameState.showAceTargetModal) {
      console.log("🎾 Processing ace target modal command:", originalText);
      
      // Handle "unsure" command
      if (originalText.match(/^(unsure|not\s+sure|don'?t\s+know|unclear|uncertain)$/)) {
        console.log("✅ Ace target: unsure");
        return {
          type: "ace_target",
          action: "unsure"
        };
      }
      
      // Handle player number commands
      const convertedText = forceToInteger(originalText);
      const numberMatch = convertedText.match(/^(\d+)$/);
      if (numberMatch) {
        const playerNumber = parseInt(numberMatch[1]);
        
        // Find the player by jersey number
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

    // *** ERROR CLASSIFICATION (keep existing) ***
    if (gameState.errorContext && gameState.awaitingRefBlownDecision) {
      console.log("🚨 Processing error classification command:", originalText);
      
      // Handle referee decision commands
      if (originalText.match(/^(yes|referee|ref\s+blown|ref\s+error|blown\s+error)$/)) {
        console.log("✅ Voice selected: Referee error");
        return {
          type: "error_classification",
          action: "referee_error"
        };
      }
      
      if (originalText.match(/^(no|player\s+error|player|not\s+ref|not\s+referee)$/)) {
        console.log("✅ Voice selected: Player error");
        return {
          type: "error_classification", 
          action: "player_error"
        };
      }
      
      if (originalText.match(/^(dismiss|cancel|nevermind|never\s+mind)$/)) {
        console.log("✅ Voice selected: Dismiss");
        return {
          type: "error_classification",
          action: "dismiss"
        };
      }
      
      console.log("❌ No valid referee decision command found");
      return null;
    }

    if (gameState.errorContext && !gameState.awaitingRefBlownDecision) {
      console.log("🚨 Processing error type command:", originalText);
      
      // Handle error type selection based on touch count
      const touchCount = gameState.errorContext.touchCount;
      
      if (touchCount === 1) {
        if (originalText.match(/^(receiving\s+error|receive\s+error|reception\s+error|receiving)$/)) {
          console.log("✅ Voice selected: Receiving error");
          return {
            type: "error_classification",
            action: "select_error_type",
            errorType: "Receiving"
          };
        }
        
        if (originalText.match(/^(attacking\s+error|attack\s+error|attacking|attack)$/)) {
          console.log("✅ Voice selected: Attacking error");
          return {
            type: "error_classification",
            action: "select_error_type", 
            errorType: "Attacking"
          };
        }
      } else if (touchCount === 2) {
        if (originalText.match(/^(setting\s+error|set\s+error|setting|set)$/)) {
          console.log("✅ Voice selected: Setting error");
          return {
            type: "error_classification",
            action: "select_error_type",
            errorType: "Setting"
          };
        }
        
        if (originalText.match(/^(attacking\s+error|attack\s+error|attacking|attack)$/)) {
          console.log("✅ Voice selected: Attacking error");
          return {
            type: "error_classification",
            action: "select_error_type",
            errorType: "Attacking"
          };
        }
      }
      
      // Generic dismiss command
      if (originalText.match(/^(dismiss|cancel|nevermind|never\s+mind)$/)) {
        console.log("✅ Voice selected: Dismiss");
        return {
          type: "error_classification",
          action: "dismiss"
        };
      }
      
      console.log("❌ No valid error type command found");
      return null;
    }  
    
    // RAPID OPTIMIZATION: Force integer conversion first for all number inputs
    const possibleNumber = forceToInteger(originalText);
    console.log("⚡ Rapid number conversion:", { original: originalText, converted: possibleNumber });
    
    // If we got a pure number, try player touch immediately
    if (/^\d+$/.test(possibleNumber)) {
      const playerNumber = parseInt(possibleNumber);
      const player = courtPlayersRef.current.find(p => parseInt(p.number) === playerNumber);
      if (player) {
        console.log(`⚡ Rapid single player: "${originalText}" → Player ${playerNumber}`);
        const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
        return {
          type: "player_touch",
          slotIndex,
          player,
          number: playerNumber
        };
      }
    }
    
    // Use converted text for all subsequent parsing
    const convertedForParsing = forceToInteger(originalText);
    
    // Single numbers (player touches) - CONTEXT CHECK
    const numberMatch = convertedForParsing.match(/^(\d+)$/);
    if (numberMatch) {
      const playerNumber = parseInt(numberMatch[1]);
      const player = courtPlayersRef.current.find(p => parseInt(p.number) === playerNumber);
      if (player) {
        const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
        return {
          type: "player_touch",
          slotIndex,
          player,
          number: playerNumber
        };
      }
    }

    // *** CONTEXT-AWARE ZONE PARSING (keep existing) ***
    const zoneMatch = convertedForParsing.match(/^(?:zone\s+)?(\d+(?:-\d+)?)(?:\s+zone)?$/);
    if (zoneMatch && gameState.showServeZoneOverlay && gameState.ballState === "serve") {
      const zone = zoneMatch[1];
      console.log("✅ Zone command in correct context:", zone);
      return {
        type: "serve_zone",
        action: "select_zone",
        zone: zone
      };
    } else if (zoneMatch) {
      console.log("❌ Zone command ignored - not in serve zone overlay mode");
    }

    // Zone uncertainty - only in serve zone context
    if (originalText.match(/^(unsure|not\s+sure|don'?t\s+know|unclear)$/) && 
        gameState.showServeZoneOverlay) {
      return {
        type: "serve_zone",
        action: "unsure"
      };
    }

    // Service error types (keep existing)
    const serviceErrorMatch = convertedForParsing.match(/^(out|in\s*net|net|foot\s*fault|in\s+net)$/);
    if (serviceErrorMatch || originalText.match(/^(out|in\s*net|net|foot\s*fault|in\s+net)$/)) {
      if (gameState.showErrorTypeModal || gameState.showServeZoneOverlay) {
        const errorText = serviceErrorMatch ? serviceErrorMatch[1] : originalText.match(/^(out|in\s*net|net|foot\s*fault|in\s+net)$/)[1];
        const errorType = errorText.includes("net") ? "In Net" :
                         errorText.includes("foot") ? "Foot Fault" : "Out";
        return {
          type: "serve_zone",
          action: "service_error",
          errorType: errorType
        };
      }
      return {
        type: "result_only",
        result: "error"
      };
    }

    // Handle alternative service error phrasings
    if (originalText.match(/^(service\s+error|serve\s+error)\s+(out|net|foot\s*fault)$/)) {
      const errorPart = originalText.split(/\s+/).slice(-1)[0];
      const errorType = errorPart.includes("net") ? "In Net" :
                       errorPart.includes("foot") ? "Foot Fault" : "Out";
      return {
        type: "serve_zone",
        action: "service_error", 
        errorType: errorType
      };
    }

    if (originalText.match(/^foot\s+fault$/)) {
      return {
        type: "serve_zone",
        action: "service_error",
        errorType: "Foot Fault"
      };
    }

    // ENHANCED: Rapid number sequences with results - optimized for volleyball pace
    const sequenceWithResultMatch = originalText.match(/^([\w\d\s:;\-,\.]+)\s+(kill|error|ace|in\s+play)$/);
    if (sequenceWithResultMatch) {
      let numberPart = sequenceWithResultMatch[1];
      const result = sequenceWithResultMatch[2];
      
      // Convert any word numbers in the sequence FIRST
      numberPart = forceToInteger(numberPart);
      console.log("⚡ After rapid word-to-number conversion:", numberPart);
      
      if (allowSequence) {
        console.log("⚡ Raw number part before cleaning:", numberPart);
        
        let numbers;
        
        // Clean up and parse the converted numbers
        numberPart = numberPart
          .replace(/[:\-;,\.]/g, ' ')  // Replace punctuation with spaces
          .replace(/\s+/g, ' ')        // Normalize multiple spaces
          .trim();
        
        console.log("⚡ Cleaned number part:", numberPart);
        
        // RAPID PARSING: Handle both space-separated and concatenated
        if (numberPart.includes(' ')) {
          // Space-separated numbers (most reliable for rapid speech)
          numbers = numberPart.split(/\s+/)
            .map(s => parseInt(s))
            .filter(n => !isNaN(n));
        } else {
          // Concatenated - use rapid parsing optimized for volleyball
          numbers = parsePlayerNumbers(numberPart, courtPlayersRef.current);
        }
        
        console.log("⚡ Rapid parsed numbers:", numbers);
        
        // Validate that all numbers correspond to actual players
        const validNumbers = numbers.filter(num => 
          courtPlayersRef.current.some(p => parseInt(p.number) === num)
        );
        
        console.log("⚡ Valid player numbers found:", validNumbers);
        
        if (validNumbers.length >= 2) {
          console.log("⚡ Rapid sequence with result:", { numbers: validNumbers, result });
          return {
            type: "sequence",
            numbers: validNumbers,
            result
          };
        } else {
          console.log("❌ Not enough valid player numbers in sequence");
        }
      } else {
        console.log("❌ Sequence ignored - not in correct game state");
      }
    }

    // ENHANCED: Rapid number sequences without results - optimized for volleyball
    const sequenceMatch = originalText.match(/^([\w\d\s:;\-,\.]+)$/);
    if (sequenceMatch) {
      let numberString = sequenceMatch[1];
      
      // Convert words to numbers first
      numberString = forceToInteger(numberString);
      console.log("⚡ After rapid word-to-number conversion:", numberString);
      
      // Only parse multi-digit sequences if we're in play
      if (allowSequence) {
        console.log("⚡ Raw sequence before cleaning:", numberString);
        
        // Clean up and parse
        numberString = numberString
          .replace(/[:\-;,\.]/g, ' ')  // Replace punctuation with spaces
          .replace(/\s+/g, ' ')        // Normalize multiple spaces
          .trim();
        
        console.log("⚡ Cleaned sequence:", numberString);
        
        let numbers;
        if (numberString.includes(' ')) {
          // Space-separated numbers (most reliable)
          numbers = numberString.split(/\s+/)
            .map(s => parseInt(s))
            .filter(n => !isNaN(n));
        } else {
          // Single concatenated string: use rapid parsing for volleyball
          numbers = parsePlayerNumbers(numberString, courtPlayersRef.current);
        }
        
        console.log("⚡ Rapid parsed numbers:", numbers);
        
        // Validate that all numbers correspond to actual players
        const validNumbers = numbers.filter(num => 
          courtPlayersRef.current.some(p => parseInt(p.number) === num)
        );
        
        console.log("⚡ Valid player numbers found:", validNumbers);
        
        if (validNumbers.length >= 2) {
          console.log("⚡ Rapid multi-player sequence:", validNumbers);
          return {
            type: "player_sequence",
            numbers: validNumbers
          };
        } else {
          console.log("❌ Not enough valid player numbers for sequence");
        }
      } else {
        console.log("❌ Multi-digit sequence ignored - not in play mode");
        
        // If it's a single digit concealed in punctuation, try to extract it
        const cleanedForSingle = numberString.replace(/[^\d]/g, '');
        if (cleanedForSingle.length === 1) {
          const playerNumber = parseInt(cleanedForSingle);
          const player = courtPlayersRef.current.find(p => parseInt(p.number) === playerNumber);
          if (player) {
            console.log(`⚡ Extracted single player ${playerNumber} from ${numberString}`);
            const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
            return {
              type: "player_touch",
              slotIndex,
              player,
              number: playerNumber
            };
          }
        }
      }
    }

    // Block actions (keep existing functionality)
    if (gameState.ballState === "inplay" && gameState.blockCirclesVisible) {
      // Original simple block commands
      if (originalText.match(/^(block\s+kill|stuff|roofed)$/)) {
        return { type: "block_action", action: "Kill" };
      }
      if (originalText.match(/^(block\s+error|block\s+net)$/)) {
        return { type: "block_action", action: "Error" };
      }
      if (originalText.match(/^(block\s+in play|deflection|in place)$/)) {
        return { type: "block_action", action: "InPlay" };
      }

      // Enhanced block sequences with player numbers
      const blockFirstMatch = originalText.match(/^block\s+(kill|error|in\s+play)\s+([\w\d\s:;\-,\.]+)$/);
      if (blockFirstMatch) {
        const result = blockFirstMatch[1];
        let numberPart = blockFirstMatch[2];
        
        // Convert words to numbers
        numberPart = forceToInteger(numberPart);
        console.log("⚡ Block-first pattern - converted numbers:", numberPart);
        
        // OPTIMIZATION: Handle single digits directly first
        if (/^\d+$/.test(numberPart.trim())) {
          const singleNumber = parseInt(numberPart.trim());
          const player = courtPlayersRef.current.find(p => parseInt(p.number) === singleNumber);
          if (player) {
            console.log("⚡ Single player block (optimized path):", { number: singleNumber, result });
            return {
              type: "block_sequence",
              numbers: [singleNumber],
              result: result
            };
          }
        }
        
        // Parse multiple numbers for sequences
        let numbers;
        if (numberPart.includes(' ')) {
          // Space-separated numbers
          numbers = numberPart.split(/\s+/)
            .map(s => parseInt(s))
            .filter(n => !isNaN(n));
        } else {
          // Concatenated - use rapid parsing optimized for volleyball
          numbers = parsePlayerNumbers(numberPart, courtPlayersRef.current);
        }
        
        // Validate players exist
        const validNumbers = numbers.filter(num => 
          courtPlayersRef.current.some(p => parseInt(p.number) === num)
        );
        
        if (validNumbers.length >= 2 && validNumbers.length <= 3) {
          console.log("⚡ Multi-player block sequence:", { numbers: validNumbers, result });
          return {
            type: "block_sequence",
            numbers: validNumbers,
            result: result
          };
        }
      }
      
      // Single player block patterns
      const singleBlockMatch = originalText.match(/^(?:(\d+)\s+block\s+(kill|error|in\s+play)|block\s+(kill|error|in\s+play)\s+(\d+))$/);
      if (singleBlockMatch) {
        const playerNumber = parseInt(singleBlockMatch[1] || singleBlockMatch[4]);
        const result = singleBlockMatch[2] || singleBlockMatch[3];
        
        const player = courtPlayersRef.current.find(p => parseInt(p.number) === playerNumber);
        if (player) {
          console.log("⚡ Single player block (alternate pattern):", { number: playerNumber, result });
          return {
            type: "block_sequence",
            numbers: [playerNumber],
            result: result
          };
        }
      }
    }

    // Simple action words (keep existing context awareness)
    const actions = {
      'ace': { type: 'serve_action', action: 'Ace' },
      'aced': { type: 'serve_action', action: 'Ace' },
      'kill': { type: 'rally_action', action: 'Kill' },
      'killed': { type: 'rally_action', action: 'Kill' },
      'error': { type: 'contextual', action: 'Error' },
      'out': { type: 'rally_action', action: 'Error' },
      'net': { type: 'rally_action', action: 'Error' },
      'in play': { type: 'contextual', action: 'InPlay' },
      'inplay': { type: 'contextual', action: 'InPlay' },
      'imply': { type: 'contextual', action: 'InPlay' },
      'rotate': { type: 'court_action', action: 'rotate' },
      'switch': { type: 'court_action', action: 'switch_serve' },
      'switch serve': { type: 'court_action', action: 'switch_serve' },
      'undo': { type: 'court_action', action: 'undo' },
      'free ball': { type: 'court_action', action: 'free_ball' },
      'replay': { type: 'court_action', action: 'replay' }
    };

    // Check for simple action words with context validation
    for (const [word, command] of Object.entries(actions)) {
      if (originalText === word || originalText.endsWith(word)) {
        // Handle contextual actions that work in both serve and rally
        if (command.type === 'contextual') {
          if (gameState.ballState === 'serve') {
            return {
              type: 'serve_action',
              action: command.action
            };
          } else if (gameState.ballState === 'inplay') {
            return {
              type: 'rally_action', 
              action: command.action
            };
          } else {
            console.log(`❌ Contextual action "${word}" ignored - not in serve or rally state`);
            continue;
          }
        }
        
        // Validate context for specific action types
        if (command.type === 'serve_action' && gameState.ballState !== 'serve') {
          console.log(`❌ Serve action "${word}" ignored - not in serve state`);
          continue;
        }
        if (command.type === 'rally_action' && gameState.ballState !== 'inplay') {
          console.log(`❌ Rally action "${word}" ignored - not in play state`);
          continue;
        }
        return command;
      }
    }

    // Number + action combinations with context validation
    const words = originalText.split(/\s+/);
    if (words.length === 2) {
      const hasNumber = words.find(w => /^\d+$/.test(w));
      const hasAction = words.find(w => actions[w]);
      
      if (hasNumber && hasAction) {
        const playerNumber = parseInt(hasNumber);
        const player = courtPlayersRef.current.find(p => parseInt(p.number) === playerNumber);
        if (player) {
          const slotIndex = courtPlayersRef.current.findIndex(p => p === player);
          const actionData = actions[hasAction];
          
          // Handle contextual actions
          if (actionData.type === 'contextual') {
            let resolvedType;
            if (gameState.ballState === 'serve') {
              resolvedType = 'serve_action';
            } else if (gameState.ballState === 'inplay') {
              resolvedType = 'rally_action';
            } else {
              console.log(`❌ Player contextual action ignored - not in serve or rally state`);
              return null;
            }
            
            return {
              type: "player_action",
              slotIndex,
              player,
              result: actionData.action,
              number: playerNumber
            };
          }
          
          // Validate context for other actions
          if (actionData.type === 'serve_action' && gameState.ballState !== 'serve') {
            console.log(`❌ Player serve action ignored - not in serve state`);
            return null;
          }
          if (actionData.type === 'rally_action' && gameState.ballState !== 'inplay') {
            console.log(`❌ Player rally action ignored - not in play state`);
            return null;
          }
          
          return {
            type: "player_action",
            slotIndex,
            player,
            result: actionData.action,
            number: playerNumber
          };
        }
      }
    }

    console.log("❌ No valid command found for context:", {
      text: originalText,
      ballState: gameState.ballState,
      showServeZoneOverlay: gameState.showServeZoneOverlay,
      showAceTargetModal: gameState.showAceTargetModal,
      blockCirclesVisible: gameState.blockCirclesVisible,
      touchCount: gameState.touches?.length || 0
    });
    return null;
  };

  // ENHANCED: Speech recognition setup optimized for volleyball's rapid pace
  useEffect(() => {
    if (!voiceEnabled) {
      console.log("⚡ Voice disabled - cleaning up");
      if (recognitionRef.current) {
        try {
          isRestartingRef.current = true; // Prevent auto-restart
          recognitionRef.current.stop();
          recognitionRef.current = null;
        } catch (error) {
          console.log("⚡ Error stopping recognition:", error.message);
        }
      }
      setIsListening(false);
      setConnectionStatus("disabled");
      isRestartingRef.current = false;
      consecutiveRestarts.current = 0;
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported");
      setConnectionStatus("not_supported");
      return;
    }

    // Prevent creating multiple recognition instances
    if (recognitionRef.current || isRestartingRef.current) {
      console.log("⚡ Recognition already exists or restarting, skipping setup");
      return;
    }

    console.log("⚡ Setting up rapid voice recognition for volleyball");
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    // OPTIMIZED: Configuration for rapid volleyball sequences
    recognition.continuous = true;
    recognition.interimResults = false; // Final results only for accuracy
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1; // Single best result for speed
    
    // Android tablet specific settings
    if (isAndroidTablet.current) {
      recognition.continuous = false; // Use single-shot mode for Samsung tablets
      console.log("⚡ Using single-shot mode for Android tablet");
    }

    recognition.onstart = () => {
      setIsListening(true);
      setConnectionStatus("connected");
      isRestartingRef.current = false;
      consecutiveRestarts.current = 0;
      console.log("⚡ Rapid voice recognition started for volleyball");
    };

   recognition.onend = () => {
  setIsListening(false);
  console.log("⚡ Voice recognition ended");
  
  // Only auto-restart if voice is still enabled and we haven't been manually stopped
  if (!voiceEnabled || isRestartingRef.current || window.__voiceResultProcessing) {
    console.log("⚡ Not restarting - voice disabled, manual stop, or still processing");
    isRestartingRef.current = false;
    return;
  }
  
  // Check if we've hit the consecutive restart limit
  if (consecutiveRestarts.current >= maxConsecutiveRestarts.current) {
    console.log(`⚡ Too many consecutive restarts (${consecutiveRestarts.current}), pausing auto-restart`);
    setConnectionStatus("failed");
    // Reset after a delay
    setTimeout(() => {
      consecutiveRestarts.current = 0;
    }, 8000); // Increased delay to prevent rapid cycling
    return;
  }
  
  // IMPROVED: More conservative restart timing
  const now = Date.now();
  const timeSinceLastRestart = now - lastRestartTime.current;
  const minRestartDelay = isAndroidTablet.current ? 2000 : 1000; // Increased delays
  
  if (timeSinceLastRestart > minRestartDelay) {
    console.log("⚡ Auto-restart after processing delay");
    isRestartingRef.current = true;
    lastRestartTime.current = now;
    consecutiveRestarts.current += 1;
    
    // Longer restart delay to prevent interference
    const restartDelay = isAndroidTablet.current ? 1500 : 800;
    
    setTimeout(() => {
      if (voiceEnabled && !recognitionRef.current && !window.__voiceResultProcessing) {
        try {
          // Create fresh recognition instance for Samsung tablets
          if (isAndroidTablet.current) {
            const newRecognition = new SpeechRecognition();
            recognitionRef.current = newRecognition;
            newRecognition.continuous = false;
            newRecognition.interimResults = false;
            newRecognition.lang = "en-US";
            newRecognition.maxAlternatives = 1;
            
            // Re-attach event handlers
            newRecognition.onstart = recognition.onstart;
            newRecognition.onend = recognition.onend;
            newRecognition.onresult = recognition.onresult;
            newRecognition.onerror = recognition.onerror;
          }
          
          recognitionRef.current.start();
          console.log("⚡ Voice recognition restarted successfully");
        } catch (error) {
          console.log("⚡ Restart failed:", error.message);
          isRestartingRef.current = false;
          setConnectionStatus("failed");
          consecutiveRestarts.current += 1;
        }
      } else {
        isRestartingRef.current = false;
        console.log("⚡ Restart skipped - conditions not met");
      }
    }, restartDelay);
  } else {
    console.log(`⚡ Restart skipped - too soon (${timeSinceLastRestart}ms ago)`);
    isRestartingRef.current = false;
    consecutiveRestarts.current += 1;
  }
};

recognition.onresult = (event) => {
  const result = event.results[event.results.length - 1];
  if (!result.isFinal) return;

  const transcript = result[0].transcript;
  console.log("⚡ Heard:", transcript);

  // Add processing lock to prevent duplicate command processing
  if (window.__voiceResultProcessing) {
    console.log("⛔ Voice result blocked - already processing");
    return;
  }
  
  window.__voiceResultProcessing = true;
  setTimeout(() => (window.__voiceResultProcessing = false), 500);

  // Show what we heard with reduced display time for volleyball pace
  setLastCommand(transcript);
  if (timeoutRef.current) clearTimeout(timeoutRef.current);
  timeoutRef.current = setTimeout(() => setLastCommand(""), 1500);

  // IMMEDIATE processing - no delays for volleyball pace
  const command = parseSimpleCommand(transcript);
  if (command) {
    console.log("⚡ Executing immediately:", command);
    
    // Add confidence level for better debugging
    command.confidence = result[0].confidence;
    
    try {
      handleCommandRef.current(command);
      console.log("✅ Command executed successfully");
    } catch (error) {
      console.error("❌ Command execution failed:", error);
    }
  } else {
    console.log("⚡ No command found");
  }
  
  // IMPROVED: More conservative restart for Samsung tablets
  if (isAndroidTablet.current && voiceEnabled) {
    // Wait longer before restarting to prevent interference
    setTimeout(() => {
      if (voiceEnabled && !isRestartingRef.current && !window.__voiceResultProcessing) {
        console.log("⚡ Tablet restart after processing complete");
        try {
          recognition.start();
        } catch (error) {
          console.log("⚡ Tablet restart failed:", error.message);
          setConnectionStatus("failed");
        }
      }
    }, 800); // Increased delay to prevent interference
  }
};


    recognition.onerror = (event) => {
      console.log("⚡ Error:", event.error);
      isRestartingRef.current = false;
      
      if (event.error === 'not-allowed') {
        setConnectionStatus("mic_denied");
        return;
      }
      
      if (event.error === 'no-speech') {
        console.log("⚡ No speech detected - normal for rapid volleyball sequences");
        // Don't treat no-speech as a real error
        return;
      }
      
      if (event.error === 'aborted') {
        console.log("⚡ Recognition aborted - likely manual stop");
        setConnectionStatus("disconnected");
        return;
      }
      
      // For other errors, set failed status and allow rapid recovery
      console.log("⚡ Setting status to failed due to error:", event.error);
      setConnectionStatus("failed");
      consecutiveRestarts.current += 1;
      
      // Rapid auto-restart for network errors
      if (voiceEnabled && event.error === 'network') {
        const networkRetryDelay = isAndroidTablet.current ? 2000 : 1000; // Faster recovery
        setTimeout(() => {
          if (voiceEnabled && recognitionRef.current && !isRestartingRef.current) {
            console.log("⚡ Attempting rapid restart after network error");
            try {
              recognition.start();
            } catch (error) {
              console.log("⚡ Network error restart failed:", error.message);
            }
          }
        }, networkRetryDelay);
      }
    };

    // Start recognition
    try {
      recognition.start();
      setConnectionStatus("connecting");
    } catch (error) {
      console.error("⚡ Failed to start:", error);
      setConnectionStatus("failed");
      isRestartingRef.current = false;
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
          console.log("⚡ Stop failed:", error);
        }
        recognitionRef.current = null;
      }
      setIsListening(false);
      setConnectionStatus("disconnected");
      isRestartingRef.current = false;
      consecutiveRestarts.current = 0;
    };
  }, [voiceEnabled]);

  // ENHANCED: Rapid manual restart for volleyball pace
  const manualRestart = () => {
    console.log("⚡ Manual rapid restart requested");
    
    // More frequent manual restarts allowed for volleyball
    const now = Date.now();
    const timeSinceLastRestart = now - lastRestartTime.current;
    const minManualRestartDelay = isAndroidTablet.current ? 2000 : 1000; // Reduced delays
    
    if (timeSinceLastRestart < minManualRestartDelay) {
      console.log(`⚡ Manual restart too soon (${timeSinceLastRestart}ms ago), ignoring`);
      return false;
    }
    
    if (!voiceEnabled) {
      console.log("⚡ Cannot restart - voice commands are disabled");
      return false;
    }
    
    // Reset consecutive restart counter on manual restart
    consecutiveRestarts.current = 0;
    
    // Force cleanup and restart
    isRestartingRef.current = true;
    lastRestartTime.current = now;
    setConnectionStatus("connecting");
    
    // Stop current recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (error) {
        console.log("⚡ Error stopping for manual restart:", error.message);
      }
    }
    
    // Rapid restart for volleyball
    const manualRestartDelay = isAndroidTablet.current ? 1000 : 500;
    setTimeout(() => {
      if (voiceEnabled) {
        // This will trigger the useEffect to set up fresh recognition
        isRestartingRef.current = false;
      }
    }, manualRestartDelay);
    
    return true;
  };

  return {
    isListening,
    lastCommand,
    connectionStatus,
    manualRestart
  };
};

export default useSimpleVoiceCommands;