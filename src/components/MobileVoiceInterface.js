import React from 'react';

const MobileVoiceInterface = ({ 
  voiceEnabled, 
  setVoiceEnabled, 
  isListening, 
  lastCommand, 
  connectionStatus, 
  manualRestart, 
  isMobile,
  gameState,
  isSubscriber,
  user 
}) => {
  const hasVoiceAccess = isSubscriber || user?.role === 'admin';
  
  const getVoiceStatus = () => {
    if (!hasVoiceAccess) {
      return { 
        text: "Voice Logging", 
        color: "#FF3B30", 
        icon: "🎙", 
        description: "Requires subscription" 
      };
    }
    
    if (!voiceEnabled) {
      return { 
        text: "Off", 
        color: "#8E8E93", 
        icon: "🎙️", 
        description: "Tap to enable voice commands" 
      };
    }
    
    if (connectionStatus === "connecting") {
      return { 
        text: "Starting", 
        color: "#FF9500", 
        icon: "⏳", 
        description: "Initializing microphone..." 
      };
    }
    
    if (connectionStatus === "mic_denied") {
      return { 
        text: "Mic Blocked", 
        color: "#FF3B30", 
        icon: "🚫", 
        description: "Please allow microphone access" 
      };
    }
    
    if (connectionStatus === "failed") {
      return { 
        text: isMobile ? "Tap to Retry" : "Failed", 
        color: "#FF3B30", 
        icon: "⚠️", 
        description: isMobile ? "Voice session ended" : "Connection failed" 
      };
    }
    
    if (connectionStatus === "disconnected") {
      return { 
        text: isMobile ? "Tap to Start" : "Disconnected", 
        color: "#8E8E93", 
        icon: "🎙️", 
        description: isMobile ? "Tap to listen for commands" : "Voice commands inactive" 
      };
    }
    
    if (isListening) {
      return { 
        text: "Listening", 
        color: "#34C759", 
        icon: "🔴", 
        description: isMobile ? "Speak now, then tap again" : "Voice recognition active" 
      };
    }
    
    return { 
      text: "Ready", 
      color: "#007AFF", 
      icon: "🎙️", 
      description: "Voice commands enabled" 
    };
  };

  const getContextualHints = () => {
    if (!voiceEnabled || !hasVoiceAccess) {
      if (!hasVoiceAccess) {
        return "Subscribe to unlock voice commands!";
      } else {
        return "Click to enable voice commands!";
      }
    }
    
    if (connectionStatus === "mic_denied") {
      return "Please allow microphone access in browser settings";
    }
    
    if (connectionStatus === "failed" || connectionStatus === "disconnected") {
      return isMobile ? "Tap the microphone to start listening" : "Click to reconnect voice commands";
    }
    
    if (!gameState) {
      return "Voice commands ready";
    }
    
    // Context-specific hints based on game state
    if (gameState.showErrorTypeModal) {
      return "Say: 'out', 'net', or 'foot fault'";
    } else if (gameState.showAceTargetModal) {
      return "Say: player's number or 'unsure'";
    } else if (gameState.showServeZoneOverlay) {
      return "Say: zone number, 'unsure', 'out', 'net', or 'foot fault'";
    } else if (gameState.ballState === "serve") {
      if (gameState.currentServeSide === "our") {
        return "Say: 'ace', 'error', or 'in play'";
      } else {
        return "Say: player number who received serve";
      }
    } else if (gameState.ballState === "inplay") {
      if (gameState.blockCirclesVisible) {
        return "Say: 'block kill', 'block error', or player numbers";
      } else {
        return "Say: player numbers, 'kill', 'error', or 'in play'";
      }
    }
    
    return "Say: 'rotate', 'switch serve', or 'undo'";
  };

  const handleVoiceButtonClick = () => {
    if (!hasVoiceAccess) {
      // Could trigger subscription modal here
      return;
    }
    
    if (!voiceEnabled) {
      setVoiceEnabled(true);
    } else if (connectionStatus === "failed" || connectionStatus === "disconnected" || !isListening) {
      // On mobile or when disconnected, clicking should restart
      if (isMobile || connectionStatus !== "connected") {
        manualRestart();
      } else {
        setVoiceEnabled(false);
      }
    } else {
      // Currently listening - clicking should toggle off
      setVoiceEnabled(false);
    }
  };

  const voiceStatus = getVoiceStatus();

  return (
    <div
      style={{
        position: "absolute",
        top: "150px",
        left: "3px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        zIndex: 100000
      }}
    >
      {/* Voice Command Display */}
      {lastCommand && (
        <div
          style={{
            backgroundColor: "#34C759",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "600",
            maxWidth: "200px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            animation: "fadeInOut 3s ease-in-out",
          }}
        >
          {lastCommand}
        </div>
      )}

      {/* Main Voice Button */}
      <button
        onClick={handleVoiceButtonClick}
        style={{
          width: isMobile ? "70px" : "60px",
          height: isMobile ? "70px" : "60px",
          borderRadius: "50%",
          backgroundColor: voiceStatus.color,
          border: "none",
          color: "#fff",
          fontSize: isMobile ? "28px" : "24px",
          fontWeight: "bold",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          transition: "all 0.3s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Add pulsing animation when listening on mobile
          animation: (isMobile && isListening) ? "pulse 2s infinite" : "none",
        }}
        title={voiceStatus.description}
      >
        {voiceStatus.icon}
      </button>

      {/* Status Text */}
      <div style={{ 
        fontSize: isMobile ? "11px" : "10px", 
        color: "#555",
        fontWeight: "600",
        textAlign: "center",
        maxWidth: "100px"
      }}>
        {voiceStatus.text}
      </div>

      {/* Context Hints */}
      <div
        style={{
          backgroundColor: "rgba(0,0,0,0.8)",
          color: "#fff",
          padding: isMobile ? "8px 12px" : "6px 10px",
          borderRadius: "12px",
          fontSize: isMobile ? "11px" : "10px",
          maxWidth: isMobile ? "140px" : "100px",
          textAlign: "center",
          lineHeight: "1.2"
        }}
      >
        {getContextualHints()}
      </div>

      {/* Mobile-specific help text */}
      {isMobile && voiceEnabled && (
        <div
          style={{
            backgroundColor: "rgba(255,153,0,0.9)",
            color: "#fff",
            padding: "6px 8px",
            borderRadius: "8px",
            fontSize: "9px",
            maxWidth: "120px",
            textAlign: "center",
            lineHeight: "1.1",
            marginTop: "4px"
          }}
        >
          📱 Tap mic after each command
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        
        @keyframes fadeInOut {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1); }
          80% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
};

export default MobileVoiceInterface;