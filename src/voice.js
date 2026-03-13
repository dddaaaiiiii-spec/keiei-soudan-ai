export function isSpeechRecognitionAvailable() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function startSpeechRecognition({ lang = 'ja-JP', onResult, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError?.('このブラウザでは音声入力を利用できません（Chrome推奨）。');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || '';
    onResult?.(transcript);
  };

  recognition.onerror = () => {
    onError?.('音声認識に失敗しました。マイク設定をご確認ください。');
  };

  recognition.start();
  return recognition;
}
