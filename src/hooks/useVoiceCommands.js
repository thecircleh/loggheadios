import { useEffect } from "react";

const useVoiceCommands = (handleCommand) => {
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript
        .toLowerCase()
        .trim();

      console.log("🎙️ Heard:", transcript);

      const resultWords = ["kill", "error", "ace", "in play", "point", "out"];
      const numbers = transcript.match(/\d+/g)?.map(Number) || [];
      const result = resultWords.find((word) => transcript.includes(word));

      console.log("Parsed numbers:", numbers, "Detected result:", result);

      if (numbers.length >= 2 && result) {
        handleCommand({ type: "sequence", numbers, result, transcript });
      } else {
        handleCommand(transcript); // fallback to simple commands
      }
    };

    recognition.onerror = (event) => {
      console.error("Voice recognition error:", event.error);
    };

    recognition.start();

    return () => {
      recognition.stop();
    };
  }, [handleCommand]);
};

export default useVoiceCommands;
