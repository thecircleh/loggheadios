import { useEffect, useRef, useState } from "react";
import { createHash, createHmac } from 'crypto';

const useDirectTranscribeVoiceCommands = (
  handleCommand, 
  courtPlayers, 
  voiceEnabled, 
  gameState = {},
  transcriptionTier = 'FREE',
  awsConfig = null,
  onUsageUpdate = null
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
  
  // Direct API refs
  const transcribeConnectionRef = useRef(null);
  const audioStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const usageStartTimeRef = useRef(null);
  const audioContextRef = useRef(null);
  const micStreamRef = useRef(null);

  // AWS Signature V4 signing
  const createSignature = (method, uri, headers, payload, credentials, region, service) => {
    const algorithm = 'AWS4-HMAC-SHA256';
    const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = date.substr(0, 8);
    
    // Create canonical request
    const canonicalUri = uri;
    const canonicalQuerystring = '';
    
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key]}\n`)
      .join('');
    
    const signedHeaders = Object.keys(headers)
      .map(key => key.toLowerCase())
      .sort()
      .join(';');
    
    const payloadHash = payload === 'STREAMING-AWS4-HMAC-SHA256-EVENTS' 
      ? payload 
      : createHash('sha256').update(payload || '').digest('hex');
    
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    
    // Create string to sign
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      date,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');
    
    // Calculate signature
    const kDate = createHmac('sha256', `AWS4${credentials.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update(service).digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    
    // Create authorization header
    const authorization = `${algorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    return {
      authorization,
      date,
      payloadHash
    };
  };

  // Event stream encoder for AWS
  const encodeEventStreamMessage = (payload, messageType = 'event') => {
    const headers = {
      ':message-type': { type: 'string', value: messageType },
      ':event-type': { type: 'string', value: 'AudioEvent' }
    };
    
    // Encode headers
    let headersBuf = Buffer.alloc(0);
    for (const [name, header] of Object.entries(headers)) {
      const nameBuffer = Buffer.from(name, 'utf8');
      const valueBuf = Buffer.from(header.value, 'utf8');
      
      const headerBuf = Buffer.concat([
        Buffer.from([nameBuffer.length]), // name length
        nameBuffer,
        Buffer.from([7]), // value type (string = 7)
        Buffer.from([valueBuf.length >> 8, valueBuf.length & 0xFF]), // value length
        valueBuf
      ]);
      
      headersBuf = Buffer.concat([headersBuf, headerBuf]);
    }
    
    const payloadBuf = Buffer.from(payload);
    const preludeCrc = 0; // Simplified - should calculate CRC32
    const messageCrc = 0; // Simplified - should calculate CRC32
    
    // Create message
    const totalLength = 16 + headersBuf.length + payloadBuf.length;
    const headersLength = headersBuf.length;
    
    const message = Buffer.concat([
      Buffer.from([
        (totalLength >> 24) & 0xFF,
        (totalLength >> 16) & 0xFF,
        (totalLength >> 8) & 0xFF,
        totalLength & 0xFF
      ]),
      Buffer.from([
        (headersLength >> 24) & 0xFF,
        (headersLength >> 16) & 0xFF,
        (headersLength >> 8) & 0xFF,
        headersLength & 0xFF
      ]),
      Buffer.from([
        (preludeCrc >> 24) & 0xFF,
        (preludeCrc >> 16) & 0xFF,
        (preludeCrc >> 8) & 0xFF,
        preludeCrc & 0xFF
      ]),
      headersBuf,
      payloadBuf,
      Buffer.from([
        (messageCrc >> 24) & 0xFF,
        (messageCrc >> 16) & 0xFF,
        (messageCrc >> 8) & 0xFF,
        messageCrc & 0xFF
      ])
    ]);
    
    return message;
  };

  // Parse event stream response
  const parseEventStreamResponse = (buffer) => {
    let offset = 0;
    const messages = [];
    
    while (offset < buffer.length) {
      if (offset + 12 > buffer.length) break;
      
      const totalLength = buffer.readUInt32BE(offset);
      const headersLength = buffer.readUInt32BE(offset + 4);
      
      if (offset + totalLength > buffer.length) break;
      
      const payloadOffset = offset + 12 + headersLength;
      const payloadLength = totalLength - 16 - headersLength;
      
      if (payloadLength > 0) {
        const payload = buffer.slice(payloadOffset, payloadOffset + payloadLength);
        try {
          const message = JSON.parse(payload.toString('utf8'));
          messages.push(message);
        } catch (error) {
          console.warn('Failed to parse event stream message:', error);
        }
      }
      
      offset += totalLength;
    }
    
    return messages;
  };

  // Start direct AWS Transcribe connection
  const startDirectTranscription = async () => {
    if (!awsConfig || !awsConfig.credentials) {
      console.error("🎙️ AWS credentials required for direct transcription");
      return false;
    }

    try {
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      micStreamRef.current = stream;
      usageStartTimeRef.current = Date.now();

      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // Prepare request headers
      const region = awsConfig.region || 'us-east-1';
      const service = 'transcribe';
      const host = `transcribestreaming.${region}.amazonaws.com`;
      const uri = '/stream-transcription';
      
      const headers = {
        'Host': host,
        'Content-Type': 'application/vnd.amazon.eventstream',
        'X-Amz-Target': 'com.amazonaws.transcribe.Transcribe.StartStreamTranscription',
        'X-Amz-Content-Sha256': 'STREAMING-AWS4-HMAC-SHA256-EVENTS',
        'X-Amz-Transcribe-Language-Code': 'en-US',
        'X-Amz-Transcribe-Sample-Rate': '16000',
        'Transfer-Encoding': 'chunked'
      };

      // Add session token if available
      if (awsConfig.credentials.sessionToken) {
        headers['X-Amz-Security-Token'] = awsConfig.credentials.sessionToken;
      }

      // Sign the request
      const signatureData = createSignature(
        'POST',
        uri,
        headers,
        'STREAMING-AWS4-HMAC-SHA256-EVENTS',
        awsConfig.credentials,
        region,
        service
      );

      headers['Authorization'] = signatureData.authorization;
      headers['X-Amz-Date'] = signatureData.date;

      // Create WebSocket connection (for browser compatibility)
      // Note: Direct HTTP/2 streaming isn't available in browsers
      // We'll use WebSocket endpoint instead
      const wsUrl = `wss://transcribestreaming.${region}.amazonaws.com:8443/stream-transcription-websocket`;
      
      const websocket = new WebSocket(wsUrl);
      transcribeConnectionRef.current = websocket;

      websocket.onopen = () => {
        console.log("🎙️ Direct AWS Transcribe WebSocket connected");
        setIsListening(true);
        setConnectionStatus("connected");

        // Send initial request
        const requestMessage = JSON.stringify({
          action: 'start',
          'language-code': 'en-US',
          'sample-rate': 16000,
          'audio-encoding': 'pcm'
        });
        
        websocket.send(requestMessage);
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.Transcript && message.Transcript.Results) {
            for (const result of message.Transcript.Results) {
              if (!result.IsPartial && result.Alternatives && result.Alternatives.length > 0) {
                const transcript = result.Alternatives[0].Transcript;
                console.log("🎙️ Direct AWS Transcribe heard:", transcript);
                
                // Show what we heard
                setLastCommand(transcript);
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => setLastCommand(""), 2000);

                // Parse and execute command
                const command = parseSimpleCommand(transcript);
                if (command) {
                  console.log("✅ Executing direct AWS command:", command);
                  handleCommandRef.current(command);
                } else {
                  console.log("❌ No direct AWS command found");
                }
              }
            }
          }
        } catch (error) {
          console.error("🎙️ Error parsing WebSocket message:", error);
        }
      };

      websocket.onerror = (error) => {
        console.error("🎙️ Direct AWS Transcribe WebSocket error:", error);
        setConnectionStatus("failed");
      };

      websocket.onclose = () => {
        console.log("🎙️ Direct AWS Transcribe WebSocket closed");
        setIsListening(false);
        setConnectionStatus("disconnected");
      };

      // Process audio and send to WebSocket
      processor.onaudioprocess = (event) => {
        if (websocket.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array for AWS
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          
          // Send audio chunk
          const audioMessage = JSON.stringify({
            action: 'audio',
            'audio-chunk': Array.from(pcmData)
          });
          
          websocket.send(audioMessage);
        }
      };
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      audioStreamRef.current = {
        stop: () => {
          if (processor) processor.disconnect();
          if (source) source.disconnect();
        }
      };

      return true;
      
    } catch (error) {
      console.error("🎙️ Direct AWS Transcribe start error:", error);
      setConnectionStatus("failed");
      return false;
    }
  };

  // Alternative HTTP/2 approach for server-side implementation
  const createHTTP2TranscribeRequest = (credentials, region = 'us-east-1') => {
    const host = `transcribestreaming.${region}.amazonaws.com`;
    const uri = '/stream-transcription';
    
    const headers = {
      ':method': 'POST',
      ':path': uri,
      ':scheme': 'https',
      ':authority': host,
      'content-type': 'application/vnd.amazon.eventstream',
      'x-amz-target': 'com.amazonaws.transcribe.Transcribe.StartStreamTranscription',
      'x-amz-content-sha256': 'STREAMING-AWS4-HMAC-SHA256-EVENTS',
      'x-amz-transcribe-language-code': 'en-US',
      'x-amz-transcribe-sample-rate': '16000',
      'transfer-encoding': 'chunked'
    };

    if (credentials.sessionToken) {
      headers['x-amz-security-token'] = credentials.sessionToken;
    }

    const signatureData = createSignature(
      'POST',
      uri,
      headers,
      'STREAMING-AWS4-HMAC-SHA256-EVENTS',
      credentials,
      region,
      'transcribe'
    );

    headers['authorization'] = signatureData.authorization;
    headers['x-amz-date'] = signatureData.date;

    return {
      host,
      port: 443,
      headers,
      method: 'POST',
      path: uri
    };
  };

  // Stop direct transcription
  const stopDirectTranscription = () => {
    try {
      // Calculate usage
      if (usageStartTimeRef.current) {
        const usageMs = Date.now() - usageStartTimeRef.current;
        const usageMinutes = usageMs / (1000 * 60);
        if (onUsageUpdate) onUsageUpdate(usageMinutes);
        setUsageMinutes(prev => prev + usageMinutes);
        usageStartTimeRef.current = null;
      }

      // Close WebSocket connection
      if (transcribeConnectionRef.current) {
        if (transcribeConnectionRef.current.readyState === WebSocket.OPEN) {
          transcribeConnectionRef.current.send(JSON.stringify({ action: 'stop' }));
        }
        transcribeConnectionRef.current.close();
        transcribeConnectionRef.current = null;
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
      console.log("🎙️ Direct AWS Transcribe stopped");
      
    } catch (error) {
      console.error("🎙️ Error stopping direct AWS Transcribe:", error);
    }
  };

  // Your existing parsing functions (parseSimpleCommand, etc.) go here
  // [Include all your existing parsing logic from the original file]
  
  const parseSimpleCommand = (transcript) => {
    // Your existing parseSimpleCommand implementation
    const originalText = transcript.toLowerCase().trim();
    const gameState = gameStateRef.current;
    
    console.log("🎙️ Processing direct API command:", originalText, {
      tier: tier,
      connectionType: "direct-websocket"
    });

    // [Rest of your parsing logic]
    
    return null; // Placeholder - include your full parsing logic
  };

  // Main effect for voice recognition
  useEffect(() => {
    if (!voiceEnabled) {
      console.log("🎙️ Voice disabled - cleaning up");
      
      if (tier === 'PREMIUM') {
        stopDirectTranscription();
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
    if (tier === 'PREMIUM') {
      startDirectTranscription();
    } else {
      // Your existing Web Speech API logic
      console.log("🎙️ Starting Web Speech API (fallback)");
    }

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      if (tier === 'PREMIUM') {
        stopDirectTranscription();
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
  }, [voiceEnabled, tier]);

  // Tier switching
  const switchTier = async (newTier) => {
    console.log(`🎙️ Switching from ${tier} to ${newTier}`);
    
    // Stop current recognition
    if (tier === 'PREMIUM') {
      stopDirectTranscription();
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
        if (newTier === 'PREMIUM') {
          startDirectTranscription();
        } else {
          // Start Web Speech API
          console.log("🎙️ Starting Web Speech API");
        }
      }
    }, 1000);
  };

  const manualRestart = () => {
    console.log("🎙️ Manual restart requested for direct API");
    
    if (!voiceEnabled) {
      console.log("🎙️ Cannot restart - voice commands are disabled");
      return false;
    }
    
    setConnectionStatus("connecting");
    
    // Stop current service
    if (tier === 'PREMIUM') {
      stopDirectTranscription();
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (error) {
        console.log("🎙️ Error stopping for manual restart:", error.message);
      }
    }
    
    setTimeout(() => {
      if (voiceEnabled) {
        if (tier === 'PREMIUM') {
          startDirectTranscription();
        } else {
          console.log("🎙️ Restarting Web Speech API");
        }
      }
    }, 1000);
    
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
    isPremium: tier === 'PREMIUM',
    canUpgrade: tier === 'FREE' && awsConfig,
    accuracyLevel: tier === 'PREMIUM' ? 'High (95%+)' : 'Standard (80%+)',
    connectionType: tier === 'PREMIUM' ? 'Direct WebSocket' : 'Web Speech API'
  };
};

export default useDirectTranscribeVoiceCommands;